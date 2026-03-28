from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from .ai import CohereConfigurationError, CohereServiceError, extract_text_from_page_images

PDF_TEXT_MIN_WORDS = int(os.getenv("PDF_TEXT_MIN_WORDS", "80"))
AI_OCR_PAGE_BATCH_SIZE = int(os.getenv("AI_OCR_PAGE_BATCH_SIZE", "5"))


class PDFDocumentProcessingError(RuntimeError):
    pass


def is_pdf_url(value: str | None) -> bool:
    if not value:
        return False

    try:
        parsed = urlparse(value)
    except ValueError:
        return False

    if parsed.scheme.lower() != "https":
        return False

    return bool(re.search(r"\.pdf(?:$|[?#])", parsed.path, re.IGNORECASE))


def resolve_bill_pdf_url(full_text_url: str | None = None, parliament_url: str | None = None) -> str | None:
    for candidate in (full_text_url, parliament_url):
        if is_pdf_url(candidate):
            return candidate
    return None


def _request_headers() -> dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0 (compatible; BungeMkononiBot/1.0)",
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    }


def _build_pdf_source_fingerprint(source_url: str, *, etag: str = "", last_modified: str = "", content_length: str = "") -> str:
    normalized_parts = {
        "source_url": str(source_url or "").strip(),
        "etag": str(etag or "").strip(),
        "last_modified": str(last_modified or "").strip(),
        "content_length": str(content_length or "").strip(),
    }
    if not any(
        [
            normalized_parts["etag"],
            normalized_parts["last_modified"],
            normalized_parts["content_length"],
        ]
    ):
        return ""
    return hashlib.sha256(json.dumps(normalized_parts, sort_keys=True).encode("utf-8")).hexdigest()


def fetch_pdf_source_fingerprint(source_url: str, timeout: int = 30) -> str:
    try:
        response = requests.head(
            source_url,
            headers=_request_headers(),
            timeout=timeout,
            allow_redirects=True,
        )
    except requests.RequestException:
        return ""

    if response.status_code >= 400:
        return ""

    return _build_pdf_source_fingerprint(
        response.url or source_url,
        etag=response.headers.get("ETag", ""),
        last_modified=response.headers.get("Last-Modified", ""),
        content_length=response.headers.get("Content-Length", ""),
    )


def _download_pdf(source_url: str, timeout: int = 60) -> tuple[Path, str]:
    try:
        response = requests.get(
            source_url,
            headers=_request_headers(),
            timeout=timeout,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise PDFDocumentProcessingError(f"Unable to download PDF: {exc}") from exc

    if "pdf" not in (response.headers.get("content-type") or "").lower() and not response.content.startswith(b"%PDF"):
        raise PDFDocumentProcessingError("The source URL did not return a PDF document.")

    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        temp_file.write(response.content)
    finally:
        temp_file.close()

    content_fingerprint = hashlib.sha256(response.content).hexdigest()
    return Path(temp_file.name), content_fingerprint


def _run_command(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout)
    except FileNotFoundError as exc:
        raise PDFDocumentProcessingError(f"Required command not found: {args[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise PDFDocumentProcessingError(f"Command timed out: {args[0]}") from exc


def _extract_pdf_page_count(pdf_path: Path) -> int:
    result = _run_command(["pdfinfo", str(pdf_path)])
    if result.returncode != 0:
        raise PDFDocumentProcessingError(result.stderr.strip() or "Unable to inspect PDF metadata.")

    match = re.search(r"^Pages:\s+(\d+)$", result.stdout, re.MULTILINE)
    if not match:
        return 0
    return int(match.group(1))


def _extract_pdf_text(pdf_path: Path) -> str:
    result = _run_command(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"])
    if result.returncode != 0:
        raise PDFDocumentProcessingError(result.stderr.strip() or "Unable to extract text from PDF.")
    return result.stdout or ""


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"[ \t]+", " ", value.replace("\r\n", "\n").replace("\r", "\n")).strip()


def _count_words(value: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", value))


def _strip_page_noise(line: str) -> str:
    cleaned = _normalize_whitespace(line)
    if not cleaned:
        return ""
    if re.fullmatch(r"\d+", cleaned):
        return ""
    if re.fullmatch(r"page\s+\d+(\s+of\s+\d+)?", cleaned, re.IGNORECASE):
        return ""
    return cleaned


def _looks_like_heading(line: str) -> bool:
    cleaned = _normalize_whitespace(line)
    if not cleaned or len(cleaned) > 140:
        return False

    word_count = len(cleaned.split())
    if word_count > 14:
        return False

    if cleaned.isupper() and any(ch.isalpha() for ch in cleaned):
        return True

    if re.match(r"^(PART|CHAPTER|SCHEDULE|ANNEX|SECTION)\b", cleaned, re.IGNORECASE):
        return True

    if re.match(r"^\d+(\.\d+)*\s+[A-Z]", cleaned):
        return True

    if cleaned.endswith(":") and word_count <= 8:
        return True

    return False


def _heading_level(line: str) -> int:
    cleaned = _normalize_whitespace(line)
    if re.match(r"^(PART|CHAPTER|SCHEDULE)\b", cleaned, re.IGNORECASE):
        return 1
    if cleaned.isupper():
        return 2
    return 3


def _looks_like_list_item(line: str) -> bool:
    cleaned = _normalize_whitespace(line)
    return bool(
        re.match(r"^(\(?\d+\)?[\.)]|[a-zA-Z][\.)]|[-•])\s+", cleaned)
    )


def _strip_list_marker(line: str) -> str:
    cleaned = _normalize_whitespace(line)
    cleaned = re.sub(r"^(\(?\d+\)?[\.)]|[a-zA-Z][\.)]|[-•])\s+", "", cleaned)
    return cleaned.strip()


def _structure_page_text(raw_page_text: str, page_number: int) -> dict[str, Any]:
    lines = [_strip_page_noise(line) for line in raw_page_text.splitlines()]
    lines = [line for line in lines if line]

    blocks: list[dict[str, Any]] = []
    paragraph_parts: list[str] = []
    list_items: list[str] = []

    def flush_paragraph() -> None:
        if paragraph_parts:
            paragraph = _normalize_whitespace(" ".join(paragraph_parts))
            if paragraph:
                blocks.append({"type": "paragraph", "text": paragraph})
            paragraph_parts.clear()

    def flush_list() -> None:
        if list_items:
            blocks.append({"type": "list", "items": list(list_items)})
            list_items.clear()

    for line in lines:
        if _looks_like_heading(line):
            flush_paragraph()
            flush_list()
            blocks.append({
                "type": "heading",
                "text": _normalize_whitespace(line),
                "level": _heading_level(line),
            })
            continue

        if _looks_like_list_item(line):
            flush_paragraph()
            list_items.append(_strip_list_marker(line))
            continue

        if list_items:
            flush_list()
        paragraph_parts.append(line)

    flush_paragraph()
    flush_list()

    return {
        "pageNumber": page_number,
        "blocks": blocks,
    }


def _structure_pages_from_text(extracted_text: str, page_count: int) -> list[dict[str, Any]]:
    raw_pages = extracted_text.split("\f") if extracted_text else []
    pages: list[dict[str, Any]] = []

    if not raw_pages:
        return pages

    for index, raw_page_text in enumerate(raw_pages, start=1):
        normalized_page_text = _normalize_whitespace(raw_page_text)
        if not normalized_page_text:
            continue
        pages.append(_structure_page_text(raw_page_text, index))

    if page_count and len(pages) < page_count and len(raw_pages) == 1:
        # Some tools collapse all pages into a single chunk. Preserve it as a single page rather than
        # pretending we have page-by-page structure.
        return [_structure_page_text(extracted_text, 1)]

    return pages


def _ocr_pdf_with_ocrmypdf(pdf_path: Path) -> str:
    if not shutil.which("ocrmypdf"):
        raise PDFDocumentProcessingError("OCRmyPDF is not installed.")

    with tempfile.TemporaryDirectory(prefix="bunge-pdf-ocrpdf-") as temp_dir:
        output_pdf = Path(temp_dir) / "ocr.pdf"
        result = _run_command(
            [
                "ocrmypdf",
                "--quiet",
                "--skip-text",
                "--force-ocr",
                str(pdf_path),
                str(output_pdf),
            ],
            timeout=600,
        )

        if result.returncode != 0 or not output_pdf.exists():
            raise PDFDocumentProcessingError(result.stderr.strip() or "OCRmyPDF failed to process the PDF.")

        return _extract_pdf_text(output_pdf)


def _render_pdf_pages_to_pngs(pdf_path: Path) -> list[tuple[int, bytes]]:
    if not shutil.which("pdftoppm"):
        raise PDFDocumentProcessingError("pdftoppm is not installed.")

    with tempfile.TemporaryDirectory(prefix="bunge-pdf-pages-") as temp_dir:
        output_prefix = Path(temp_dir) / "page"
        result = _run_command(
            [
                "pdftoppm",
                "-png",
                "-r",
                "180",
                str(pdf_path),
                str(output_prefix),
            ],
            timeout=600,
        )
        if result.returncode != 0:
            raise PDFDocumentProcessingError(result.stderr.strip() or "Unable to render PDF pages into images.")

        image_files = sorted(
            Path(temp_dir).glob("page-*.png"),
            key=lambda path: int(re.search(r"-(\d+)$", path.stem).group(1)) if re.search(r"-(\d+)$", path.stem) else 0,
        )
        if not image_files:
            raise PDFDocumentProcessingError("No page images were rendered from the PDF.")

        pages: list[tuple[int, bytes]] = []
        for image_file in image_files:
            match = re.search(r"-(\d+)$", image_file.stem)
            if not match:
                continue
            page_number = int(match.group(1))
            pages.append((page_number, image_file.read_bytes()))

        if not pages:
            raise PDFDocumentProcessingError("Rendered PDF images could not be indexed by page number.")
        return pages


def _structure_pages_from_ai_extraction(extracted_pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    for item in extracted_pages:
        try:
            page_number = int(item.get("pageNumber"))
        except (TypeError, ValueError):
            continue
        page_text = str(item.get("text") or "").strip()
        if not page_text:
            pages.append({"pageNumber": page_number, "blocks": []})
            continue
        pages.append(_structure_page_text(page_text, page_number))
    return pages


def _extract_pdf_text_with_ai_vision(pdf_path: Path) -> tuple[str, list[dict[str, Any]]]:
    try:
        page_images = _render_pdf_pages_to_pngs(pdf_path)
    except PDFDocumentProcessingError:
        raise

    extracted_page_items: list[dict[str, Any]] = []
    for index in range(0, len(page_images), AI_OCR_PAGE_BATCH_SIZE):
        batch = page_images[index : index + AI_OCR_PAGE_BATCH_SIZE]
        try:
            extracted_page_items.extend(extract_text_from_page_images(batch))
        except (CohereConfigurationError, CohereServiceError) as exc:
            raise PDFDocumentProcessingError(str(exc)) from exc

    if not extracted_page_items:
        raise PDFDocumentProcessingError("Cohere Vision returned no readable page text.")

    page_text_map = {
        int(item["pageNumber"]): str(item.get("text") or "")
        for item in extracted_page_items
        if item.get("pageNumber") is not None
    }
    ordered_pages = [
        {"pageNumber": page_number, "text": page_text_map.get(page_number, "")}
        for page_number, _image_bytes in page_images
    ]
    extracted_text = "\f".join(str(page.get("text") or "") for page in ordered_pages)
    return extracted_text, ordered_pages


def analyze_pdf_document(source_url: str, timeout: int = 60) -> dict[str, Any]:
    pdf_path: Path | None = None
    try:
        remote_fingerprint = fetch_pdf_source_fingerprint(source_url, timeout=min(timeout, 30))
        pdf_path, content_fingerprint = _download_pdf(source_url, timeout=timeout)
        source_fingerprint = remote_fingerprint or content_fingerprint
        page_count = _extract_pdf_page_count(pdf_path)
        extracted_text = _extract_pdf_text(pdf_path)
        normalized_text = _normalize_whitespace(extracted_text.replace("\f", " \f "))
        word_count = _count_words(normalized_text)

        if word_count >= PDF_TEXT_MIN_WORDS:
            return {
                "status": "ready",
                "method": "text",
                "sourceUrl": source_url,
                "text": normalized_text,
                "pages": _structure_pages_from_text(extracted_text, page_count),
                "pageCount": page_count,
                "wordCount": word_count,
                "error": "",
                "sourceFingerprint": source_fingerprint,
            }

        ai_error = ""
        try:
            ai_text, ai_pages = _extract_pdf_text_with_ai_vision(pdf_path)
            ai_normalized_text = _normalize_whitespace(ai_text.replace("\f", " \f "))
            ai_word_count = _count_words(ai_normalized_text)
            if ai_word_count > 0:
                return {
                    "status": "ready",
                    "method": "ai",
                    "sourceUrl": source_url,
                    "text": ai_normalized_text,
                    "pages": _structure_pages_from_ai_extraction(ai_pages),
                    "pageCount": page_count,
                    "wordCount": ai_word_count,
                    "error": "",
                    "sourceFingerprint": source_fingerprint,
                }
            ai_error = "Cohere Vision returned no readable text."
        except PDFDocumentProcessingError as exc:
            ai_error = str(exc)

        ocr_error = ""
        if shutil.which("ocrmypdf"):
            try:
                ocr_text = _ocr_pdf_with_ocrmypdf(pdf_path)
                ocr_normalized_text = _normalize_whitespace(ocr_text.replace("\f", " \f "))
                ocr_word_count = _count_words(ocr_normalized_text)
                if ocr_word_count > 0:
                    return {
                        "status": "ready",
                        "method": "ocr",
                        "sourceUrl": source_url,
                        "text": ocr_normalized_text,
                        "pages": _structure_pages_from_text(ocr_text, page_count),
                        "pageCount": page_count,
                        "wordCount": ocr_word_count,
                        "error": "",
                        "sourceFingerprint": source_fingerprint,
                    }
                ocr_error = "OCRmyPDF returned no readable text."
            except PDFDocumentProcessingError as exc:
                ocr_error = str(exc)
        else:
            ocr_error = "OCRmyPDF is not installed."

        return {
            "status": "needs_ocr",
            "method": "",
            "sourceUrl": source_url,
            "text": normalized_text,
            "pages": _structure_pages_from_text(extracted_text, page_count),
            "pageCount": page_count,
            "wordCount": word_count,
            "error": "; ".join(error for error in [ai_error, ocr_error] if error),
            "sourceFingerprint": source_fingerprint,
        }
    except PDFDocumentProcessingError as exc:
        return {
            "status": "failed",
            "method": "",
            "sourceUrl": source_url,
            "text": "",
            "pages": [],
            "pageCount": 0,
            "wordCount": 0,
            "error": str(exc),
            "sourceFingerprint": "",
        }
    finally:
        if pdf_path is not None:
            try:
                pdf_path.unlink(missing_ok=True)
            except OSError:
                pass
