from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from dataclasses import dataclass
from typing import Any

import requests
from django.conf import settings

from .models import Bill


SUMMARY_SELECTION_QUERY = (
    "Find the passages that best explain what this Kenyan bill changes, who it affects, "
    "the main obligations or powers it creates, and any timelines, taxes, penalties, or implementation details."
)


class CohereConfigurationError(RuntimeError):
    pass


class CohereServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class BillContextExcerpt:
    page_number: int | None
    text: str
    score: float


def cohere_enabled() -> bool:
    return bool(str(getattr(settings, "COHERE_API_KEY", "") or "").strip())


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _cohere_headers() -> dict[str, str]:
    api_key = str(getattr(settings, "COHERE_API_KEY", "") or "").strip()
    if not api_key:
        raise CohereConfigurationError("Cohere is not configured. Set COHERE_API_KEY to enable AI features.")

    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-Client-Name": "bunge-mkononi",
    }


def _cohere_timeout(timeout: int | None = None) -> int:
    raw_timeout = timeout if timeout is not None else getattr(settings, "COHERE_REQUEST_TIMEOUT", 30)
    try:
        return max(int(raw_timeout or 30), 1)
    except (TypeError, ValueError):
        return 30


def _cohere_retry_count(max_retries: int | None = None) -> int:
    raw_retries = max_retries if max_retries is not None else getattr(settings, "COHERE_REQUEST_MAX_RETRIES", 2)
    try:
        return max(int(raw_retries or 0), 0)
    except (TypeError, ValueError):
        return 0


def _cohere_retry_base_delay(retry_base_delay: float | None = None) -> float:
    raw_delay = (
        retry_base_delay
        if retry_base_delay is not None
        else getattr(settings, "COHERE_REQUEST_RETRY_BASE_DELAY", 1.0)
    )
    try:
        return max(float(raw_delay or 0), 0.0)
    except (TypeError, ValueError):
        return 0.0


def _should_retry_status(status_code: int) -> bool:
    return status_code in {408, 429, 500, 502, 503, 504}


def _sleep_before_retry(attempt: int, base_delay: float) -> None:
    if base_delay <= 0:
        return
    time.sleep(base_delay * (2**attempt))


def _cohere_post(
    path: str,
    payload: dict[str, Any],
    *,
    timeout: int | None = None,
    max_retries: int | None = None,
    retry_base_delay: float | None = None,
) -> dict[str, Any]:
    request_timeout = _cohere_timeout(timeout)
    retry_count = _cohere_retry_count(max_retries)
    base_delay = _cohere_retry_base_delay(retry_base_delay)

    for attempt in range(retry_count + 1):
        try:
            response = requests.post(
                f"https://api.cohere.com{path}",
                headers=_cohere_headers(),
                json=payload,
                timeout=request_timeout,
            )
        except requests.RequestException as exc:
            if attempt < retry_count:
                _sleep_before_retry(attempt, base_delay)
                continue
            raise CohereServiceError(f"Cohere request failed: {exc}") from exc

        if not response.ok:
            detail = response.text.strip()
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = None
            if isinstance(error_payload, dict):
                detail = _normalize_whitespace(
                    str(error_payload.get("message") or error_payload.get("detail") or detail)
                )
            if attempt < retry_count and _should_retry_status(response.status_code):
                _sleep_before_retry(attempt, base_delay)
                continue
            raise CohereServiceError(f"Cohere request failed with status {response.status_code}: {detail}")

        try:
            response_payload = response.json()
        except ValueError as exc:
            raise CohereServiceError("Cohere returned an invalid JSON response.") from exc

        if not isinstance(response_payload, dict):
            raise CohereServiceError("Cohere returned an unexpected response shape.")
        return response_payload

    raise CohereServiceError("Cohere request failed after retries.")


def _extract_chat_text(payload: dict[str, Any]) -> str:
    message = payload.get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if not isinstance(content, list):
        return ""

    chunks: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "text":
            continue
        text = _normalize_whitespace(str(item.get("text") or ""))
        if text:
            chunks.append(text)
    return "\n".join(chunks).strip()


def _cohere_chat(
    *,
    system_prompt: str,
    user_prompt: str | list[dict[str, Any]],
    max_tokens: int = 900,
    temperature: float = 0.2,
    require_json: bool = False,
    model: str | None = None,
    timeout: int | None = None,
    max_retries: int | None = None,
) -> str:
    payload: dict[str, Any] = {
        "model": model or getattr(settings, "COHERE_CHAT_MODEL", "command-a-03-2025"),
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if require_json:
        payload["response_format"] = {"type": "json_object"}

    response_payload = _cohere_post("/v2/chat", payload, timeout=timeout, max_retries=max_retries)
    text = _extract_chat_text(response_payload)
    if not text:
        raise CohereServiceError("Cohere returned an empty chat response.")
    return text


def rerank_documents(query: str, documents: list[str], *, top_n: int = 5) -> list[tuple[int, float]]:
    cleaned_query = _normalize_whitespace(query)
    normalized_documents = [_normalize_whitespace(document) for document in documents if _normalize_whitespace(document)]
    if not cleaned_query or not normalized_documents:
        return []

    payload = {
        "model": getattr(settings, "COHERE_RERANK_MODEL", "rerank-v4.0-fast"),
        "query": cleaned_query,
        "documents": normalized_documents,
        "top_n": min(max(top_n, 1), len(normalized_documents)),
    }
    response_payload = _cohere_post("/v2/rerank", payload)
    results = response_payload.get("results")
    if not isinstance(results, list):
        return []

    ranked: list[tuple[int, float]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index"))
            score = float(item.get("relevance_score") or 0.0)
        except (TypeError, ValueError):
            continue
        ranked.append((index, score))
    return ranked


def build_bill_ai_source_hash(bill: Bill) -> str:
    payload = {
        "document_source_url": getattr(bill, "document_source_url", ""),
        "document_source_fingerprint": getattr(bill, "document_source_fingerprint", ""),
        "document_text": bill.document_text,
        "document_page_count": getattr(bill, "document_page_count", 0),
        "document_word_count": getattr(bill, "document_word_count", 0),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _flatten_document_blocks(blocks: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "")
        if block_type in {"heading", "paragraph"}:
            text = _normalize_whitespace(str(block.get("text") or ""))
            if text:
                lines.append(text)
        elif block_type == "list":
            items = block.get("items")
            if not isinstance(items, list):
                continue
            bullet_items = [_normalize_whitespace(str(item)) for item in items if _normalize_whitespace(str(item))]
            if bullet_items:
                lines.append("; ".join(bullet_items))
    return "\n".join(lines).strip()


def _split_text_into_chunks(text: str, *, max_chars: int = 1100) -> list[str]:
    cleaned = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not cleaned:
        return []

    paragraphs = [segment.strip() for segment in re.split(r"\n{2,}", cleaned) if segment.strip()]
    if not paragraphs:
        paragraphs = [_normalize_whitespace(cleaned)]

    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(paragraph) <= max_chars:
            current = paragraph
            continue

        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        sentence_chunk = ""
        for sentence in sentences:
            part = sentence.strip()
            if not part:
                continue
            candidate_sentence_chunk = f"{sentence_chunk} {part}".strip() if sentence_chunk else part
            if len(candidate_sentence_chunk) <= max_chars:
                sentence_chunk = candidate_sentence_chunk
                continue

            if sentence_chunk:
                chunks.append(sentence_chunk)
            sentence_chunk = part

        if sentence_chunk:
            current = sentence_chunk

    if current:
        chunks.append(current)

    return chunks


def build_bill_context_chunks(bill: Bill, *, max_chars: int = 1100) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    pages = bill.document_pages if isinstance(bill.document_pages, list) else []
    for page in pages:
        if not isinstance(page, dict):
            continue
        page_number_raw = page.get("pageNumber")
        try:
            page_number = int(page_number_raw) if page_number_raw is not None else None
        except (TypeError, ValueError):
            page_number = None
        blocks = page.get("blocks")
        if not isinstance(blocks, list):
            continue
        page_text = _flatten_document_blocks(blocks)
        for chunk_text in _split_text_into_chunks(page_text, max_chars=max_chars):
            chunks.append({"pageNumber": page_number, "text": chunk_text})

    if chunks:
        return chunks

    for chunk_text in _split_text_into_chunks(bill.document_text or bill.summary or "", max_chars=max_chars):
        chunks.append({"pageNumber": None, "text": chunk_text})
    return chunks


def _keyword_rank_chunks(query: str, chunks: list[dict[str, Any]], *, top_n: int) -> list[BillContextExcerpt]:
    terms = {term for term in re.findall(r"[a-z0-9]+", query.lower()) if len(term) >= 3}
    if not terms:
        return []

    ranked: list[tuple[float, dict[str, Any]]] = []
    for chunk in chunks:
        text = str(chunk.get("text") or "")
        lowered = text.lower()
        score = 0.0
        for term in terms:
            if term in lowered:
                score += lowered.count(term)
        if score <= 0:
            continue
        ranked.append((score, chunk))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        BillContextExcerpt(
            page_number=chunk.get("pageNumber"),
            text=str(chunk.get("text") or ""),
            score=float(score),
        )
        for score, chunk in ranked[:top_n]
    ]


def select_bill_context(bill: Bill, query: str, *, top_n: int = 5) -> list[BillContextExcerpt]:
    chunks = build_bill_context_chunks(bill)
    if not chunks:
        return []

    documents = [str(chunk.get("text") or "") for chunk in chunks]
    if cohere_enabled():
        try:
            ranked = rerank_documents(query, documents, top_n=top_n)
        except (CohereConfigurationError, CohereServiceError):
            ranked = []
        else:
            excerpts: list[BillContextExcerpt] = []
            for index, score in ranked:
                if index < 0 or index >= len(chunks):
                    continue
                chunk = chunks[index]
                excerpts.append(
                    BillContextExcerpt(
                        page_number=chunk.get("pageNumber"),
                        text=str(chunk.get("text") or ""),
                        score=score,
                    )
                )
            if excerpts:
                return excerpts

    return _keyword_rank_chunks(query, chunks, top_n=top_n)


def _format_excerpts(excerpts: list[BillContextExcerpt]) -> str:
    lines: list[str] = []
    for index, excerpt in enumerate(excerpts, start=1):
        page_label = f"Page {excerpt.page_number}" if excerpt.page_number else "Extract"
        lines.append(f"[{index}] {page_label}: {excerpt.text}")
    return "\n\n".join(lines)


def _strip_json_code_fence(raw_text: str) -> str:
    cleaned = str(raw_text or "").strip()
    if not cleaned.startswith("```"):
        return cleaned

    lines = cleaned.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return cleaned


def _parse_json_object(raw_text: str) -> dict[str, Any]:
    cleaned = _strip_json_code_fence(str(raw_text or ""))
    decoder = json.JSONDecoder()
    candidates: list[str] = []
    if cleaned:
        candidates.append(cleaned)

    object_start = cleaned.find("{")
    object_end = cleaned.rfind("}")
    if 0 <= object_start < object_end:
        candidates.append(cleaned[object_start : object_end + 1])

    seen: set[str] = set()
    for candidate in candidates:
        normalized_candidate = candidate.strip()
        if not normalized_candidate or normalized_candidate in seen:
            continue
        seen.add(normalized_candidate)

        try:
            parsed = json.loads(normalized_candidate)
        except json.JSONDecodeError:
            pass
        else:
            if isinstance(parsed, dict):
                return parsed
            raise CohereServiceError("Cohere returned JSON in an unexpected shape.")

        for index, char in enumerate(normalized_candidate):
            if char != "{":
                continue
            try:
                parsed, _end = decoder.raw_decode(normalized_candidate[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
            raise CohereServiceError("Cohere returned JSON in an unexpected shape.")

    raise CohereServiceError("Cohere did not return valid JSON content.")

def _normalize_timeline_entries(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    timeline: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            label = _normalize_whitespace(str(item.get("label") or item.get("stage") or item.get("title") or ""))
            description = _normalize_whitespace(
                str(item.get("description") or item.get("detail") or item.get("text") or "")
            )
        else:
            label = ""
            description = _normalize_whitespace(str(item))
        if not label and not description:
            continue
        timeline.append({"label": label or "Update", "description": description})
    return timeline[:5]


def generate_bill_ai_artifacts(bill: Bill) -> dict[str, Any]:
    if not cohere_enabled():
        raise CohereConfigurationError("Cohere is not configured. Set COHERE_API_KEY to generate AI bill insights.")

    source_hash = build_bill_ai_source_hash(bill)
    excerpts = select_bill_context(bill, SUMMARY_SELECTION_QUERY, top_n=6)
    context_block = _format_excerpts(excerpts) if excerpts else _normalize_whitespace((bill.document_text or bill.summary)[:4000])

    user_prompt = (
        "Generate a JSON object with these keys: "
        "`summary` (a concise plain-language explanation in 2 to 3 sentences), "
        "`key_points` (an array of 3 to 5 short strings), and "
        "`timeline` (an array of 2 to 5 objects with `label` and `description`). "
        "Use only the source material below. If a detail is unclear, say so instead of inventing it.\n\n"
        f"Bill title: {bill.title}\n"
        f"Bill ID: {bill.id}\n"
        f"Status: {bill.status}\n"
        f"Category: {bill.category}\n"
        f"Sponsor: {bill.sponsor or 'Not stated'}\n"
        f"Existing short summary: {bill.summary or 'None'}\n\n"
        f"Source excerpts:\n{context_block}"
    )
    system_prompt = (
        "You write plain-language civic summaries for a Kenyan parliamentary bill tracker. "
        "Stay factual, concise, and faithful to the provided bill excerpts."
    )
    raw_json = _cohere_chat(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=900,
        temperature=0.2,
        require_json=True,
    )
    payload = _parse_json_object(raw_json)

    summary = _normalize_whitespace(str(payload.get("summary") or bill.summary or ""))
    key_points_raw = payload.get("key_points")
    key_points = []
    if isinstance(key_points_raw, list):
        key_points = [
            _normalize_whitespace(str(item))
            for item in key_points_raw
            if _normalize_whitespace(str(item))
        ][:5]
    timeline = _normalize_timeline_entries(payload.get("timeline"))

    return {
        "sourceHash": source_hash,
        "summary": summary,
        "keyPoints": key_points,
        "timeline": timeline,
    }


def answer_bill_question(bill: Bill, question: str) -> dict[str, Any]:
    cleaned_question = _normalize_whitespace(question)
    if not cleaned_question:
        raise ValueError("Please provide a question about the bill.")

    if not cohere_enabled():
        raise CohereConfigurationError("Cohere is not configured. Set COHERE_API_KEY to enable bill Q&A.")

    excerpts = select_bill_context(bill, cleaned_question, top_n=5)
    if not excerpts:
        raise CohereServiceError("No extracted bill text is available for question answering yet.")

    system_prompt = (
        "You answer questions about Kenyan parliamentary bills using only the provided excerpts. "
        "If the answer is not clearly supported by the excerpts, say that plainly."
    )
    user_prompt = (
        "Answer the question in 2 to 4 short paragraphs. "
        "Do not invent facts. Mention uncertainty when needed.\n\n"
        f"Question: {cleaned_question}\n\n"
        f"Excerpts:\n{_format_excerpts(excerpts)}"
    )
    answer = _cohere_chat(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=700,
        temperature=0.2,
        require_json=False,
    )

    return {
        "question": cleaned_question,
        "answer": answer.strip(),
        "excerpts": [
            {
                "pageNumber": excerpt.page_number,
                "text": excerpt.text,
                "score": round(excerpt.score, 4),
            }
            for excerpt in excerpts
        ],
    }

def semantic_rank_bills(query: str, bills: list[Bill], *, top_n: int = 20) -> list[str]:
    cleaned_query = _normalize_whitespace(query)
    if not cleaned_query or not bills or not cohere_enabled():
        return []

    documents: list[str] = []
    ids: list[str] = []
    for bill in bills:
        ai_summary = str(getattr(bill, "ai_summary", "") or "").strip()
        ai_key_points = getattr(bill, "ai_key_points", [])
        key_points_text = "; ".join(str(point) for point in ai_key_points if str(point).strip()) if isinstance(ai_key_points, list) else ""
        document_excerpt = _normalize_whitespace((bill.document_text or "")[:600])
        document = "\n".join(
            part
            for part in [
                bill.title,
                f"Bill ID: {bill.id}",
                f"Category: {bill.category}",
                f"Status: {bill.status}",
                f"Sponsor: {bill.sponsor}" if bill.sponsor else "",
                f"AI summary: {ai_summary}" if ai_summary else "",
                f"Summary: {bill.summary}" if bill.summary else "",
                f"Key points: {key_points_text}" if key_points_text else "",
                f"Document excerpt: {document_excerpt}" if document_excerpt else "",
            ]
            if part
        )
        if not document.strip():
            continue
        ids.append(bill.id)
        documents.append(document)

    if not documents:
        return []

    try:
        ranked = rerank_documents(cleaned_query, documents, top_n=min(top_n, len(documents)))
    except (CohereConfigurationError, CohereServiceError):
        return []

    ordered_ids: list[str] = []
    for index, _score in ranked:
        if 0 <= index < len(ids):
            ordered_ids.append(ids[index])
    return ordered_ids


def extract_text_from_page_images(page_images: list[tuple[int, bytes]], *, detail: str = "high") -> list[dict[str, Any]]:
    if not page_images:
        return []

    if not cohere_enabled():
        raise CohereConfigurationError("Cohere is not configured. Set COHERE_API_KEY to enable AI OCR.")

    page_numbers = [page_number for page_number, _image_bytes in page_images]
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                "Generate a JSON object with a `pages` array. "
                "Each item must contain `page_number` and `text`. "
                f"The images correspond to bill pages in this order: {page_numbers}. "
                "Transcribe the readable text from each page image as faithfully as possible, preserving headings, bullet points, and paragraph breaks when clear. "
                "If a page is unreadable, return an empty string for that page. "
                "Return JSON only."
            ),
        }
    ]

    for _page_number, image_bytes in page_images:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{encoded}",
                    "detail": detail,
                },
            }
        )

    raw_json = _cohere_chat(
        system_prompt=(
            "You are extracting text from scanned Kenyan parliamentary bill pages. "
            "Transcribe only what is visible in the images and do not invent missing text."
        ),
        user_prompt=content,
        max_tokens=4000,
        temperature=0.1,
        require_json=True,
        model=getattr(settings, "COHERE_VISION_MODEL", "command-a-vision-07-2025"),
    )
    payload = _parse_json_object(raw_json)
    pages = payload.get("pages")
    if not isinstance(pages, list):
        raise CohereServiceError("Cohere Vision did not return page OCR data.")

    normalized_pages: list[dict[str, Any]] = []
    expected_page_numbers = set(page_numbers)
    for item in pages:
        if not isinstance(item, dict):
            continue
        try:
            page_number = int(item.get("page_number"))
        except (TypeError, ValueError):
            continue
        if page_number not in expected_page_numbers:
            continue
        text = str(item.get("text") or "")
        normalized_pages.append({"pageNumber": page_number, "text": text})

    if not normalized_pages:
        raise CohereServiceError("Cohere Vision returned no readable page text.")

    normalized_pages.sort(key=lambda item: int(item["pageNumber"]))
    return normalized_pages
