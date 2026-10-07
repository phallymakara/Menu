"""Guest table-session authentication for the public QR ordering endpoints."""

from typing import Annotated

from fastapi import Security
from fastapi.security import APIKeyHeader

TABLE_SESSION_TOKEN_HEADER = "X-Table-Session-Token"

# A header keeps the session token out of URLs, so it never lands in access logs,
# proxy logs, or browser history the way a query parameter would.
table_session_token_scheme = APIKeyHeader(
    name=TABLE_SESSION_TOKEN_HEADER,
    scheme_name="TableSessionToken",
    description=(
        "Session token returned when the guest's table session was opened "
        "(``session_token`` in the open-session response)."
    ),
)

TableSessionToken = Annotated[str, Security(table_session_token_scheme)]
"""The raw session token sent by the guest; a missing header is rejected with 401."""
