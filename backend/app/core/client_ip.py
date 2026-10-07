"""
Client IP resolution for rate limiting.

Clients can send any X-Forwarded-For header they like, so it is ignored unless the
request comes from a reverse proxy listed in TRUSTED_PROXIES. By default the socket
peer address is used.

Behind a proxy, list it in TRUSTED_PROXIES. Otherwise every client shares the
proxy's address and therefore its rate limit buckets.
"""

import ipaddress
from collections.abc import Sequence

from starlette.requests import HTTPConnection

from app.core.config import settings

IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


def _is_trusted(address: str, trusted_proxies: Sequence[IPNetwork]) -> bool:
    """Return True when ``address`` is a valid IP inside one of the trusted networks."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return any(ip in network for network in trusted_proxies)


def resolve_client_ip(
    peer: str | None,
    forwarded_for: str | None,
    trusted_proxies: Sequence[IPNetwork],
) -> str:
    """
    Return the address a request should be attributed to.

    The socket ``peer`` is used unless it is a trusted proxy. Only then is
    ``forwarded_for`` read, from right to left, skipping trusted proxies. The first
    other address is the client as seen by the outermost trusted proxy. Entries to
    its left were written by the client and are never used.
    """
    if not peer:
        return "unknown"
    if not forwarded_for or not _is_trusted(peer, trusted_proxies):
        return peer

    hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
    for hop in reversed(hops):
        if _is_trusted(hop, trusted_proxies):
            continue
        try:
            return str(ipaddress.ip_address(hop))
        except ValueError:
            # A trusted proxy wrote something that is not an address.
            return peer

    # Every hop is a trusted proxy: the request started inside the trusted network.
    return hops[0] if hops else peer


def client_ip_from_request(connection: HTTPConnection) -> str:
    """Return the client IP of a request, honoring TRUSTED_PROXIES only."""
    forwarded_for = ", ".join(connection.headers.getlist("x-forwarded-for"))
    return resolve_client_ip(
        connection.client.host if connection.client else None,
        forwarded_for or None,
        settings.trusted_proxy_networks,
    )
