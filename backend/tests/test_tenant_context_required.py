"""
Guard for issue #6: tenant-scoped service functions must require a tenant.

A service that accepted ``tenant: TenantContext | None = None`` silently dropped
its organization filter whenever a caller forgot to pass one. Public guest paths
use separate functions scoped by table or session token instead, so no service
function needs an optional tenant.
"""

import importlib
import inspect
import pkgutil
from collections.abc import Callable, Iterator
from typing import Any

import app.services


def _service_functions() -> Iterator[tuple[str, Callable[..., Any]]]:
    """Yields every function defined in the app.services package."""
    for module_info in pkgutil.iter_modules(app.services.__path__):
        module = importlib.import_module(f"app.services.{module_info.name}")
        for name, func in inspect.getmembers(module, inspect.isfunction):
            if func.__module__ == module.__name__:
                yield f"{module.__name__}.{name}", func


def test_no_service_function_takes_an_optional_tenant():
    """Every service parameter named tenant is required and not Optional."""
    checked = 0
    offenders: list[str] = []
    for qualified_name, func in _service_functions():
        param = inspect.signature(func).parameters.get("tenant")
        if param is None:
            continue
        checked += 1
        if param.default is not inspect.Parameter.empty or "None" in str(
            param.annotation
        ):
            offenders.append(qualified_name)

    assert checked > 0
    assert offenders == []
