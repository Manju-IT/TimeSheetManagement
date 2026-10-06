"""CSV and XLSX writers. Both take plain lists of dicts."""
from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from typing import Any


def to_csv(headers: list[str], rows: Iterable[dict[str, Any]]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8")


def to_xlsx(sheets: dict[str, tuple[list[str], list[dict[str, Any]]]]) -> bytes:
    """sheets: {sheet_name: (headers, rows)}. Multi-sheet workbook."""
    from openpyxl import Workbook  # lazy import; openpyxl is optional at runtime

    wb = Workbook()
    # Remove the default sheet if we have at least one real one.
    default = wb.active

    for idx, (name, (headers, rows)) in enumerate(sheets.items()):
        if idx == 0:
            ws = default
            ws.title = name[:31]
        else:
            ws = wb.create_sheet(title=name[:31])
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h) for h in headers])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()