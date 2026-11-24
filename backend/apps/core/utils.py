from __future__ import annotations

import csv
import io
from collections.abc import Iterable

from django.http import HttpResponse


def csv_response(filename: str, header: list[str], rows: Iterable[Iterable]) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def model_changes(instance, data: dict, fields: Iterable[str]) -> dict:
    """Return {field: [old, new]} for the fields that differ between instance and data."""
    changes = {}
    for f in fields:
        if f in data:
            old = getattr(instance, f, None)
            new = data[f]
            if hasattr(old, "pk"):
                old = str(old.pk)
            if hasattr(new, "pk"):
                new = str(new.pk)
            if str(old) != str(new):
                changes[f] = [str(old), str(new)]
    return changes
