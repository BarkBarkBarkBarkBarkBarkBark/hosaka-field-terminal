"""Hosaka agent-server — a thin, paranoid websocket bridge to picoclaw.

Design notes
------------
* One picoclaw process per message (not per session). Picoclaw itself persists
  conversation state on disk under ~/.picoclaw/sessions/<key>.
* Every websocket connection gets a UUID session id and its own working dir
  under /workspaces/<sid>/. The workspace is wiped on disconnect AND on a
  configurable TTL (default 5 minutes of idle time).
* Auth: a single shared passphrase delivered in the `X-Hosaka-Token` header
  or the `?token=` query param. Compared in constant time.
* Subprocess is run with a scrubbed environment — only PATH, HOME, and the
  PICOCLAW_* vars survive. No GEMINI_API_KEY leaking through tool calls.
* One in-flight request per connection; per-message timeout is hard-capped.

This is intentionally boring code. Boring is good when you're exposing an
LLM-driven shell to the internet.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import re
import shutil
import signal
import subprocess  # noqa: F401  (kept for future sync paths)
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── config ──────────────────────────────────────────────────────────────────
ACCESS_TOKEN = os.environ.get("HOSAKA_ACCESS_TOKEN", "").strip()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("HOSAKA_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
] or ["*"]

WORKSPACE_ROOT = Path(os.environ.get("HOSAKA_WORKSPACE_ROOT", "/workspaces"))
SESSION_TTL_SECONDS = int(os.environ.get("HOSAKA_SESSION_TTL", "300"))
MSG_TIMEOUT_SECONDS = int(os.environ.get("HOSAKA_MSG_TIMEOUT", "90"))
PING_INTERVAL_SECONDS = int(os.environ.get("HOSAKA_PING_INTERVAL", "15"))
MSG_MAX_CHARS = int(os.environ.get("HOSAKA_MSG_MAX_CHARS", "4000"))
RATE_LIMIT_PER_MIN = int(os.environ.get("HOSAKA_RATE_PER_MIN", "30"))

PICOCLAW_BIN = os.environ.get("PICOCLAW_BIN", "picoclaw")
PICOCLAW_MODEL = os.environ.get("PICOCLAW_MODEL", "").strip()

# Picoclaw response prefix — the original Hosaka adapter looks for this to
# pull the agent's actual reply out of the decorated banner output.
_RESPONSE_PREFIX = "🦞"
_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]")
_BANNER_HINTS = (
    "picoclaw",
    "interactive mode",
    "goodbye",
    "ctrl+c",
    "config migrate",
    "saving config",
    "checking for updates",
    "no updates available",
)
# Box-drawing / banner characters. If a line is overwhelmingly made of these,
# treat it as chrome.
_BOX_CHARS = set("█▓▒░╔╗╚╝═║╠╣╦╩╬╬┌┐└┘─│├┤┬┴┼")


def _strip_ansi(s: str) -> str:
    return _ANSI_RE.sub("", s)


def _is_chrome_line(clean: str) -> bool:
    cl = clean.lower().strip()
    if not cl:
        return True
    if any(h in cl for h in _BANNER_HINTS):
        return True
    # picoclaw log lines look like:  HH:MM:SS INF source/path > message
    if re.match(r"^\d{2}:\d{2}:\d{2}\s+(INF|WRN|ERR|DBG)\s", clean):
        return True
    # Lines that are mostly box-drawing chars or whitespace.
    visible = [c for c in clean if not c.isspace()]
    if visible and sum(c in _BOX_CHARS for c in visible) / len(visible) >= 0.7:
        return True
    return False


def _extract_response(stdout: str, stderr: str) -> str:
    """Pull picoclaw's agent reply out of its decorated output.

    Strategy (mirrors hosaka/llm/picoclaw_adapter.py):
      1. Look for the first line starting with the lobster prefix, then
         collect every following non-banner line.
      2. If no lobster line exists, fall back to all non-banner non-log lines.
      3. If still empty, return the stderr (so users see *something*).
    """
    raw = stdout if stdout else stderr
    lines = raw.splitlines()
    cleaned = [_strip_ansi(ln).rstrip() for ln in lines]

    for idx, line in enumerate(cleaned):
        if line.lstrip().startswith(_RESPONSE_PREFIX):
            collected = [line.lstrip()[len(_RESPONSE_PREFIX):].strip()]
            for cont in cleaned[idx + 1:]:
                c = cont.strip()
                if not c or _is_chrome_line(c):
                    continue
                collected.append(c)
            return "\n".join(collected).strip()

    # No lobster — keep only "real" content lines.
    body = [ln for ln in cleaned if not _is_chrome_line(ln.strip())]
    text = "\n".join(line for line in body if line.strip()).strip()
    if text:
        return text
    return stderr.strip() or "[picoclaw produced no output]"

# Environment variables the picoclaw subprocess is allowed to see. Everything
# else — including the Gemini/OpenAI key when we inject it via a config file —
# is deliberately kept out of `os.environ` for this process.
_SUBPROC_ENV_ALLOWLIST = {"PATH", "HOME", "LANG", "LC_ALL", "TERM"}


logging.basicConfig(
    level=os.environ.get("HOSAKA_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("hosaka.agent")


# ── session bookkeeping ─────────────────────────────────────────────────────
class Session:
    __slots__ = ("sid", "workspace", "ip", "lock", "last_active", "msg_times")

    def __init__(self, sid: str, workspace: Path, ip: str) -> None:
        self.sid = sid
        self.workspace = workspace
        self.ip = ip
        self.lock = asyncio.Lock()
        self.last_active = time.monotonic()
        self.msg_times: list[float] = []

    def touch(self) -> None:
        self.last_active = time.monotonic()


_sessions: dict[str, Session] = {}


# ── helpers ─────────────────────────────────────────────────────────────────
def _auth_ok(provided: str) -> bool:
    if not ACCESS_TOKEN:
        # No token configured server-side => nobody gets in. Fail closed.
        return False
    return hmac.compare_digest(provided.encode(), ACCESS_TOKEN.encode())


def _subproc_env() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k in _SUBPROC_ENV_ALLOWLIST}
    env.setdefault("HOME", "/home/hosaka")
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    return env


def _rate_limited(session: Session) -> bool:
    now = time.monotonic()
    # Drop entries older than 60s
    session.msg_times = [t for t in session.msg_times if now - t < 60]
    if len(session.msg_times) >= RATE_LIMIT_PER_MIN:
        return True
    session.msg_times.append(now)
    return False


def _is_picoclaw_available() -> bool:
    return shutil.which(PICOCLAW_BIN) is not None


async def _run_picoclaw(
    message: str, session: Session
) -> tuple[str, str]:
    """Invoke picoclaw once, return (stdout, stderr). Bounded + sandboxed."""
    cmd = [
        PICOCLAW_BIN,
        "agent",
        "-m",
        message,
        "--session",
        f"hosaka:{session.sid}",
    ]
    # Intentionally NOT passing --model. picoclaw's --model lookup is fussy
    # (rejects both model_name and litellm-style model strings in some
    # combinations). The config's agents.defaults.model_name already pins
    # which model picoclaw uses; to swap, change PICOCLAW_MODEL on Fly and
    # start.sh rewrites the config.

    log.info("sid=%s running picoclaw", session.sid)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(session.workspace),
        env=_subproc_env(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        preexec_fn=os.setsid if os.name == "posix" else None,
    )
    try:
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(), timeout=MSG_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        log.warning("sid=%s picoclaw timed out after %ss", session.sid, MSG_TIMEOUT_SECONDS)
        with contextlib_suppress():
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        return "", f"[timed out after {MSG_TIMEOUT_SECONDS}s]"

    return stdout_b.decode("utf-8", errors="replace"), stderr_b.decode(
        "utf-8", errors="replace"
    )


class contextlib_suppress:
    """Tiny inline version so we don't need to import contextlib."""
    def __enter__(self) -> None:
        return None

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return True


# ── lifespan & janitor ──────────────────────────────────────────────────────
@asynccontextmanager
async def _lifespan(app: FastAPI):
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    janitor = asyncio.create_task(_janitor_loop())
    if not ACCESS_TOKEN:
        log.error(
            "HOSAKA_ACCESS_TOKEN is empty. Server will refuse all connections. "
            "Set the env var in Fly.io → fly secrets set HOSAKA_ACCESS_TOKEN=...",
        )
    if not _is_picoclaw_available():
        log.warning(
            "picoclaw binary not found on PATH (looked for %r). "
            "Agent calls will fail until it is installed.",
            PICOCLAW_BIN,
        )
    try:
        yield
    finally:
        janitor.cancel()
        for sid in list(_sessions.keys()):
            _cleanup_session(sid)


async def _janitor_loop() -> None:
    while True:
        try:
            await asyncio.sleep(30)
            now = time.monotonic()
            for sid, sess in list(_sessions.items()):
                if now - sess.last_active > SESSION_TTL_SECONDS:
                    log.info("sid=%s idle, reaping", sid)
                    _cleanup_session(sid)
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - best-effort
            log.exception("janitor loop hiccup")


def _cleanup_session(sid: str) -> None:
    sess = _sessions.pop(sid, None)
    if not sess:
        return
    try:
        if sess.workspace.exists():
            shutil.rmtree(sess.workspace, ignore_errors=True)
    except Exception:
        log.exception("failed to clean workspace for sid=%s", sid)


# ── app ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="hosaka-agent-server", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "hosaka-agent-server",
        "picoclaw_available": _is_picoclaw_available(),
        "picoclaw_model": PICOCLAW_MODEL or None,
        "active_sessions": len(_sessions),
    }


@app.get("/healthz")
def healthz() -> JSONResponse:
    return JSONResponse({"ok": True})


def _extract_token(ws: WebSocket) -> str:
    hdr = ws.headers.get("x-hosaka-token") or ws.headers.get("X-Hosaka-Token")
    if hdr:
        return hdr.strip()
    q = ws.query_params.get("token")
    return (q or "").strip()


@app.websocket("/ws/agent")
async def ws_agent(ws: WebSocket) -> None:
    token = _extract_token(ws)
    if not _auth_ok(token):
        await ws.close(code=4401, reason="unauthorized")
        return

    await ws.accept()
    ip = (ws.client.host if ws.client else "unknown")
    sid = uuid.uuid4().hex[:12]
    workspace = WORKSPACE_ROOT / sid
    workspace.mkdir(parents=True, exist_ok=True)
    session = Session(sid, workspace, ip)
    _sessions[sid] = session

    log.info("sid=%s ip=%s ws open", sid, ip)
    await ws.send_json({
        "type": "hello",
        "sid": sid,
        "picoclaw": _is_picoclaw_available(),
        "model": PICOCLAW_MODEL or None,
        "ttl_seconds": SESSION_TTL_SECONDS,
    })

    # Always-on keepalive: Fly's edge proxy closes silent websockets after
    # ~60s of inactivity, which ruined the UX between user messages. We
    # send a tiny `{"type":"ping"}` frame every PING_INTERVAL_SECONDS so
    # the channel stays warm whether picoclaw is running or not. The
    # client treats `ping` as a no-op.
    async def _idle_ping_loop() -> None:
        while True:
            try:
                await asyncio.sleep(PING_INTERVAL_SECONDS)
                await ws.send_json({"type": "ping"})
            except Exception:
                return

    idle_pinger = asyncio.create_task(_idle_ping_loop())

    try:
        while True:
            raw = await ws.receive_text()
            session.touch()

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "error": "invalid json"})
                continue

            msg = (payload.get("message") or "").strip()
            if not msg:
                await ws.send_json({"type": "error", "error": "empty message"})
                continue
            if len(msg) > MSG_MAX_CHARS:
                await ws.send_json({
                    "type": "error",
                    "error": f"message too long (max {MSG_MAX_CHARS})",
                })
                continue

            if _rate_limited(session):
                await ws.send_json({
                    "type": "error",
                    "error": "rate limited — breathe. try again in a minute.",
                })
                continue

            if session.lock.locked():
                await ws.send_json({
                    "type": "error",
                    "error": "still thinking about the last one. patience.",
                })
                continue

            async with session.lock:
                await ws.send_json({"type": "thinking"})
                if not _is_picoclaw_available():
                    await ws.send_json({
                        "type": "error",
                        "error": "picoclaw binary is not installed on the server.",
                    })
                    continue

                # The idle pinger above already keeps the socket warm; no
                # additional per-message pinger is needed.
                stdout, stderr = await _run_picoclaw(msg, session)

                if stderr.strip():
                    log.info("sid=%s stderr=%s", sid, stderr.strip()[:400])
                cleaned = _extract_response(stdout, stderr)
                await ws.send_json({
                    "type": "reply",
                    "text": cleaned,
                    "stdout": stdout,
                    "stderr": stderr,
                })

    except WebSocketDisconnect:
        log.info("sid=%s ws closed", sid)
    except Exception:
        log.exception("sid=%s ws crashed", sid)
        try:
            await ws.close(code=1011, reason="server error")
        except Exception:
            pass
    finally:
        idle_pinger.cancel()
        _cleanup_session(sid)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8080")),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
