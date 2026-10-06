"""Static file serving for user uploads."""

from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class UploadStaticFiles(StaticFiles):
    """Serves uploaded files with headers that stop them running as active content.

    Uploads are re-encoded images, but they are served from the application's own
    origin, so these headers are defense in depth: browsers must not sniff a
    different content type, and a file opened directly is sandboxed with no
    script, style, or network access.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return response
