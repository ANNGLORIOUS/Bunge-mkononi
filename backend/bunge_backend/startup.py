from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path

from django.core.management import call_command

try:
    import fcntl
except ImportError:  # pragma: no cover - only relevant on non-Unix systems
    fcntl = None


def _bool_env(name: str, default: str = "0") -> bool:
    value = os.getenv(name, default)
    return value.lower() in {"1", "true", "yes", "on"}


def should_bootstrap() -> bool:
    return os.getenv("RENDER", "").lower() == "true" or _bool_env("DJANGO_BOOTSTRAP_ON_STARTUP")


@contextmanager
def _locked(lock_path: Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w", encoding="utf-8") as lock_file:
        if fcntl is None:
            yield
            return

        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


def _state_file() -> Path:
    return Path(os.getenv("DJANGO_BOOTSTRAP_STATE_FILE", "/tmp/bunge-mkononi-bootstrap.commit"))


def _lock_file() -> Path:
    return Path(os.getenv("DJANGO_BOOTSTRAP_LOCK_FILE", "/tmp/bunge-mkononi-bootstrap.lock"))


def _current_commit() -> str:
    return os.getenv("RENDER_GIT_COMMIT", "local")


def _state_matches(commit: str) -> bool:
    state_file = _state_file()
    return state_file.exists() and state_file.read_text(encoding="utf-8").strip() == commit


def _write_state(commit: str) -> None:
    state_file = _state_file()
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(commit, encoding="utf-8")


def _migrate_with_retry(max_attempts: int = 10, delay_seconds: int = 5) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            call_command("migrate", interactive=False, verbosity=0)
            return
        except Exception:
            if attempt >= max_attempts:
                raise
            time.sleep(delay_seconds)


def bootstrap() -> None:
    if not should_bootstrap():
        return

    commit = _current_commit()
    if _state_matches(commit):
        return

    with _locked(_lock_file()):
        if _state_matches(commit):
            return

        _migrate_with_retry()
        call_command("collectstatic", interactive=False, verbosity=0, clear=False)
        _write_state(commit)
