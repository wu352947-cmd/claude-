"""运行配置：路径与密钥来自环境变量，算法参数来自 data/config.yaml。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # gaokao-math/


@dataclass
class LLMConfig:
    """OpenAI 兼容的聊天接口（DeepSeek、通义千问、Kimi、智谱等都支持）。"""

    base_url: str = ""
    api_key: str = ""
    model: str = ""

    @property
    def enabled(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)


@dataclass
class Settings:
    data_dir: Path = PROJECT_ROOT / "data"
    db_path: Path = PROJECT_ROOT / "var" / "app.db"
    backup_dir: Path = PROJECT_ROOT / "var" / "backups"
    web_dist: Path = PROJECT_ROOT / "web" / "dist"
    # 设置后所有 /api 请求都要带这个口令（局域网以外访问时务必设置）
    token: str | None = None

    daily_review: int = 5
    daily_new: int = 6
    explore: int = 1  # 每天新题里留几道随机题，避免只刷推荐、视野变窄
    focus_modules: list[str] = field(default_factory=list)
    target_band: tuple[float, float] = (0.6, 0.85)
    desired_retention: float = 0.9
    k0: float = 0.4
    tau_days: float = 45.0
    hour_gain: float = 0.3  # 认真练 1 小时，一个知识点的 θ 大约提高多少（用于提分建议）
    timezone: str = "Asia/Shanghai"  # 「今天」「连续打卡」按这个时区算
    backup_keep: int = 14

    ai_daily_limit: int = 60  # 每天最多调用大模型多少次
    llm: LLMConfig = field(default_factory=LLMConfig)  # 文字：提示、讲解、知识点推荐、变式题
    vision: LLMConfig = field(default_factory=LLMConfig)  # 看图：拍照识题

    # 由 data/exam_blueprint.yaml 填充：题型 → 默认分值 / 建议用时
    type_defaults: dict[str, dict] = field(default_factory=dict)


def read_env_file(path: Path) -> dict[str, str]:
    """读 gaokao-math/.env（KEY=VALUE，每行一个）。Windows 上设环境变量麻烦，写在文件里更方便。"""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def load_settings(**overrides) -> Settings:
    env = {**read_env_file(PROJECT_ROOT / ".env"), **os.environ}  # 真正的环境变量优先
    s = Settings()
    if "DATA_DIR" in env:
        s.data_dir = Path(env["DATA_DIR"])
    if "DB_PATH" in env:
        s.db_path = Path(env["DB_PATH"])
    if "BACKUP_DIR" in env:
        s.backup_dir = Path(env["BACKUP_DIR"])
    if "WEB_DIST" in env:
        s.web_dist = Path(env["WEB_DIST"])
    s.token = env.get("APP_TOKEN") or None
    s.llm = LLMConfig(env.get("LLM_BASE_URL", ""), env.get("LLM_API_KEY", ""), env.get("LLM_MODEL", ""))
    # 视觉模型可以来自另一家服务商；不单独配置时沿用文字模型的地址和密钥
    s.vision = LLMConfig(env.get("VISION_BASE_URL") or s.llm.base_url,
                         env.get("VISION_API_KEY") or s.llm.api_key,
                         env.get("VISION_MODEL", ""))
    for key, value in overrides.items():
        setattr(s, key, value)

    cfg = _read_yaml(s.data_dir / "config.yaml")
    daily = cfg.get("daily", {})
    s.daily_review = int(daily.get("review", s.daily_review))
    s.daily_new = int(daily.get("new", s.daily_new))
    s.explore = int(daily.get("explore", s.explore))
    s.focus_modules = list(cfg.get("focus_modules") or [])
    if band := cfg.get("target_band"):
        s.target_band = (float(band[0]), float(band[1]))
    s.desired_retention = float(cfg.get("fsrs", {}).get("desired_retention", s.desired_retention))
    m = cfg.get("mastery", {})
    s.k0 = float(m.get("k0", s.k0))
    s.tau_days = float(m.get("tau_days", s.tau_days))
    s.hour_gain = float(m.get("hour_gain", s.hour_gain))
    s.timezone = str(cfg.get("timezone", s.timezone))
    s.ai_daily_limit = int(cfg.get("ai", {}).get("daily_limit", s.ai_daily_limit))
    s.backup_keep = int(cfg.get("backup", {}).get("keep", s.backup_keep))

    blueprint = _read_yaml(s.data_dir / "exam_blueprint.yaml")
    s.type_defaults = {
        sec["type"]: {"points": sec["points"], "est_seconds": sec["est_seconds"]}
        for sec in blueprint.get("sections", [])
    }
    return s


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
