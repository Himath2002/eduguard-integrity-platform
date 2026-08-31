from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class RealtimeConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, key: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[key].add(websocket)

    async def disconnect(self, key: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(key)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(key, None)

    async def send_to_user(self, key: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._connections.get(key, set()))
        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                stale.append(socket)
        if stale:
            async with self._lock:
                active = self._connections.get(key)
                if active:
                    for socket in stale:
                        active.discard(socket)
                    if not active:
                        self._connections.pop(key, None)


realtime_manager = RealtimeConnectionManager()


def user_key(role: str, user_id: int) -> str:
    return f"{role}:{int(user_id)}"


def push_realtime_event(role: str, user_id: int, payload: dict[str, Any]) -> None:
    key = user_key(role, int(user_id))
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(realtime_manager.send_to_user(key, payload))
        return

    loop.create_task(realtime_manager.send_to_user(key, payload))
