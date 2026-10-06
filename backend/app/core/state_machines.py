"""Explicit state machines. Every state change MUST route through this module.

Rationale for `closed -> open` on attendance:
    The spec's mandatory chain (open -> closed -> submitted -> approved/rejected)
    describes the end-of-day to approval path. A user who checks out for lunch and
    checks back in the same work_date must not create a *new* attendance_day; the
    same row reopens. This is the only back-transition we permit, and it is
    audited with a `reason` field so it's never silent.
"""
from __future__ import annotations

from typing import Final

from app.core.exceptions import InvalidStateTransition


TIME_ENTRY_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "draft": frozenset({"submitted"}),
    "submitted": frozenset({"approved", "rejected"}),
    "rejected": frozenset({"draft"}),
    "approved": frozenset(),
}

TIMESHEET_PERIOD_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "draft": frozenset({"submitted"}),
    "submitted": frozenset({"approved", "rejected"}),
    "rejected": frozenset({"draft"}),
    "approved": frozenset(),
}

ATTENDANCE_DAY_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "open": frozenset({"closed"}),
    "closed": frozenset({"open", "submitted"}),   # open: user resumed; documented
    "submitted": frozenset({"approved", "rejected"}),
    "rejected": frozenset({"closed"}),            # back to closed, not open
    "approved": frozenset(),
}


def can_transition(
    table: dict[str, frozenset[str]], current: str, target: str
) -> bool:
    return target in table.get(current, frozenset())


def assert_transition(
    table: dict[str, frozenset[str]],
    current: str,
    target: str,
    *,
    entity: str,
    details: dict | None = None,
) -> None:
    if not can_transition(table, current, target):
        raise InvalidStateTransition(
            f"Cannot transition {entity} from '{current}' to '{target}'",
            details={"entity": entity, "from": current, "to": target, **(details or {})},
        )