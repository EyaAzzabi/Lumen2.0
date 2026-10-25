"""Cooperative CPU budget checked between chunks/classes; no orphan timeout jobs."""

from contextvars import ContextVar
from contextlib import contextmanager
import threading, time
from fastapi import HTTPException

_deadline = ContextVar("plume_deadline", default=None)
_slots = threading.BoundedSemaphore(2)


def check():
    deadline = _deadline.get()
    if deadline is not None and time.monotonic() > deadline:
        raise HTTPException(
            503, "Computation budget exceeded; reduce registry/search complexity"
        )


@contextmanager
def computation(seconds=20):
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, "Computation capacity occupied; retry later")
    token = _deadline.set(time.monotonic() + seconds)
    try:
        yield
    finally:
        _deadline.reset(token)
        _slots.release()
