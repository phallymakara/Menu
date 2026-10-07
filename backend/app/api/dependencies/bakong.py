from app.core.config import settings
from app.integrations.bakong import BakongClient, build_bakong_client


def get_bakong_client() -> BakongClient | None:
    """
    FastAPI dependency providing the Bakong Open API client.

    Returns ``None`` when ``BAKONG_API_TOKEN`` is not configured, in which case
    KHQR payments can only be settled through an audited manual confirmation.
    """
    return build_bakong_client(settings)
