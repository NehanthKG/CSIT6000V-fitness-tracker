from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class ModelUnavailable(RuntimeError):
    pass


def ask(messages: list[dict[str, str]], *, temperature: float = 0.2, max_tokens: int = 1200) -> str:
    base_url = os.getenv("QWEN_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        raise ModelUnavailable("QWEN_BASE_URL is not set")
    try:
        parts = urlsplit(base_url)
        if parts.scheme not in ("http", "https") or not parts.hostname or parts.path != "/v1" or parts.query or parts.fragment:
            raise ValueError("Expected a service URL ending in /v1")
    except ValueError as exc:
        raise ModelUnavailable("QWEN_BASE_URL must be the current TACC SERVICE_BASE_URL ending in /v1") from exc
    model = os.getenv("QWEN_MODEL", "qwen3.8-27b")
    timeout = float(os.getenv("QWEN_TIMEOUT_SECONDS", "120"))
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    req = Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(req, timeout=timeout) as response:
            data = json.load(response)
        answer = data["choices"][0]["message"]["content"]
        if not isinstance(answer, str) or not answer.strip():
            raise ModelUnavailable("The model returned an empty answer")
        return answer.strip()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise ModelUnavailable("The TACC Qwen endpoint could not complete the request") from exc
