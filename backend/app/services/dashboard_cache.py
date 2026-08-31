from __future__ import annotations

from threading import Lock
from time import monotonic
from typing import Callable, Hashable, TypeVar

T = TypeVar("T")

_cache: dict[Hashable, tuple[float, object]] = {}
_key_locks: dict[Hashable, Lock] = {}
_registry_lock = Lock()


def get_dashboard_cached(key: Hashable, ttl_seconds: float, factory: Callable[[], T]) -> T:
    """Return a short-lived cached dashboard payload and prevent duplicate refreshes."""
    now = monotonic()
    with _registry_lock:
        cached = _cache.get(key)
        if cached and cached[0] > now:
            return cached[1]  # type: ignore[return-value]
        key_lock = _key_locks.setdefault(key, Lock())

    with key_lock:
        now = monotonic()
        with _registry_lock:
            cached = _cache.get(key)
            if cached and cached[0] > now:
                return cached[1]  # type: ignore[return-value]

        value = factory()

        with _registry_lock:
            _cache[key] = (monotonic() + max(0.1, float(ttl_seconds)), value)

        return value
