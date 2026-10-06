"""Pull and push GitHub synchronization.

Reliability guarantees implemented here:
  - Every mutating path is safe against concurrent sync (project advisory lock
    held by callers; per-task row locks held at final commit).
  - Local edits made while a push is in flight are detected via
    `local_updated_at > sync_last_attempt_at` at final-commit time, and the
    task is re-queued instead of being marked synced.
  - Conflicts store the remote `updatedAt` at detection time and a local
    snapshot, so `Keep Mine` can revalidate against further remote movement
    and `Open Diff` can show exactly what the user was looking at.
  - Deleted/archived remote items are recorded with structured error codes
    (`ITEM_DELETED`, `ITEM_ARCHIVED`) and stop being retried.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.integrations.github.client import get_client
from app.integrations.github.errors import (
    GitHubError,
    GitHubNotFound,
    GitHubRateLimited,
)
from app.integrations.github.queries import (
    GET_PROJECT_ITEMS_PAGE,
    GET_PROJECT_ITEM_BY_ID,
    UPDATE_DRAFT_ISSUE_BODY,
    UPDATE_ISSUE_BODY,
    UPDATE_ITEM_SINGLE_SELECT_FIELD,
)
from app.integrations.github.types import ItemsPage, ProjectItem, parse_item
from app.models.enums import (
    GhContentType,
    SyncDirection,
    SyncEntity,
    SyncState,
    SyncStatus,
    SyncTrigger,
    TaskSource,
)
from app.models.github_project_link import GitHubProjectLink
from app.models.project import Project
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.models.user import AppUser
from app.services import github_service

log = get_logger("app.github_sync")

_PAGE_SIZE = 50
_BODY_MANAGED_START = "<!-- timesheet-app:start -->"
_BODY_MANAGED_END = "<!-- timesheet-app:end -->"

# Error codes that the worker will not retry automatically.
TERMINAL_ERROR_CODES: frozenset[str] = frozenset({"ITEM_DELETED", "ITEM_ARCHIVED"})


# --------------------------------------------------------------------------- #
# sync_log
# --------------------------------------------------------------------------- #

async def _log(
    db: AsyncSession,
    *,
    direction: SyncDirection,
    entity: SyncEntity,
    entity_id: uuid.UUID | None,
    gh_node_id: str | None,
    trigger: SyncTrigger,
    status: SyncStatus,
    request_payload: dict | None = None,
    response_payload: dict | None = None,
    error_message: str | None = None,
    org_id: uuid.UUID | None = None,
) -> None:
    db.add(
        SyncLog(
            direction=direction,
            entity=entity,
            entity_id=entity_id,
            gh_node_id=gh_node_id,
            trigger=trigger,
            request_payload=_redact(request_payload),
            response_payload=_redact(response_payload),
            status=status,
            error_message=error_message,
            org_id=org_id,
        )
    )


def _redact(payload: dict | None) -> dict | None:
    if payload is None:
        return None
    return {
        k: v
        for k, v in payload.items()
        if k.lower() not in {"authorization", "token", "access_token", "private_key"}
    }


# --------------------------------------------------------------------------- #
# Managed body block
# --------------------------------------------------------------------------- #

def _compose_remote_body(local_description: str, existing_remote: str) -> str:
    block = f"{_BODY_MANAGED_START}\n{local_description}\n{_BODY_MANAGED_END}"
    if _BODY_MANAGED_START in existing_remote and _BODY_MANAGED_END in existing_remote:
        head, _, rest = existing_remote.partition(_BODY_MANAGED_START)
        _, _, tail = rest.partition(_BODY_MANAGED_END)
        return f"{head}{block}{tail}"
    if existing_remote.strip():
        return f"{block}\n\n{existing_remote}"
    return block


def _extract_local_from_remote(remote_body: str) -> str:
    if _BODY_MANAGED_START in remote_body and _BODY_MANAGED_END in remote_body:
        _, _, rest = remote_body.partition(_BODY_MANAGED_START)
        inner, _, _ = rest.partition(_BODY_MANAGED_END)
        return inner.strip()
    return remote_body or ""


# --------------------------------------------------------------------------- #
# Conflict recording
# --------------------------------------------------------------------------- #

async def _record_conflict(
    db: AsyncSession,
    *,
    task: Task,
    remote_updated_at: datetime,
    trigger: SyncTrigger,
    org_id: uuid.UUID | None = None,
) -> None:
    task.sync_state = SyncState.conflict
    task.conflict_remote_updated_at = remote_updated_at
    task.conflict_detected_at = datetime.now(timezone.utc)
    task.conflict_local_snapshot = {
        "title": task.title,
        "description": task.description,
        "status": task.status,
    }
    task.sync_last_error_code = "REMOTE_CHANGED"
    await db.flush()
    await _log(
        db,
        direction=SyncDirection.push,
        entity=SyncEntity.task,
        entity_id=task.id,
        gh_node_id=task.gh_item_node_id,
        trigger=trigger,
        status=SyncStatus.conflict,
        org_id=org_id,
        response_payload={
            "remote_updated_at": remote_updated_at.isoformat(),
            "local_gh_updated_at": (
                task.gh_updated_at.isoformat() if task.gh_updated_at else None
            ),
        },
    )


def _clear_conflict(task: Task) -> None:
    task.conflict_remote_updated_at = None
    task.conflict_detected_at = None
    task.conflict_local_snapshot = None
    task.sync_last_error_code = None


# --------------------------------------------------------------------------- #
# Error / state finalizers
# --------------------------------------------------------------------------- #

async def _mark_error(
    db: AsyncSession,
    *,
    task: Task,
    code: str,
    message: str,
    trigger: SyncTrigger,
    org_id: uuid.UUID | None = None,
) -> "PushResult":
    task.sync_state = SyncState.error
    task.sync_attempts = (task.sync_attempts or 0) + 1
    task.sync_last_attempt_at = datetime.now(timezone.utc)
    task.sync_last_error_code = code
    await db.flush()
    await _log(
        db,
        direction=SyncDirection.push,
        entity=SyncEntity.task,
        entity_id=task.id,
        gh_node_id=task.gh_item_node_id,
        trigger=trigger,
        status=SyncStatus.failed,
        org_id=org_id,
        error_message=message,
        response_payload={"code": code},
    )
    return PushResult(task_id=task.id, status=SyncStatus.failed, error_message=message,
                      error_code=code)


async def _mark_pending(
    db: AsyncSession,
    *,
    task: Task,
    code: str,
    message: str,
    trigger: SyncTrigger,
    org_id: uuid.UUID | None = None,
) -> "PushResult":
    """Requeue without incrementing the attempt counter (rate limit / transient)."""
    task.sync_state = SyncState.pending_push
    task.sync_last_attempt_at = datetime.now(timezone.utc)
    task.sync_last_error_code = code
    await db.flush()
    await _log(
        db,
        direction=SyncDirection.push,
        entity=SyncEntity.task,
        entity_id=task.id,
        gh_node_id=task.gh_item_node_id,
        trigger=trigger,
        status=SyncStatus.failed,
        org_id=org_id,
        error_message=message,
        response_payload={"code": code},
    )
    return PushResult(task_id=task.id, status=SyncStatus.failed, error_message=message,
                      error_code=code)


# --------------------------------------------------------------------------- #
# Pull
# --------------------------------------------------------------------------- #

@dataclass
class PullResult:
    project_link_id: uuid.UUID
    items_seen: int
    tasks_created: int
    tasks_updated: int
    tasks_conflicted: int
    tasks_orphaned: int
    errors: list[str]


async def pull_project(
    db: AsyncSession,
    *,
    link: GitHubProjectLink,
    trigger: SyncTrigger,
) -> PullResult:
    client = get_client()
    items_seen = tasks_created = tasks_updated = tasks_conflicted = tasks_orphaned = 0
    errors: list[str] = []

    org_id = (
        await db.execute(
            select(Project.org_id).where(Project.id == link.project_id)
        )
    ).scalar_one()

    page: ItemsPage
    try:
        page = await _fetch_items_page(client, project_node_id=link.gh_project_node_id)
    except GitHubNotFound:
        await _log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.project,
            entity_id=link.project_id,
            gh_node_id=link.gh_project_node_id,
            trigger=trigger,
            status=SyncStatus.failed,
            org_id=org_id,
            error_message="Project not found on GitHub (may have been deleted)",
        )
        return PullResult(link.id, 0, 0, 0, 0, 0, ["Project not found on GitHub"])
    except GitHubRateLimited as e:
        await _log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.project,
            entity_id=link.project_id,
            gh_node_id=link.gh_project_node_id,
            trigger=trigger,
            status=SyncStatus.skipped,
            org_id=org_id,
            error_message=f"Rate limited: {e.retry_after_seconds}s",
        )
        return PullResult(link.id, 0, 0, 0, 0, 0, ["Rate limited"])
    except GitHubError as e:
        await _log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.project,
            entity_id=link.project_id,
            gh_node_id=link.gh_project_node_id,
            trigger=trigger,
            status=SyncStatus.failed,
            org_id=org_id,
            error_message=str(e),
        )
        return PullResult(link.id, 0, 0, 0, 0, 0, [str(e)])

    seen_item_ids: set[str] = set()

    while True:
        for item in page.items:
            seen_item_ids.add(item.item_node_id)
            items_seen += 1
            try:
                outcome = await _upsert_task_from_item(
                    db, link=link, item=item, trigger=trigger, org_id=org_id
                )
                if outcome == "created":
                    tasks_created += 1
                elif outcome == "updated":
                    tasks_updated += 1
                elif outcome == "conflicted":
                    tasks_conflicted += 1
                elif outcome == "orphaned":
                    tasks_orphaned += 1
            except Exception as e:  # noqa: BLE001
                errors.append(f"item {item.item_node_id}: {e}")
                await _log(
                    db,
                    direction=SyncDirection.pull,
                    entity=SyncEntity.task,
                    entity_id=None,
                    gh_node_id=item.item_node_id,
                    trigger=trigger,
                    status=SyncStatus.failed,
                    org_id=org_id,
                    error_message=str(e),
                )
        if not page.has_next:
            break
        try:
            page = await _fetch_items_page(
                client, project_node_id=link.gh_project_node_id, after=page.end_cursor
            )
        except GitHubError as e:
            errors.append(f"pagination error: {e}")
            break

    # Orphan any tracked task whose GitHub item is no longer in the project.
    orphan_count = await _orphan_missing_items(
        db,
        link=link,
        seen_item_ids=seen_item_ids,
        trigger=trigger,
        org_id=org_id,
    )
    tasks_orphaned += orphan_count

    link.last_synced_at = datetime.now(timezone.utc)
    link.sync_cursor = None
    await db.flush()

    await _log(
        db,
        direction=SyncDirection.pull,
        entity=SyncEntity.project,
        entity_id=link.project_id,
        gh_node_id=link.gh_project_node_id,
        trigger=trigger,
        status=SyncStatus.success if not errors else SyncStatus.failed,
        org_id=org_id,
        response_payload={
            "items_seen": items_seen,
            "tasks_created": tasks_created,
            "tasks_updated": tasks_updated,
            "tasks_conflicted": tasks_conflicted,
            "tasks_orphaned": tasks_orphaned,
        },
        error_message="; ".join(errors) if errors else None,
    )
    return PullResult(
        link.id, items_seen, tasks_created, tasks_updated,
        tasks_conflicted, tasks_orphaned, errors,
    )


async def _fetch_items_page(client, *, project_node_id: str, after: str | None = None) -> ItemsPage:
    resp = await client.execute(
        GET_PROJECT_ITEMS_PAGE,
        {"projectId": project_node_id, "after": after, "first": _PAGE_SIZE},
    )
    node = resp.data.get("node") or {}
    items_raw = node.get("items") or {}
    parsed: list[ProjectItem] = []
    for raw in items_raw.get("nodes") or []:
        item = parse_item(raw)
        if item is not None:
            parsed.append(item)
    page_info = items_raw.get("pageInfo") or {}
    return ItemsPage(
        items=parsed,
        end_cursor=page_info.get("endCursor"),
        has_next=bool(page_info.get("hasNextPage")),
    )


async def _upsert_task_from_item(
    db: AsyncSession,
    *,
    link: GitHubProjectLink,
    item: ProjectItem,
    trigger: SyncTrigger,
    org_id: uuid.UUID | None = None,
) -> str:
    """Returns 'created' | 'updated' | 'conflicted' | 'orphaned' | 'noop'."""
    existing = (
        await db.execute(
            select(Task).where(Task.gh_item_node_id == item.item_node_id).with_for_update()
        )
    ).scalar_one_or_none()

    # Assignee mapping by github_login.
    assignee_id: uuid.UUID | None = None
    if item.content.assignee_logins:
        login = item.content.assignee_logins[0]
        u = (
            await db.execute(select(AppUser).where(AppUser.github_login == login))
        ).scalar_one_or_none()
        if u is not None:
            assignee_id = u.id

    gh_updated_at = item.content.updated_at
    status_value = item.status_name or "Todo"

    # Archived item: mark existing tasks as orphaned rather than risk clobber.
    if item.item_is_archived:
        if existing is None:
            return "noop"
        if existing.sync_last_error_code != "ITEM_ARCHIVED":
            existing.sync_state = SyncState.error
            existing.sync_last_error_code = "ITEM_ARCHIVED"
            existing.is_active = False
            existing.sync_last_attempt_at = datetime.now(timezone.utc)
            await db.flush()
            await _log(
                db,
                direction=SyncDirection.pull,
                entity=SyncEntity.task,
                entity_id=existing.id,
                gh_node_id=item.item_node_id,
                trigger=trigger,
                status=SyncStatus.skipped,
                org_id=org_id,
                response_payload={"reason": "ITEM_ARCHIVED"},
            )
        return "orphaned"

    if existing is None:
        task = Task(
            project_id=link.project_id,
            title=item.content.title or "(untitled)",
            description=_extract_local_from_remote(item.content.body),
            status=status_value,
            assignee_user_id=assignee_id,
            source=TaskSource.github,
            gh_item_node_id=item.item_node_id,
            gh_content_type=_content_type(item.content.kind),
            gh_issue_number=item.content.number,
            gh_repo=item.content.repo,
            gh_url=item.content.url,
            gh_updated_at=gh_updated_at,
            local_updated_at=datetime.now(timezone.utc),
            sync_state=SyncState.synced,
            is_active=True,
        )
        db.add(task)
        await db.flush()
        await _log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=item.item_node_id,
            trigger=trigger,
            status=SyncStatus.success,
            org_id=org_id,
            response_payload={"created": True, "title": task.title},
        )
        return "created"

    # Local pending or already conflicting: never silently overwrite.
    if existing.sync_state in (SyncState.pending_push, SyncState.conflict, SyncState.syncing):
        remote_moved = existing.gh_updated_at is None or gh_updated_at > existing.gh_updated_at
        if remote_moved:
            await _record_conflict(
                db,
                task=existing,
                remote_updated_at=gh_updated_at,
                trigger=trigger,
                org_id=org_id,
            )
            return "conflicted"
        return "noop"

    # Synced task: fast-forward from remote.
    changed = False
    new_title = item.content.title or "(untitled)"
    if existing.title != new_title:
        existing.title = new_title
        changed = True
    new_desc = _extract_local_from_remote(item.content.body)
    if existing.description != new_desc:
        existing.description = new_desc
        changed = True
    if existing.status != status_value:
        existing.status = status_value
        changed = True
    if existing.assignee_user_id != assignee_id:
        existing.assignee_user_id = assignee_id
        changed = True
    if existing.gh_issue_number != item.content.number:
        existing.gh_issue_number = item.content.number
        changed = True
    if existing.gh_url != item.content.url:
        existing.gh_url = item.content.url
        changed = True
    if existing.sync_last_error_code is not None:
        existing.sync_last_error_code = None

    existing.gh_updated_at = gh_updated_at
    if changed:
        existing.local_updated_at = datetime.now(timezone.utc)
        existing.sync_attempts = 0
    await db.flush()

    if changed:
        await _log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=existing.id,
            gh_node_id=item.item_node_id,
            trigger=trigger,
            status=SyncStatus.success,
            org_id=org_id,
            response_payload={"updated": True},
        )
        return "updated"
    return "noop"


async def _orphan_missing_items(
    db: AsyncSession,
    *,
    link: GitHubProjectLink,
    seen_item_ids: set[str],
    trigger: SyncTrigger,
    org_id: uuid.UUID | None = None,
) -> int:
    """Mark local GitHub-sourced tasks whose item_id was not in the page as deleted."""
    tracked = list(
        (
            await db.execute(
                select(Task).where(
                    Task.project_id == link.project_id,
                    Task.source == TaskSource.github,
                    Task.gh_item_node_id.is_not(None),
                )
            )
        ).scalars()
    )
    count = 0
    now = datetime.now(timezone.utc)
    for t in tracked:
        if t.gh_item_node_id in seen_item_ids:
            continue
        if t.sync_last_error_code == "ITEM_DELETED":
            continue
        t.sync_state = SyncState.error
        t.sync_last_error_code = "ITEM_DELETED"
        t.sync_last_attempt_at = now
        t.is_active = False
        count += 1
        await _log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=t.id,
            gh_node_id=t.gh_item_node_id,
            trigger=trigger,
            status=SyncStatus.skipped,
            org_id=org_id,
            response_payload={"reason": "ITEM_DELETED"},
        )
    if count:
        await db.flush()
    return count


def _content_type(kind: str) -> GhContentType:
    if kind == "issue":
        return GhContentType.issue
    if kind == "pull_request":
        return GhContentType.pull_request
    return GhContentType.draft


# --------------------------------------------------------------------------- #
# Push
# --------------------------------------------------------------------------- #

@dataclass
class PushResult:
    task_id: uuid.UUID
    status: SyncStatus
    error_message: str | None = None
    error_code: str | None = None
    conflict_remote_updated_at: str | None = None
    requeued_for_edit: bool = False


async def push_task(
    db: AsyncSession,
    *,
    task: Task,
    trigger: SyncTrigger,
    force: bool = False,
) -> PushResult:
    """Push local task state to GitHub.

    Caller must have set `task.sync_state = 'syncing'` and `sync_last_attempt_at`
    and committed (or be prepared to write the final state in the same
    transaction, which is what the resolve path does).

    `force=True` bypasses the conflict check. Only used by "Keep Mine" after
    explicit revalidation against the value stored at conflict time.
    """
    if task.gh_item_node_id is None:
        return PushResult(task.id, SyncStatus.skipped, "Task has no GitHub node id")

    client = get_client()

    # Resolve the project link and organization once so every push log
    # is tenant-scoped, including early error/conflict paths.
    link = (
        await db.execute(
            select(GitHubProjectLink).where(
                GitHubProjectLink.project_id == task.project_id
            )
        )
    ).scalar_one_or_none()

    org_id = (
        await db.execute(
            select(Project.org_id).where(Project.id == task.project_id)
        )
    ).scalar_one()

    lease_started_at = task.sync_last_attempt_at or datetime.now(timezone.utc)

    # ---- 1. Fetch remote ----
    try:
        resp = await client.execute(
            GET_PROJECT_ITEM_BY_ID, {"itemId": task.gh_item_node_id}
        )
    except GitHubNotFound:
        return await _mark_error(
            db,
            task=task,
            code="ITEM_DELETED",
            message="GitHub item no longer exists",
            trigger=trigger,
            org_id=org_id,
        )
    except GitHubRateLimited as e:
        return await _mark_pending(
            db,
            task=task,
            code="RATE_LIMITED",
            message=f"Rate limited; retry after {e.retry_after_seconds}s",
            trigger=trigger,
            org_id=org_id,
        )
    except GitHubError as e:
        return await _mark_error(
            db,
            task=task,
            code="FETCH_FAILED",
            message=str(e),
            trigger=trigger,
            org_id=org_id,
        )

    node = resp.data.get("node") or {}
    item = parse_item(node)
    if item is None:
        return await _mark_error(
            db,
            task=task,
            code="UNKNOWN_CONTENT",
            message="Unrecognized item content type",
            trigger=trigger,
            org_id=org_id,
        )

    if item.item_is_archived:
        return await _mark_error(
            db,
            task=task,
            code="ITEM_ARCHIVED",
            message="Item is archived in GitHub",
            trigger=trigger,
            org_id=org_id,
        )

    remote_updated_at = item.content.updated_at

    # ---- 2. Conflict check (skipped on force) ----
    if not force and task.gh_updated_at is not None and remote_updated_at > task.gh_updated_at:
        await _record_conflict(
            db,
            task=task,
            remote_updated_at=remote_updated_at,
            trigger=trigger,
            org_id=org_id,
        )
        return PushResult(
            task.id,
            SyncStatus.conflict,
            conflict_remote_updated_at=remote_updated_at.isoformat(),
        )

    # ---- 3. Push description ----
    try:
        composed = _compose_remote_body(task.description, item.content.body)
        if item.content.kind == "draft":
            await client.execute(
                UPDATE_DRAFT_ISSUE_BODY,
                {"draftIssueId": item.content.node_id, "body": composed},
            )
        else:
            await client.execute(
                UPDATE_ISSUE_BODY,
                {"issueId": item.content.node_id, "body": composed},
            )
    except GitHubRateLimited as e:
        return await _mark_pending(
            db,
            task=task,
            code="RATE_LIMITED",
            message=f"Rate limited; retry after {e.retry_after_seconds}s",
            trigger=trigger,
            org_id=org_id,
        )
    except GitHubError as e:
        return await _mark_error(
            db,
            task=task,
            code="PUSH_BODY_FAILED",
            message=str(e),
            trigger=trigger,
            org_id=org_id,
        )

    # ---- 4. Push status (best-effort) ----
    if link is not None and item.status_name != task.status:
        try:
            info = await github_service.fetch_project_info(
                owner=link.gh_owner,
                number=link.gh_project_number,
                owner_type="organization",
            )
            if info.status_field is None:
                info = await github_service.fetch_project_info(
                    owner=link.gh_owner,
                    number=link.gh_project_number,
                    owner_type="user",
                )
            status_field = info.status_field
            if status_field is not None:
                option = next(
                    (o for o in status_field.options if o.name == task.status), None
                )
                if option is not None:
                    await client.execute(
                        UPDATE_ITEM_SINGLE_SELECT_FIELD,
                        {
                            "projectId": link.gh_project_node_id,
                            "itemId": task.gh_item_node_id,
                            "fieldId": status_field.id,
                            "optionId": option.id,
                        },
                    )
                else:
                    await _log(
                        db,
                        direction=SyncDirection.push,
                        entity=SyncEntity.task,
                        entity_id=task.id,
                        gh_node_id=task.gh_item_node_id,
                        trigger=trigger,
                        status=SyncStatus.skipped,
                        org_id=org_id,
                        error_message=f"Status '{task.status}' has no matching option",
                    )
        except GitHubError as e:
            await _log(
                db,
                direction=SyncDirection.push,
                entity=SyncEntity.task,
                entity_id=task.id,
                gh_node_id=task.gh_item_node_id,
                trigger=trigger,
                status=SyncStatus.skipped,
                org_id=org_id,
                error_message=f"Status push skipped: {e}",
            )

    # ---- 5. Refresh remote updatedAt ----
    new_remote_updated_at = remote_updated_at
    try:
        refresh = await client.execute(
            GET_PROJECT_ITEM_BY_ID, {"itemId": task.gh_item_node_id}
        )
        refreshed = parse_item(refresh.data.get("node") or {})
        if refreshed is not None:
            new_remote_updated_at = refreshed.content.updated_at
    except GitHubError:
        pass

    # ---- 6. Final commit under row lock, checking for mid-flight edits ----
    current = (
        await db.execute(
            select(Task).where(Task.id == task.id).with_for_update()
        )
    ).scalar_one()

    current.gh_updated_at = new_remote_updated_at
    current.sync_last_attempt_at = datetime.now(timezone.utc)
    _clear_conflict(current)

    local_edited_during_push = current.local_updated_at > lease_started_at
    if local_edited_during_push:
        current.sync_state = SyncState.pending_push
        current.sync_last_error_code = None
        requeued = True
    else:
        current.sync_state = SyncState.synced
        current.sync_attempts = 0
        requeued = False

    await db.flush()

    await _log(
        db,
        direction=SyncDirection.push,
        entity=SyncEntity.task,
        entity_id=current.id,
        gh_node_id=current.gh_item_node_id,
        trigger=trigger,
        status=SyncStatus.success,
        org_id=org_id,
        response_payload={
            "title": current.title,
            "status": current.status,
            "forced": force,
            "requeued_for_edit": requeued,
        },
    )
    return PushResult(
        task_id=current.id,
        status=SyncStatus.success,
        requeued_for_edit=requeued,
    )