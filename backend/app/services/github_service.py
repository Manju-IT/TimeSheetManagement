"""Link management + project resolution."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, NotFound
from app.integrations.github.client import get_client
from app.integrations.github.errors import GitHubNotFound
from app.integrations.github.queries import (
    GET_ORG_PROJECT,
    GET_USER_PROJECT,
    VIEWER_QUERY,
)
from app.integrations.github.types import ProjectInfo, parse_project_info
from app.models.enums import ProjectSource
from app.models.github_project_link import GitHubProjectLink
from app.models.project import Project


async def list_links(db: AsyncSession, org_id: uuid.UUID) -> list[GitHubProjectLink]:
    stmt = (
        select(GitHubProjectLink)
        .join(Project, Project.id == GitHubProjectLink.project_id)
        .where(Project.org_id == org_id)
        .order_by(GitHubProjectLink.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars())


async def get_link(db: AsyncSession, link_id: uuid.UUID) -> GitHubProjectLink | None:
    return (
        await db.execute(
            select(GitHubProjectLink).where(GitHubProjectLink.id == link_id)
        )
    ).scalar_one_or_none()


async def get_link_or_404(db: AsyncSession, link_id: uuid.UUID) -> GitHubProjectLink:
    link = await get_link(db, link_id)
    if link is None:
        raise NotFound("GitHub project link not found")
    return link


async def fetch_project_info(
    *, owner: str, number: int, owner_type: str
) -> ProjectInfo:
    client = get_client()
    query = GET_ORG_PROJECT if owner_type == "organization" else GET_USER_PROJECT
    resp = await client.execute(query, {"owner": owner, "number": number})
    container_key = "organization" if owner_type == "organization" else "user"
    node = (resp.data.get(container_key) or {}).get("projectV2")
    if node is None:
        raise GitHubNotFound(f"GitHub project {owner}#{number} not found")
    return parse_project_info(node)


async def link_project(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    gh_owner: str,
    gh_project_number: int,
    default_repo: str | None,
    owner_type: str,
) -> GitHubProjectLink:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None or project.org_id != org_id:
        raise NotFound("Project not found in this organization")

    existing = (
        await db.execute(
            select(GitHubProjectLink).where(GitHubProjectLink.project_id == project_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise Conflict("This project is already linked to a GitHub project")

    info = await fetch_project_info(
        owner=gh_owner, number=gh_project_number, owner_type=owner_type
    )

    dup = (
        await db.execute(
            select(GitHubProjectLink).where(
                GitHubProjectLink.gh_project_node_id == info.node_id
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise Conflict("This GitHub project is already linked to another project")

    link = GitHubProjectLink(
        project_id=project_id,
        gh_owner=gh_owner,
        gh_project_number=gh_project_number,
        gh_project_node_id=info.node_id,
        default_repo=default_repo,
        last_synced_at=None,
        sync_cursor=None,
    )
    db.add(link)
    await db.flush()

    # Mark the local project as GitHub-sourced.
    project.source = ProjectSource.github
    await db.flush()
    return link


async def unlink_project(db: AsyncSession, *, org_id: uuid.UUID, link_id: uuid.UUID) -> None:
    link = await get_link_or_404(db, link_id)
    project = (
        await db.execute(select(Project).where(Project.id == link.project_id))
    ).scalar_one()
    if project.org_id != org_id:
        raise NotFound("Project not found in this organization")
    await db.delete(link)
    await db.flush()


async def test_connection() -> tuple[bool, str | None, str | None]:
    """Returns (ok, viewer_login, error_message)."""
    from app.core.config import settings
    try:
        client = get_client()
        resp = await client.execute(VIEWER_QUERY, {})
        viewer = (resp.data.get("viewer") or {})
        return True, viewer.get("login"), None
    except Exception as e:  # noqa: BLE001
        return False, None, f"{type(e).__name__}: {e}"