"""大模型客户端：OpenAI 兼容的 /chat/completions 接口。

国内的 DeepSeek、通义千问（DashScope 兼容模式）、Kimi、智谱等都提供这种接口，
换服务商只需要改环境变量，代码不用动。
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Protocol

from ..config import LLMConfig


class LLMError(RuntimeError):
    pass


class ChatClient(Protocol):
    model: str

    def chat(self, messages: list[dict], *, json_mode: bool = False, temperature: float = 0.3) -> str: ...


class OpenAICompatClient:
    def __init__(self, cfg: LLMConfig, timeout: float = 90):
        self.base_url = cfg.base_url.rstrip("/")
        self.api_key = cfg.api_key
        self.model = cfg.model
        self.timeout = timeout

    def chat(self, messages: list[dict], *, json_mode: bool = False, temperature: float = 0.3) -> str:
        body: dict = {"model": self.model, "messages": messages, "temperature": temperature}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = json.loads(exc.read().decode()).get("error", {}).get("message", "")
            except Exception:  # noqa: BLE001
                pass
            raise LLMError(f"大模型接口返回 {exc.code}{'：' + detail[:200] if detail else ''}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LLMError(f"连不上大模型接口：{exc}") from exc
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("大模型接口返回的格式不对") from exc


class ScriptedLLM:
    """测试用：按顺序返回预设内容，或由函数根据消息生成回复。记录收到的所有请求。"""

    def __init__(self, replies: list[str] | Callable[[list[dict]], str], model: str = "scripted"):
        self.replies = replies
        self.model = model
        self.calls: list[list[dict]] = []

    def chat(self, messages: list[dict], *, json_mode: bool = False, temperature: float = 0.3) -> str:
        self.calls.append(messages)
        if callable(self.replies):
            return self.replies(messages)
        if not self.replies:
            raise LLMError("没有预设的回复了")
        return self.replies.pop(0)


def parse_json(text: str) -> dict:
    """模型有时会在 JSON 外面包 ```json 代码块或多说几句，取第一个完整的 {...}。"""
    start = text.find("{")
    if start < 0:
        raise LLMError("AI 返回的内容不是 JSON")
    depth, in_str, escape = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(text[start:i + 1])
                except json.JSONDecodeError as exc:
                    raise LLMError("AI 返回的 JSON 无法解析") from exc
                if not isinstance(obj, dict):
                    raise LLMError("AI 返回的 JSON 不是对象")
                return obj
    raise LLMError("AI 返回的 JSON 不完整")
