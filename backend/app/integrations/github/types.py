from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class ProjectFieldOption:
    id: str
    name: str


@dataclass
class ProjectField:
    id: str
    name: str
    options: list[ProjectFieldOption] = field(default_factory=list)


@dataclass
class ProjectInfo:
    node_id: str
    number: int
    title: str
    url: str
    status_field: ProjectField | None
    fields: list[ProjectField] = field(default_factory=list)


@dataclass
class ItemContent:
    kind: str
    node_id: str
    number: int | None
    title: str
    body: str
    url: str | None
    updated_at: datetime
    state: str | None
    merged: bool | None
    is_archived: bool
    repo: str | None
    assignee_logins: list[str] = field(default_factory=list)


@dataclass
class ProjectItem:
    item_node_id: str
    item_type: str
    status_name: str | None
    item_is_archived: bool
    content: ItemContent


@dataclass
class ItemsPage:
    items: list[ProjectItem]
    end_cursor: str | None
    has_next: bool


def parse_project_info(raw: dict[str, Any]) -> ProjectInfo:
    fields: list[ProjectField] = []
    status_field: ProjectField | None = None
    for f in (raw.get("fields") or {}).get("nodes") or []:
        if not isinstance(f, dict) or f.get("__typename") != "ProjectV2SingleSelectField":
            continue
        options = [
            ProjectFieldOption(id=o["id"], name=o["name"])
            for o in (f.get("options") or [])
        ]
        pf = ProjectField(id=f["id"], name=f["name"], options=options)
        fields.append(pf)
        if f["name"].lower() == "status":
            status_field = pf
    return ProjectInfo(
        node_id=raw["id"],
        number=int(raw["number"]),
        title=raw["title"],
        url=raw.get("url", ""),
        status_field=status_field,
        fields=fields,
    )


def _parse_dt(s: str | None) -> datetime:
    from datetime import timezone
    if not s:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def parse_item(raw: dict[str, Any]) -> ProjectItem | None:
    content = raw.get("content") or {}
    typename = content.get("__typename")
    if typename == "Issue":
        kind = "issue"
    elif typename == "PullRequest":
        kind = "pull_request"
    elif typename == "DraftIssue":
        kind = "draft"
    else:
        return None

    status_name: str | None = None
    for fv in (raw.get("fieldValues") or {}).get("nodes") or []:
        if not isinstance(fv, dict):
            continue
        if fv.get("__typename") != "ProjectV2ItemFieldSingleSelectValue":
            continue
        f = fv.get("field") or {}
        if isinstance(f, dict) and f.get("name", "").lower() == "status":
            status_name = fv.get("name")
            break

    assignees = ((content.get("assignees") or {}).get("nodes")) or []
    logins = [a["login"] for a in assignees if a and a.get("login")]
    repo_obj = content.get("repository")
    repo = repo_obj.get("nameWithOwner") if isinstance(repo_obj, dict) else None

    item_archived = bool(raw.get("isArchived")) or bool(content.get("isArchived"))

    return ProjectItem(
        item_node_id=raw["id"],
        item_type=raw.get("type") or "",
        status_name=status_name,
        item_is_archived=item_archived,
        content=ItemContent(
            kind=kind,
            node_id=content["id"],
            number=content.get("number"),
            title=content.get("title") or "",
            body=content.get("body") or "",
            url=content.get("url"),
            updated_at=_parse_dt(content.get("updatedAt")),
            state=content.get("state"),
            merged=content.get("merged"),
            is_archived=item_archived,
            repo=repo,
            assignee_logins=logins,
        ),
    )

