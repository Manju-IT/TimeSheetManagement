"""Aggregation-only reporting.

All aggregation happens in PostgreSQL. Python only shapes the result for JSON.
Scope is enforced by `resolve_scope` before any query runs.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser
from app.models.attendance_day import AttendanceDay
from app.models.project import Project
from app.models.team import TeamMember
from app.models.time_entry import TimeEntry
from app.models.user import AppUser


@dataclass
class ReportFilters:
    from_date: date
    to_date: date
    project_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    billable: bool | None = None


async def resolve_scope(db: AsyncSession, actor: CurrentUser) -> set[uuid.UUID] | None:
    """Return the set of user_ids the actor may see. None = org-wide (admin)."""
    if actor.is_admin:
        return None
    if actor.is_manager:
        ids: set[uuid.UUID] = {actor.id}
        if actor.managed_team_ids:
            rows = await db.execute(
                select(TeamMember.user_id).where(
                    TeamMember.team_id.in_(actor.managed_team_ids)
                )
            )
            ids.update(uid for (uid,) in rows.all())
        return ids
    return {actor.id}


async def list_eligible_users(
    db: AsyncSession, actor: CurrentUser
) -> list[AppUser]:
    scope = await resolve_scope(db, actor)
    if scope is None:
        rows = await db.execute(
            select(AppUser)
            .where(AppUser.org_id == actor.org_id)
            .order_by(AppUser.full_name.asc())
        )
    else:
        if not scope:
            return []
        rows = await db.execute(
            select(AppUser).where(AppUser.id.in_(scope)).order_by(AppUser.full_name.asc())
        )
    return list(rows.scalars())


def _scope_filter(stmt: Select, scope: set[uuid.UUID] | None, requested_user_id: uuid.UUID | None) -> Select | None:
    """Apply user scope + requested-user narrowing. Returns None if no access."""
    if scope is None:
        if requested_user_id is not None:
            return stmt.where(TimeEntry.user_id == requested_user_id)
        return stmt
    if requested_user_id is not None:
        if requested_user_id not in scope:
            return None
        return stmt.where(TimeEntry.user_id == requested_user_id)
    if not scope:
        return None
    return stmt.where(TimeEntry.user_id.in_(scope))


def _apply_common(stmt: Select, filters: ReportFilters) -> Select:
    stmt = stmt.where(
        TimeEntry.work_date >= filters.from_date,
        TimeEntry.work_date <= filters.to_date,
    )
    if filters.project_id is not None:
        stmt = stmt.where(TimeEntry.project_id == filters.project_id)
    if filters.billable is not None:
        stmt = stmt.where(TimeEntry.billable.is_(filters.billable))
    return stmt


# --------------------------------------------------------------------------- #
# Aggregations
# --------------------------------------------------------------------------- #

async def hours_by_project(
    db: AsyncSession, scope, filters: ReportFilters
) -> tuple[list[dict], int, int]:
    base = (
        select(
            TimeEntry.project_id,
            Project.name,
            Project.code,
            func.coalesce(func.sum(TimeEntry.duration_minutes), 0),
            func.count(TimeEntry.id),
        )
        .join(Project, Project.id == TimeEntry.project_id)
        .group_by(TimeEntry.project_id, Project.name, Project.code)
    )
    base = _scope_filter(base, scope, filters.user_id)
    if base is None:
        return [], 0, 0
    base = _apply_common(base, filters)
    base = base.order_by(func.sum(TimeEntry.duration_minutes).desc())
    rows = (await db.execute(base)).all()
    items = [
        {
            "project_id": pid,
            "name": name,
            "code": code,
            "minutes": int(mins),
            "entries": int(entries),
        }
        for pid, name, code, mins, entries in rows
    ]
    total_minutes = sum(r["minutes"] for r in items)
    total_entries = sum(r["entries"] for r in items)
    return items, total_minutes, total_entries


async def hours_by_member(
    db: AsyncSession, scope, filters: ReportFilters
) -> list[dict]:
    base = (
        select(
            TimeEntry.user_id,
            AppUser.full_name,
            AppUser.email,
            func.coalesce(func.sum(TimeEntry.duration_minutes), 0),
            func.count(TimeEntry.id),
        )
        .join(AppUser, AppUser.id == TimeEntry.user_id)
        .group_by(TimeEntry.user_id, AppUser.full_name, AppUser.email)
    )
    base = _scope_filter(base, scope, filters.user_id)
    if base is None:
        return []
    base = _apply_common(base, filters)
    base = base.order_by(func.sum(TimeEntry.duration_minutes).desc())
    rows = (await db.execute(base)).all()
    return [
        {
            "user_id": uid,
            "full_name": name,
            "email": email,
            "minutes": int(mins),
            "entries": int(entries),
        }
        for uid, name, email, mins, entries in rows
    ]


async def daily_trend(
    db: AsyncSession, scope, filters: ReportFilters
) -> list[dict]:
    base = select(
        TimeEntry.work_date,
        func.coalesce(func.sum(TimeEntry.duration_minutes), 0),
        func.count(TimeEntry.id),
    ).group_by(TimeEntry.work_date)
    base = _scope_filter(base, scope, filters.user_id)
    if base is None:
        return []
    base = _apply_common(base, filters)
    base = base.order_by(TimeEntry.work_date.asc())
    rows = (await db.execute(base)).all()
    by_date = {wd: (int(mins), int(entries)) for wd, mins, entries in rows}

    out: list[dict] = []
    d = filters.from_date
    while d <= filters.to_date:
        mins, entries = by_date.get(d, (0, 0))
        out.append({"work_date": d, "minutes": mins, "entries": entries})
        d += timedelta(days=1)
    return out


async def attendance_summary(
    db: AsyncSession, scope, filters: ReportFilters
) -> list[dict]:
    base = (
        select(
            AttendanceDay.user_id,
            AppUser.full_name,
            AppUser.email,
            func.count(AttendanceDay.id),
            func.coalesce(func.sum(AttendanceDay.total_session_seconds), 0),
            func.coalesce(func.sum(AttendanceDay.logged_seconds), 0),
        )
        .join(AppUser, AppUser.id == AttendanceDay.user_id)
        .where(
            AttendanceDay.work_date >= filters.from_date,
            AttendanceDay.work_date <= filters.to_date,
        )
        .group_by(AttendanceDay.user_id, AppUser.full_name, AppUser.email)
    )
    # Scope + user filter (independent of project/billable, which don't apply here).
    if scope is None:
        if filters.user_id is not None:
            base = base.where(AttendanceDay.user_id == filters.user_id)
    else:
        if filters.user_id is not None:
            if filters.user_id not in scope:
                return []
            base = base.where(AttendanceDay.user_id == filters.user_id)
        else:
            if not scope:
                return []
            base = base.where(AttendanceDay.user_id.in_(scope))
    base = base.order_by(AppUser.full_name.asc())
    rows = (await db.execute(base)).all()
    out = []
    for uid, name, email, d, ss, ls in rows:
        ss = int(ss)
        ls = int(ls)
        out.append(
            {
                "user_id": uid,
                "full_name": name,
                "email": email,
                "days": int(d),
                "session_seconds": ss,
                "logged_seconds": ls,
                "variance_seconds": ss - ls,
            }
        )
    return out


async def summary(db: AsyncSession, actor: CurrentUser, filters: ReportFilters) -> dict:
    scope = await resolve_scope(db, actor)
    projects, total_minutes, total_entries = await hours_by_project(db, scope, filters)
    members = await hours_by_member(db, scope, filters)
    trend = await daily_trend(db, scope, filters)
    attendance = await attendance_summary(db, scope, filters)
    return {
        "from_date": filters.from_date,
        "to_date": filters.to_date,
        "total_minutes": total_minutes,
        "total_entries": total_entries,
        "hours_by_project": projects,
        "hours_by_member": members,
        "daily_trend": trend,
        "attendance_summary": attendance,
    }