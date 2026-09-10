"""Versioned, editable agent prompt templates.

Every agent's system instruction and user prompt used to be a Python literal —
a one-line `instruction=` on the `AgentSpec` and an f-string built at the call
site. Changing how an agent is asked to behave meant editing Python, and there
was no way to see what a given brief actually produced short of adding a print
and redeploying.

Templates now live in `app/prompts/*.md`, are addressed by name and version,
and can be rendered against sample variables for preview. The renderer is a
deliberate ~30 lines of `{{ name }}` substitution rather than Jinja: templates
are editable through the API, so anything that can execute is a liability, and
this can only ever perform string replacement.
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
SECTION_RE = re.compile(r"^##\s+(system|user)\s*$", re.MULTILINE | re.IGNORECASE)

DEFAULT_DIR = Path(__file__).resolve().parents[1] / "prompts"
VERSIONS_DIRNAME = "_versions"


class PromptError(ValueError):
    """Raised for a malformed template or a bad render."""


@dataclass(frozen=True)
class PromptTemplate:
    """One agent's prompt, as loaded from disk."""

    name: str
    version: int
    description: str
    model: str
    variables: list[str]
    system: str
    user: str
    path: Path
    updated_at: datetime
    checksum: str
    #: Example values used by the preview panel when the caller supplies none.
    samples: dict[str, str] = field(default_factory=dict)

    def placeholders(self) -> set[str]:
        """Every `{{ var }}` referenced by either section."""

        return set(PLACEHOLDER_RE.findall(self.system)) | set(PLACEHOLDER_RE.findall(self.user))

    def to_dict(self, include_body: bool = True) -> dict[str, Any]:
        """Serialise for the API."""

        payload: dict[str, Any] = {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "model": self.model,
            "variables": self.variables,
            "placeholders": sorted(self.placeholders()),
            "updated_at": self.updated_at.isoformat(),
            "checksum": self.checksum,
            "samples": self.samples,
        }
        if include_body:
            payload["system"] = self.system
            payload["user"] = self.user
        return payload


def templates_dir() -> Path:
    """Directory templates are read from and written to."""

    configured = getattr(settings, "PROMPT_TEMPLATES_DIR", "") or ""
    return Path(configured).expanduser().resolve() if configured else DEFAULT_DIR


# name -> (template, source mtime_ns). Reloaded when the file changes on disk,
# so an edit through the API takes effect on the next run without a restart.
_cache: dict[str, tuple[PromptTemplate, int]] = {}


def _parse_front_matter(raw: str) -> tuple[dict[str, Any], str]:
    """Split leading `---` front matter from the body.

    Supports the small subset the templates need: `key: value` and
    `key: [a, b, c]`. Nested structures are not accepted, so a template cannot
    smuggle configuration past this.
    """

    match = FRONT_MATTER_RE.match(raw)
    if not match:
        return {}, raw
    meta: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key] = [item.strip().strip("'\"") for item in value[1:-1].split(",") if item.strip()]
        else:
            meta[key] = value.strip("'\"")
    return meta, raw[match.end():]


def _split_sections(body: str) -> tuple[str, str]:
    """Split a body into its `## system` and `## user` sections."""

    parts = SECTION_RE.split(body)
    if len(parts) < 3:
        raise PromptError("Template must contain a '## system' and a '## user' section.")
    sections: dict[str, str] = {}
    # split() yields [preamble, heading, text, heading, text, ...]
    for index in range(1, len(parts) - 1, 2):
        sections[parts[index].strip().lower()] = parts[index + 1].strip()
    if "system" not in sections or "user" not in sections:
        raise PromptError("Template must contain both a '## system' and a '## user' section.")
    return sections["system"], sections["user"]


def _parse(path: Path) -> PromptTemplate:
    """Parse one template file."""

    raw = path.read_text(encoding="utf-8")
    meta, body = _parse_front_matter(raw)
    system, user = _split_sections(body)
    stat = path.stat()
    samples = {
        key[len("sample_"):]: str(value)
        for key, value in meta.items()
        if key.startswith("sample_")
    }
    return PromptTemplate(
        name=meta.get("name") or path.stem,
        version=int(meta.get("version") or 1),
        description=str(meta.get("description") or ""),
        model=str(meta.get("model") or "flash"),
        variables=list(meta.get("variables") or []),
        system=system,
        user=user,
        path=path,
        updated_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        checksum=hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12],
        samples=samples,
    )


def load(name: str) -> PromptTemplate:
    """Load a template by name, using the mtime-keyed cache."""

    path = templates_dir() / f"{name}.md"
    if not path.is_file():
        raise PromptError(f"No prompt template named '{name}'.")
    mtime_ns = path.stat().st_mtime_ns
    cached = _cache.get(name)
    if cached and cached[1] == mtime_ns:
        return cached[0]
    template = _parse(path)
    _cache[name] = (template, mtime_ns)
    return template


def load_all() -> list[PromptTemplate]:
    """Every template in the directory, by name."""

    directory = templates_dir()
    if not directory.is_dir():
        return []
    templates: list[PromptTemplate] = []
    for path in sorted(directory.glob("*.md")):
        try:
            templates.append(load(path.stem))
        except PromptError as exc:
            logger.warning("Skipping malformed prompt template %s: %s", path.name, exc)
    return templates


def render_text(text: str, variables: dict[str, Any], *, strict: bool = True) -> str:
    """Substitute `{{ name }}` placeholders.

    With ``strict`` a missing variable raises instead of silently leaving the
    literal `{{ name }}` in the prompt, which is the failure mode that
    produces confidently wrong model output.
    """

    missing: list[str] = []

    def substitute(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables:
            missing.append(key)
            return match.group(0)
        value = variables[key]
        return value if isinstance(value, str) else str(value)

    rendered = PLACEHOLDER_RE.sub(substitute, text)
    if missing and strict:
        raise PromptError(f"Missing prompt variables: {', '.join(sorted(set(missing)))}")
    return rendered


def render(name: str, variables: dict[str, Any], *, strict: bool = True) -> tuple[str, str]:
    """Render a template's system and user text. Returns ``(system, user)``."""

    template = load(name)
    return (
        render_text(template.system, variables, strict=strict),
        render_text(template.user, variables, strict=strict),
    )


def analyse(name: str, variables: dict[str, Any]) -> dict[str, Any]:
    """Render for preview and report what is missing or unused."""

    template = load(name)
    placeholders = template.placeholders()
    provided = set(variables)
    system, user = render(name, variables, strict=False)
    return {
        "name": template.name,
        "version": template.version,
        "system": system,
        "user": user,
        "missing": sorted(placeholders - provided),
        "unused": sorted(provided - placeholders),
        "characters": len(system) + len(user),
    }


def serialise(template: PromptTemplate, system: str, user: str, description: str, version: int) -> str:
    """Render a template back to its on-disk form."""

    lines = [
        "---",
        f"name: {template.name}",
        f"version: {version}",
        f"description: {description}",
        f"model: {template.model}",
        f"variables: [{', '.join(template.variables)}]",
    ]
    lines += [f"sample_{key}: {value}" for key, value in template.samples.items()]
    lines += ["---", "", "## system", "", system.strip(), "", "## user", "", user.strip(), ""]
    return "\n".join(lines)


def save(name: str, system: str, user: str, description: str | None = None) -> PromptTemplate:
    """Write a new version of a template, archiving the current one first.

    The previous file is copied to `_versions/{name}/v{n}.md` before being
    replaced, so an edit that makes an agent worse can always be reverted.
    """

    current = load(name)
    directory = templates_dir()
    archive = directory / VERSIONS_DIRNAME / name
    archive.mkdir(parents=True, exist_ok=True)
    shutil.copy2(current.path, archive / f"v{current.version}.md")

    next_version = current.version + 1
    body = serialise(current, system, user, description or current.description, next_version)
    current.path.write_text(body, encoding="utf-8")
    _cache.pop(name, None)
    logger.info("Prompt template %s saved as v%s", name, next_version)
    return load(name)


def versions(name: str) -> list[dict[str, Any]]:
    """List archived versions of a template, newest first."""

    current = load(name)
    archive = templates_dir() / VERSIONS_DIRNAME / name
    entries = [{"version": current.version, "current": True, "checksum": current.checksum,
                "updated_at": current.updated_at.isoformat()}]
    if archive.is_dir():
        for path in archive.glob("v*.md"):
            try:
                parsed = _parse(path)
            except PromptError:
                continue
            entries.append(
                {
                    "version": parsed.version,
                    "current": False,
                    "checksum": parsed.checksum,
                    "updated_at": parsed.updated_at.isoformat(),
                }
            )
    return sorted(entries, key=lambda item: item["version"], reverse=True)


def revert(name: str, version: int) -> PromptTemplate:
    """Restore an archived version as a new version on top of the current one."""

    archive = templates_dir() / VERSIONS_DIRNAME / name / f"v{version}.md"
    if not archive.is_file():
        raise PromptError(f"No archived version {version} of '{name}'.")
    old = _parse(archive)
    return save(name, old.system, old.user, old.description)
