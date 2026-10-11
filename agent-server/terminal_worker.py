"""Private PTY worker. One disposable Machine, one authenticated terminal."""
import hmac
import json
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket
from hosaka.web.tui_ws import TerminalMessage, bridge
from pydantic import ValidationError

app = FastAPI()


def configure() -> None:
    home = Path.home()
    workspace = home / "workspace"
    workspace.mkdir(mode=0o700, exist_ok=True)
    config = home / ".picoclaw"
    config.mkdir(mode=0o700, exist_ok=True)
    (config / "config.json").write_text(json.dumps({
        "version": 3,
        "agents": {"defaults": {
            "workspace": str(workspace), "restrict_to_workspace": True,
            "allow_read_outside_workspace": False, "model_name": "hosted",
        }},
        "model_list": [{
            "model_name": "hosted", "model": "openai/hosted",
            "api_base": os.environ["HOSAKA_MODEL_PROXY"],
        }],
        "tools": {"exec": {"enabled": True, "timeout_seconds": 15}},
    }))
    security = config / ".security.yml"
    security.write_text("model_list:\n  hosted:0:\n    api_keys:\n      - "
                        + json.dumps(os.environ["HOSAKA_SESSION_TOKEN"]) + "\n")
    security.chmod(0o600)
    os.environ.update(
        PICOCLAW_MODEL="hosted", HOSAKA_WORKSPACE=str(workspace),
        HOSAKA_PROJECT_DIR=str(workspace),
    )


@app.websocket("/terminal")
async def terminal(ws: WebSocket) -> None:
    token = os.environ.get("HOSAKA_SESSION_TOKEN", "")
    candidate = ws.headers.get("authorization", "").removeprefix("Bearer ")
    if not token or not hmac.compare_digest(token.encode(), candidate.encode()):
        await ws.close(code=4401)
        return
    try:
        size = TerminalMessage.model_validate({
            "type": "resize", "cols": ws.query_params.get("cols", "80"),
            "rows": ws.query_params.get("rows", "24"),
        })
    except ValidationError:
        await ws.close(code=1008, reason="Invalid terminal size")
        return
    await ws.accept()
    launch = (
        "import fcntl,os,sys,termios;"
        "fcntl.ioctl(0,termios.TIOCSCTTY,0);"
        "os.chdir(os.environ['HOSAKA_WORKSPACE']);"
        "os.execv(sys.executable,[sys.executable,'-m','hosaka','tui'])"
    )
    await bridge(ws, [os.sys.executable, "-c", launch], size.cols, size.rows)


if __name__ == "__main__":
    import uvicorn
    configure()
    uvicorn.run(app, host="::", port=8080, ws_max_size=32768)
