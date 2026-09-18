from __future__ import annotations

from pydantic import BaseModel
from fastapi import Query

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25


class Pagination(BaseModel):
    page: int
    page_size: int
    offset: int
    limit: int

    @property
    def meta_has_next(self) -> bool:
        return False  # computed by caller with total


async def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> Pagination:
    return Pagination(
        page=page,
        page_size=page_size,
        offset=(page - 1) * page_size,
        limit=page_size,
    )