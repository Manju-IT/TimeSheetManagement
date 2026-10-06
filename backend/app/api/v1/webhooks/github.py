"""GitHub webhook receiver.

Verifies HMAC-SHA256 signature with `GITHUB_WEBHOOK_SECRET`. On valid
`projects_v2_item` events, triggers a background pull for the matching link.

Rate-limited implicitly: GitHub delivers a bounded number of events, and the
pull itself takes the per-project advisory lock so multiple events cannot
overlap.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.github_project_link import GitHubProjectLink
from app.models.enums import SyncTrigger
from app.services import github_sync_service
from app.workers.github_sync_worker import _run_pull

log = get_logger("app.github.webhook")
router = APIRouter(prefix="/webhooks/github", tags=["webhooks"])


def _verify_signature(raw_body: bytes, signature_header: str | None) -> None:
    if not settings.GITHUB_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    if not signature_header or not signature_header.startswith("sha256="):
        raise HTTPException(status_code=401, detail="Missing signature")
    expected = hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    provided = signature_header.split("=", 1)[1]
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(status_code=401, detail="Invalid signature")


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None, alias="X-Hub-Signature-256"),
    x_github_event: str | None = Header(default=None, alias="X-GitHub-Event"),
    x_github_delivery: str | None = Header(default=None, alias="X-GitHub-Delivery"),
) -> Response:
    raw = await request.body()
    _verify_signature(raw, x_hub_signature_256)

    if x_github_event not in ("projects_v2_item", "issues", "pull_request"):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        payload: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    project_node_id: str | None = None
    if x_github_event == "projects_v2_item":
        project_node_id = (payload.get("projects_v2_item") or {}).get("project_node_id")
    else:
        # issues / PR events don't carry a project id; pull all links.
        project_node_id = None

    async with AsyncSessionLocal() as db:
        stmt = select(GitHubProjectLink)
        if project_node_id:
            stmt = stmt.where(GitHubProjectLink.gh_project_node_id == project_node_id)
        links = list((await db.execute(stmt)).scalars())

    for link in links:
        log.info(
            "webhook_triggering_pull",
            delivery=x_github_delivery,
            event=x_github_event,
            link_id=str(link.id),
        )
        import asyncio
        asyncio.create_task(_run_pull(link.id))

    return Response(status_code=status.HTTP_202_ACCEPTED)