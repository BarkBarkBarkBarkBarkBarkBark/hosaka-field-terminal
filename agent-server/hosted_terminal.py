"""Access-code gateway; provider and deployment credentials never enter workers."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import hmac
import json
import logging
import os
import secrets
import time
import uuid

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from hosaka.web.tui_ws import TerminalMessage
from pydantic import ValidationError
from websockets import connect
from websockets.exceptions import ConnectionClosed

log = logging.getLogger("hosaka.hosted")
APP = os.environ.get("HOSAKA_WORKER_APP", "")
IMAGE = os.environ.get("HOSAKA_WORKER_IMAGE", "")
ACCESS = os.environ.get("HOSAKA_ACCESS_TOKEN", "")
ORIGINS = os.environ.get(
    "HOSAKA_ALLOWED_ORIGINS", "https://terminal.hosaka.xyz,https://hosaka.xyz",
).split(",")
GATEWAY = os.environ.get(
    "HOSAKA_GATEWAY_URL", "https://hosaka-field-terminal-alpha.fly.dev",
).rstrip("/")
TTL = 600
CAPACITY = 3
MODEL_LIMIT = 30
MAX_BODY = 131072
MODEL = os.environ.get("HOSAKA_HOSTED_MODEL", "gemini-2.5-flash-lite")
API_KEY = os.environ.get("GEMINI_API_KEY", "")
PROVIDER_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
sessions: dict[str, Session] = {}
allocation = asyncio.Lock()


@dataclass
class Session:
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    expires: float = field(default_factory=lambda: time.monotonic() + TTL)
    machine: str = ""
    requests: int = 0
    model_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


async def machines(method: str, path: str = "", **kwargs):
    async with httpx.AsyncClient(timeout=45, trust_env=False) as client:
        response = await client.request(
            method, f"https://api.machines.dev/v1/apps/{APP}/machines{path}",
            headers={"Authorization": f"Bearer {os.environ['HOSAKA_FLY_API_TOKEN']}"},
            **kwargs,
        )
        if method == "DELETE" and response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json() if response.content else None


async def cleanup(sid: str) -> None:
    session = sessions.get(sid)
    if session is None:
        return
    # Revoke model access even if deletion has to be retried by the janitor.
    session.expires = 0
    if session.machine:
        await machines("DELETE", f"/{session.machine}", params={"force": "true"})
    sessions.pop(sid, None)


async def janitor() -> None:
    while True:
        await asyncio.sleep(15)
        for sid, session in list(sessions.items()):
            if session.expires <= time.monotonic():
                try:
                    await cleanup(sid)
                except httpx.HTTPError:
                    log.exception("Could not delete expired worker; retrying")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not all((APP, IMAGE, ACCESS, API_KEY, os.environ.get("HOSAKA_FLY_API_TOKEN"))):
        raise RuntimeError("Hosted terminal requires worker app/image, access code, Gemini key and Fly token")
    if APP == os.environ.get("FLY_APP_NAME"):
        raise RuntimeError("Workers must use a separate app with NO app secrets")
    # Only the gateway owns these labeled workers. Recover from gateway crashes.
    for machine in await machines("GET"):
        if machine["config"].get("metadata", {}).get("hosaka_role") == "terminal-worker":
            await machines("DELETE", f"/{machine['id']}", params={"force": "true"})
    task = asyncio.create_task(janitor())
    try:
        yield
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        for sid in list(sessions):
            try:
                await cleanup(sid)
            except httpx.HTTPError:
                log.exception("Worker shutdown failed; worker has independent hard deadline")


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["POST"],
                   allow_headers=["Authorization", "Content-Type"])


@app.get("/healthz")
def health():
    return {"ok": True, "transport": "isolated-pty"}


async def read_body(request: Request) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY:
            raise HTTPException(413, "Model request too large")
    return bytes(body)


@app.post("/sessions/{sid}/v1/chat/completions")
async def model_proxy(sid: str, request: Request):
    session = sessions.get(sid)
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    if (session is None or session.expires <= time.monotonic()
            or not hmac.compare_digest(session.token.encode(), token.encode())):
        raise HTTPException(401, "Expired or invalid session")
    try:
        payload = json.loads(await read_body(request))
    except (ValueError, UnicodeError):
        raise HTTPException(400, "Invalid model JSON")
    if not isinstance(payload, dict) or not isinstance(payload.get("messages"), list):
        raise HTTPException(400, "messages must be an array")
    if session.model_lock.locked():
        raise HTTPException(429, "Only one model request at a time")
    async with session.model_lock:
        if session.requests >= MODEL_LIMIT:
            raise HTTPException(429, "Session model quota exhausted")
        session.requests += 1
        # Only OpenAI-compatible chat fields are forwarded. No arbitrary endpoints/models.
        outgoing = {key: payload[key] for key in (
            "messages", "tools", "tool_choice", "temperature",
        ) if key in payload}
        outgoing.update(model=MODEL, stream=False, max_tokens=2048)
        try:
            async with httpx.AsyncClient(timeout=45, trust_env=False) as client:
                response = await client.post(PROVIDER_URL, json=outgoing,
                    headers={"Authorization": f"Bearer {API_KEY}"})
        except httpx.HTTPError:
            log.exception("Hosted model request failed")
            raise HTTPException(502, "Hosted model unavailable")
        if not response.is_success:
            # Provider errors can contain credentials or internal configuration.
            log.warning("Hosted model returned HTTP %d", response.status_code)
            raise HTTPException(502, f"Hosted model returned HTTP {response.status_code}")
        return JSONResponse(response.json())


async def worker_connection(machine: dict, session: Session, size: TerminalMessage):
    url = (f"ws://[{machine['private_ip']}]:8080/terminal"
           f"?cols={size.cols}&rows={size.rows}")
    deadline = time.monotonic() + 40
    while True:
        try:
            return await connect(url, extra_headers={
                "Authorization": f"Bearer {session.token}",
            }, open_timeout=3, max_size=65536)
        except (OSError, asyncio.TimeoutError):
            if time.monotonic() >= deadline:
                raise TimeoutError("Worker did not start")
            await asyncio.sleep(1)


@app.websocket("/ws/hosted-tui")
async def terminal(ws: WebSocket):
    if ws.headers.get("origin") not in ORIGINS:
        await ws.close(code=1008, reason="Origin not allowed")
        return
    await ws.accept()
    sid = uuid.uuid4().hex
    backend = None
    tasks = set()
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=10)
        if len(raw) > 4096:
            await ws.close(code=1008, reason="Invalid authentication")
            return
        auth = json.loads(raw)
        if (not isinstance(auth, dict) or auth.get("type") != "auth"
                or not isinstance(auth.get("token"), str) or not ACCESS
                or not hmac.compare_digest(auth["token"].encode(), ACCESS.encode())):
            await ws.close(code=4401, reason="Invalid access code")
            return
        size = TerminalMessage.model_validate({
            "type": "resize", "cols": ws.query_params.get("cols", "80"),
            "rows": ws.query_params.get("rows", "24"),
        })
        async with allocation:
            if len(sessions) >= CAPACITY:
                await ws.close(code=4429, reason="All hosted terminals are busy")
                return
            session = Session()
            sessions[sid] = session
        # Worker app must have no secrets: Fly app secrets are injected automatically.
        machine = await machines("POST", json={
            "name": f"terminal-{sid[:12]}", "region": os.environ.get("FLY_REGION", "ams"),
            "config": {
                "image": IMAGE, "auto_destroy": True, "restart": {"policy": "no"},
                "metadata": {"hosaka_role": "terminal-worker"},
                "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": 512},
                "init": {"exec": ["/app/worker-start.sh"]},
                "env": {
                    "HOME": "/home/hosaka", "HOSAKA_SESSION_TOKEN": session.token,
                    "HOSAKA_MODEL_PROXY": f"{GATEWAY}/sessions/{sid}/v1",
                    "HOSAKA_STATE_PATH": "/home/hosaka/state.json",
                },
                "services": [],
            },
        })
        session.machine = machine["id"]
        backend = await worker_connection(machine, session, size)
        async def output():
            async for data in backend:
                if not isinstance(data, bytes):
                    raise ValueError("Worker sent non-terminal data")
                await ws.send_bytes(data)
        async def input_():
            while True:
                raw = await ws.receive_text()
                if len(raw) > 32768:
                    raise ValueError("Terminal message too large")
                TerminalMessage.model_validate_json(raw)
                await backend.send(raw)
        tasks = {asyncio.create_task(output()), asyncio.create_task(input_())}
        done, _ = await asyncio.wait(tasks, timeout=TTL, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
        await ws.close(code=1000, reason="Hosted session ended; workspace discarded")
    except WebSocketDisconnect:
        pass
    except (ValidationError, ValueError):
        await ws.close(code=1008, reason="Invalid terminal message")
    except (httpx.HTTPError, OSError, TimeoutError, ConnectionClosed):
        log.exception("Hosted terminal failed")
        await ws.close(code=1011, reason="Hosted terminal unavailable")
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if backend is not None:
            await backend.close()
        try:
            await asyncio.shield(cleanup(sid))
        except httpx.HTTPError:
            log.exception("Worker cleanup failed; janitor will retry")
