from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.code_link import CodeLink
from app.models.enums import CodeLinkType
from app.utils.github_url_parser import looks_like_github, parse_github_url


@dataclass
class ParsedCodeLink:
    url: str
    link_type: CodeLinkType
    repo: str | None
    ref: str | None
    number: str | None
    note: str | None


def parse(url: str, note: str | None = None) -> ParsedCodeLink:
    url = url.strip()
    if not looks_like_github(url):
        return ParsedCodeLink(
            url=url, link_type=CodeLinkType.other, repo=None, ref=None, number=None, note=note
        )
    parsed = parse_github_url(url)
    return ParsedCodeLink(
        url=url,
        link_type=CodeLinkType(parsed.link_type),
        repo=parsed.repo,
        ref=parsed.ref,
        number=parsed.number,
        note=note,
    )


async def replace_for_entry(
    db: AsyncSession,
    *,
    time_entry_id: uuid.UUID,
    links: list[ParsedCodeLink],
) -> list[CodeLink]:
    await db.execute(delete(CodeLink).where(CodeLink.time_entry_id == time_entry_id))
    out: list[CodeLink] = []
    for link in links:
        row = CodeLink(
            time_entry_id=time_entry_id,
            url=link.url,
            link_type=link.link_type,
            repo=link.repo,
            ref=link.ref,
            number=link.number,
            note=link.note,
        )
        db.add(row)
        out.append(row)
    await db.flush()
    return out