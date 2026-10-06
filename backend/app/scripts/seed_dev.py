"""Local-development seeding.

Usage:
    cd backend
    python -m app.scripts.seed_dev

Creates (idempotent):
  - One organization "Demo Org" with a default policy
  - One work site (optional; safe to skip)
  - Demo users: admin@example.com / manager@example.com / member@example.com
    (only when LOCAL_DEV_AUTH=true)

Does NOT create real credentials. Do not run in production.
"""
from __future__ import annotations

import asyncio
from datetime import time

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.enums import Role, UserStatus
from app.models.organization import Organization, OrgPolicy
from app.models.user import AppUser, UserRole
from app.models.work_site import WorkSite


async def _ensure_org(session) -> Organization:  # noqa: ANN001
    org = (await session.execute(select(Organization).limit(1))).scalar_one_or_none()
    if org is None:
        org = Organization(
            name="Demo Org",
            default_timezone="UTC",
            workday_cutoff=time(6, 0),
        )
        session.add(org)
        await session.flush()
        print(f"[seed] created organization id={org.id}")
    else:
        print(f"[seed] organization exists id={org.id}")

    policy = (
        await session.execute(select(OrgPolicy).where(OrgPolicy.org_id == org.id))
    ).scalar_one_or_none()
    if policy is None:
        session.add(
            OrgPolicy(
                org_id=org.id,
                workday_hours=settings.DEFAULT_WORKDAY_HOURS,
                variance_threshold_minutes=settings.VARIANCE_THRESHOLD_MINUTES,
                auto_logout_minutes=settings.AUTO_LOGOUT_MINUTES,
                allow_login_without_location=True,
                location_retention_days=settings.LOCATION_RETENTION_DAYS,
            )
        )
        print("[seed] created org policy")
    return org


async def _ensure_site(session, org: Organization) -> None:  # noqa: ANN001
    exists = (
        await session.execute(
            select(WorkSite).where(WorkSite.org_id == org.id).limit(1)
        )
    ).scalar_one_or_none()
    if exists is None:
        session.add(
            WorkSite(
                org_id=org.id,
                name="EZ AI Medtech Pvt Ltd",
                latitude=17.433560247791203,
                longitude=78.38727589571069,
                radius_m=200.0,
                is_active=True,
            )
        )
        print("[seed] created work site 'EZ AI Medtech Pvt Ltd'")


async def _ensure_user(
    session,  # noqa: ANN001
    org: Organization,
    *,
    email: str,
    full_name: str,
    roles: list[Role],
) -> None:
    user = (await session.execute(select(AppUser).where(AppUser.email == email))).scalar_one_or_none()
    if user is None:
        user = AppUser(
            org_id=org.id,
            ims_user_id=f"dev:{email}",
            email=email,
            full_name=full_name,
            timezone="UTC",
            status=UserStatus.active,
        )
        session.add(user)
        await session.flush()
        print(f"[seed] created user {email} id={user.id}")
    existing = {
        r.role for r in (await session.execute(select(UserRole).where(UserRole.user_id == user.id))).scalars()
    }
    for role in roles:
        if role not in existing:
            session.add(UserRole(user_id=user.id, role=role))
            print(f"[seed] + role {role.value} for {email}")


async def _ensure_team(
    session,  # noqa: ANN001
    org,
    name: str,
    *,
    manager_email: str | None,
    member_emails: list[str],
) -> None:
    from app.models.team import Team, TeamMember

    team = (
        await session.execute(
            select(Team).where(
                Team.org_id == org.id,
                Team.name == name,
            )
        )
    ).scalar_one_or_none()

    if team is None:
        team = Team(
            org_id=org.id,
            name=name,
        )
        session.add(team)
        await session.flush()

        print(
            f"[seed] created team '{name}' id={team.id}"
        )

    async def _add(
        email: str,
        is_manager: bool,
    ) -> None:
        user = (
            await session.execute(
                select(AppUser).where(
                    AppUser.email == email
                )
            )
        ).scalar_one_or_none()

        if user is None:
            return

        existing = (
            await session.execute(
                select(TeamMember).where(
                    TeamMember.team_id == team.id,
                    TeamMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            session.add(
                TeamMember(
                    team_id=team.id,
                    user_id=user.id,
                    is_manager=is_manager,
                )
            )
            return

        # If this user is the configured manager, make sure
        # the existing membership is marked as manager.
        if is_manager and not existing.is_manager:
            existing.is_manager = True

    # Add the manager first.
    if manager_email:
        await _add(
            manager_email,
            True,
        )

    # Add ordinary members.
    #
    # If manager_email also appears in member_emails,
    # _add() finds the existing membership and does not
    # insert a duplicate row.
    for email in member_emails:
        await _add(
            email,
            False,
        )

async def _ensure_project(
    session,  # noqa: ANN001
    org,
    *,
    name: str,
    code: str | None = None,
) -> "Project":
    from app.models.project import Project
    from app.models.enums import ProjectSource

    existing = (
        await session.execute(
            select(Project).where(Project.org_id == org.id, Project.name == name)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    p = Project(org_id=org.id, name=name, code=code, source=ProjectSource.manual, is_active=True)
    session.add(p)
    await session.flush()
    print(f"[seed] created project '{name}' id={p.id}")
    return p


async def _ensure_task(
    session,  # noqa: ANN001
    project,
    *,
    title: str,
    status: str = "Todo",
) -> None:
    from app.models.task import Task
    from app.models.enums import TaskSource, SyncState
    from datetime import datetime, timezone

    existing = (
        await session.execute(
            select(Task).where(Task.project_id == project.id, Task.title == title)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return
    t = Task(
        project_id=project.id,
        title=title,
        description="",
        status=status,
        source=TaskSource.manual,
        local_updated_at=datetime.now(timezone.utc),
        sync_state=SyncState.synced,
        is_active=True,
    )
    session.add(t)
    await session.flush()
    print(f"[seed] created task '{title}'")

async def _ensure_week_of_data(
    session,  # noqa: ANN001
    org,
    *,
    user_email: str,
    project_name: str,
    task_title: str,
) -> None:
    """Create a realistic past-week of attendance and time entries for demo purposes.

    Idempotent: reruns do nothing if the entries already exist.
    """
    from datetime import date, datetime, timedelta, time as dtime, timezone as tz
    from app.models.attendance_day import AttendanceDay
    from app.models.enums import (
        AttendanceStatus, GeoEventType, GeoPermission, TimeEntryStatus,
    )
    from app.models.geo_event import GeoEvent
    from app.models.time_entry import TimeEntry
    from app.models.work_session import WorkSession
    from app.models.project import Project
    from app.models.task import Task

    user = (
        await session.execute(select(AppUser).where(AppUser.email == user_email))
    ).scalar_one_or_none()
    if user is None:
        return

    # Use this organization's active work site for seeded location events.
    # Avoid inserting unrelated coordinates that contradict inside_site=True.
    site = (
        await session.execute(
            select(WorkSite)
            .where(
                WorkSite.org_id == org.id,
                WorkSite.is_active.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    latitude = float(site.latitude) if site is not None else None
    longitude = float(site.longitude) if site is not None else None
    site_id = site.id if site is not None else None

    project = (
        await session.execute(
            select(Project).where(
                Project.org_id == org.id,
                Project.name == project_name,
            )
        )
    ).scalar_one_or_none()
    if project is None:
        return

    task = (
        await session.execute(
            select(Task).where(Task.project_id == project.id, Task.title == task_title)
        )
    ).scalar_one_or_none()

    # Last 5 weekdays, ending yesterday.
    today = datetime.now(tz.utc).date()
    workdays: list[date] = []
    d = today - timedelta(days=1)
    while len(workdays) < 5:
        if d.weekday() < 5:
            workdays.append(d)
        d -= timedelta(days=1)

    seeded_days = 0
    for wd in workdays:
        existing = (
            await session.execute(
                select(AttendanceDay).where(
                    AttendanceDay.user_id == user.id, AttendanceDay.work_date == wd
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        login_at = datetime.combine(wd, dtime(9, 0), tzinfo=tz.utc)
        logout_at = datetime.combine(wd, dtime(17, 30), tzinfo=tz.utc)
        total_seconds = int((logout_at - login_at).total_seconds())

        login_evt = GeoEvent(
            user_id=user.id,
            event_type=GeoEventType.login,
            occurred_at=login_at,
            client_reported_at=login_at,
            latitude=latitude,
            longitude=longitude,
            accuracy_m=12.0 if site is not None else None,
            geo_permission=GeoPermission.granted if site is not None else GeoPermission.unavailable,
            site_id=site_id,
            inside_site=True if site is not None else None,
            distance_to_site_m=0.0 if site is not None else None,
            ip_address="10.0.0.5",
            user_agent="seed-script",
        )
        logout_evt = GeoEvent(
            user_id=user.id,
            event_type=GeoEventType.logout,
            occurred_at=logout_at,
            client_reported_at=logout_at,
            latitude=latitude,
            longitude=longitude,
            accuracy_m=12.0 if site is not None else None,
            geo_permission=GeoPermission.granted if site is not None else GeoPermission.unavailable,
            site_id=site_id,
            inside_site=True if site is not None else None,
            distance_to_site_m=0.0 if site is not None else None,
            ip_address="10.0.0.5",
            user_agent="seed-script",
        )
        session.add_all([login_evt, logout_evt])
        await session.flush()

        ws = WorkSession(
            user_id=user.id,
            login_at=login_at,
            logout_at=logout_at,
            logout_reason="user",
            login_event_id=login_evt.id,
            logout_event_id=logout_evt.id,
            session_seconds=total_seconds,
        )
        session.add(ws)

        entry = TimeEntry(
            user_id=user.id,
            work_date=wd,
            project_id=project.id,
            task_id=task.id if task else None,
            task_title_snapshot=task.title if task else None,
            description="Development and review",
            duration_minutes=450,   # 7h 30m
            billable=True,
            status=TimeEntryStatus.draft,
            version=1,
            started_at=login_at,
            ended_at=logout_at,
        )
        session.add(entry)

        day = AttendanceDay(
            user_id=user.id,
            work_date=wd,
            first_login_at=login_at,
            last_logout_at=logout_at,
            first_login_event_id=login_evt.id,
            last_logout_event_id=logout_evt.id,
            total_session_seconds=total_seconds,
            logged_seconds=450 * 60,
            status=AttendanceStatus.closed,
        )
        session.add(day)
        seeded_days += 1

    await session.flush()
    print(f"[seed] seeded {seeded_days} new days for {user_email}")

async def main() -> None:
    if not settings.LOCAL_DEV_AUTH:
        print("[seed] LOCAL_DEV_AUTH is false — creating org only, no demo users.")
    async with AsyncSessionLocal() as session:
        org = await _ensure_org(session)
        await _ensure_site(session, org)

        apollo = await _ensure_project(session, org, name="Apollo", code="APL")
        await _ensure_task(session, apollo, title="Fix auth redirect")
        await _ensure_task(session, apollo, title="Review PR")

        internal = await _ensure_project(session, org, name="Internal", code="INT")
        await _ensure_task(session, internal, title="Standup + planning")
        if settings.LOCAL_DEV_AUTH:
            await _ensure_user(
                session,
                org,
                email="admin@example.com",
                full_name="Ada Admin",
                roles=[Role.admin],
            )

            await _ensure_user(
                session,
                org,
                email="manager@example.com",
                full_name="Mira Manager",
                roles=[Role.manager],
            )

            await _ensure_user(
                session,
                org,
                email="member@example.com",
                full_name="Milo Member",
                roles=[Role.member],
            )

            # Seed attendance and time entries only after the demo member exists.
            await _ensure_week_of_data(
                session, org,
                user_email="member@example.com",
                project_name="Apollo",
                task_title="Fix auth redirect",
            )

            await _ensure_team(
                session,
                org,
                "Engineering",
                manager_email="manager@example.com",
                member_emails=["member@example.com"],
            )

            await _ensure_team(
                session,
                org,
                "Operations",
                manager_email="admin@example.com",
                member_emails=[],
            )
        await session.commit()
    print("[seed] done")


if __name__ == "__main__":
    asyncio.run(main())