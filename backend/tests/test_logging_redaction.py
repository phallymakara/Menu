"""Regression tests: logging must not expose SQL parameters or Telegram bot tokens."""

import logging

from app.core.logging import setup_logging


def test_sql_and_http_client_loggers_stay_above_info():
    """SQL statements with bind parameters and httpx request URLs are not logged at INFO."""
    setup_logging(log_level="INFO", environment="production")

    for name in ("sqlalchemy.engine", "httpx", "httpcore"):
        assert not logging.getLogger(name).isEnabledFor(logging.INFO), name
