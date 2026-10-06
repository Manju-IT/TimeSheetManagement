from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.reports import ReportFilterUserOut, ReportSummaryOut
from app.services import report_service
from app.utils.tabular_export import to_csv, to_xlsx

router = APIRouter(prefix="/reports", tags=["reports"])


def _filters(
    from_date: date,
    to_date: date,
    project_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    billable: bool | None,
) -> report_service.ReportFilters:
    if from_date > to_date:
        # Swap silently - no need to fail a user who mixed up the order.
        from_date, to_date = to_date, from_date
    return report_service.ReportFilters(
        from_date=from_date,
        to_date=to_date,
        project_id=project_id,
        user_id=user_id,
        billable=billable,
    )


@router.get("/users", response_model=list[ReportFilterUserOut])
async def eligible_users(
    actor: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReportFilterUserOut]:
    users = await report_service.list_eligible_users(db, actor)
    return [ReportFilterUserOut.model_validate(u) for u in users]


@router.get(
    "/summary",
    response_model=ReportSummaryOut,
    dependencies=[Depends(rate_limit("reports.read"))],
)
async def summary(
    from_date: date = Query(...),
    to_date: date = Query(...),
    project_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    actor: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportSummaryOut:
    result = await report_service.summary(
        db,
        actor,
        _filters(from_date, to_date, project_id, user_id, billable),
    )
    return ReportSummaryOut.model_validate(result)


@router.get(
    "/export.csv",
    dependencies=[Depends(rate_limit("reports.read"))],
)
async def export_csv(
    from_date: date = Query(...),
    to_date: date = Query(...),
    project_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    report: str = Query(default="projects", pattern="^(projects|members|trend|attendance)$"),
    actor: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    f = _filters(from_date, to_date, project_id, user_id, billable)
    scope = await report_service.resolve_scope(db, actor)

    if report == "projects":
        items, _, _ = await report_service.hours_by_project(db, scope, f)
        headers = ["name", "code", "minutes", "hours", "entries"]
        rows = [
            {**r, "hours": round(r["minutes"] / 60, 2)} for r in items
        ]
    elif report == "members":
        items = await report_service.hours_by_member(db, scope, f)
        headers = ["full_name", "email", "minutes", "hours", "entries"]
        rows = [{**r, "hours": round(r["minutes"] / 60, 2)} for r in items]
    elif report == "trend":
        items = await report_service.daily_trend(db, scope, f)
        headers = ["work_date", "minutes", "hours", "entries"]
        rows = [{**r, "hours": round(r["minutes"] / 60, 2)} for r in items]
    else:
        items = await report_service.attendance_summary(db, scope, f)
        headers = [
            "full_name", "email", "days",
            "session_seconds", "logged_seconds", "variance_seconds",
        ]
        rows = items

    body = to_csv(headers, rows)
    filename = f"report-{report}-{from_date}_{to_date}.csv"
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/export.xlsx",
    dependencies=[Depends(rate_limit("reports.read"))],
)
async def export_xlsx(
    from_date: date = Query(...),
    to_date: date = Query(...),
    project_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    actor: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    f = _filters(from_date, to_date, project_id, user_id, billable)
    scope = await report_service.resolve_scope(db, actor)

    projects, _, _ = await report_service.hours_by_project(db, scope, f)
    members = await report_service.hours_by_member(db, scope, f)
    trend = await report_service.daily_trend(db, scope, f)
    attendance = await report_service.attendance_summary(db, scope, f)

    sheets = {
        "Hours by project": (
            ["name", "code", "minutes", "hours", "entries"],
            [{**r, "hours": round(r["minutes"] / 60, 2)} for r in projects],
        ),
        "Hours by member": (
            ["full_name", "email", "minutes", "hours", "entries"],
            [{**r, "hours": round(r["minutes"] / 60, 2)} for r in members],
        ),
        "Daily trend": (
            ["work_date", "minutes", "hours", "entries"],
            [{**r, "hours": round(r["minutes"] / 60, 2)} for r in trend],
        ),
        "Attendance summary": (
            [
                "full_name", "email", "days",
                "session_seconds", "logged_seconds", "variance_seconds",
            ],
            attendance,
        ),
    }

    body = to_xlsx(sheets)
    filename = f"report-{from_date}_{to_date}.xlsx"
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )