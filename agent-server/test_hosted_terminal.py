import asyncio
import json
import time
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
import hosted_terminal as gateway


class HostedTerminalTests(unittest.TestCase):
    def setUp(self):
        gateway.sessions.clear()
        self.client = TestClient(gateway.app)

    def test_health_identifies_real_transport(self):
        self.assertEqual(self.client.get("/healthz").json()["transport"], "isolated-pty")

    def test_model_auth_and_expiration(self):
        session = gateway.Session()
        gateway.sessions["test"] = session
        url = "/sessions/test/v1/chat/completions"
        self.assertEqual(self.client.post(url, json={"messages": []}).status_code, 401)
        session.expires = time.monotonic() - 1
        self.assertEqual(self.client.post(url, headers={
            "Authorization": f"Bearer {session.token}",
        }, json={"messages": []}).status_code, 401)

    def test_proxy_quota_and_input_size(self):
        session = gateway.Session(requests=gateway.MODEL_LIMIT)
        gateway.sessions["test"] = session
        headers = {"Authorization": f"Bearer {session.token}"}
        url = "/sessions/test/v1/chat/completions"
        self.assertEqual(self.client.post(url, headers=headers,
            json={"messages": []}).status_code, 429)
        self.assertEqual(self.client.post(url, headers=headers,
            content=b"x" * (gateway.MAX_BODY + 1)).status_code, 413)
        self.assertEqual(self.client.post(url, headers=headers,
            json=[]).status_code, 400)

    def test_proxy_forces_model_and_never_returns_provider_error(self):
        session = gateway.Session()
        gateway.sessions["test"] = session
        response = gateway.httpx.Response(200, json={"choices": []})
        post = AsyncMock(return_value=response)
        # Keep TestClient transport intact; replace only AsyncClient's provider post.
        with patch.object(gateway.httpx.AsyncClient, "post", post):
            result = self.client.post("/sessions/test/v1/chat/completions",
                headers={"Authorization": f"Bearer {session.token}"},
                json={"model": "expensive", "stream": True, "max_tokens": 100000,
                      "messages": [], "api_key": "not-forwarded"})
        self.assertEqual(result.status_code, 200)
        outgoing = post.call_args.kwargs["json"]
        self.assertEqual(outgoing["model"], gateway.MODEL)
        self.assertEqual(outgoing["max_tokens"], 2048)
        self.assertFalse(outgoing["stream"])
        self.assertNotIn("api_key", outgoing)
        with patch.object(gateway.httpx.AsyncClient, "post",
                          AsyncMock(return_value=gateway.httpx.Response(
                              403, json={"error": "secret-provider-detail"}))):
            result = self.client.post("/sessions/test/v1/chat/completions",
                headers={"Authorization": f"Bearer {session.token}"}, json={"messages": []})
        self.assertEqual(result.status_code, 502)
        self.assertNotIn("secret-provider-detail", result.text)

    def test_websocket_origin_and_auth_fail_closed(self):
        from starlette.websockets import WebSocketDisconnect
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws/hosted-tui"):
                pass
        with patch.object(gateway, "ACCESS", "test-code"):
            with self.client.websocket_connect("/ws/hosted-tui",
                    headers={"origin": gateway.ORIGINS[0]}) as ws:
                ws.send_json({"type": "auth", "token": "wrong"})
                with self.assertRaises(WebSocketDisconnect) as result:
                    ws.receive_bytes()
                self.assertEqual(result.exception.code, 4401)
        self.assertFalse(gateway.sessions)

    def test_cleanup_revokes_access_before_delete_and_retries(self):
        session = gateway.Session(machine="machine-id")
        gateway.sessions["test"] = session
        delete = AsyncMock(side_effect=gateway.httpx.ConnectError("offline"))
        with patch.object(gateway, "machines", delete):
            with self.assertRaises(gateway.httpx.ConnectError):
                asyncio.run(gateway.cleanup("test"))
        self.assertEqual(session.expires, 0)
        self.assertIn("test", gateway.sessions)
        with patch.object(gateway, "machines", AsyncMock()) as delete:
            asyncio.run(gateway.cleanup("test"))
        self.assertNotIn("test", gateway.sessions)
        self.assertEqual(delete.call_args.args, ("DELETE", "/machine-id"))

    def test_capacity_does_not_allocate_machine(self):
        from starlette.websockets import WebSocketDisconnect
        gateway.sessions.update({str(i): gateway.Session() for i in range(gateway.CAPACITY)})
        with patch.object(gateway, "ACCESS", "test-code"), \
                patch.object(gateway, "machines", AsyncMock()) as api:
            with self.client.websocket_connect("/ws/hosted-tui",
                    headers={"origin": gateway.ORIGINS[0]}) as ws:
                ws.send_json({"type": "auth", "token": "test-code"})
                with self.assertRaises(WebSocketDisconnect) as result:
                    ws.receive_bytes()
                self.assertEqual(result.exception.code, 4429)
        api.assert_not_called()

    def test_worker_config_excludes_gateway_credentials_and_public_services(self):
        class Backend:
            close = AsyncMock()
            send = AsyncMock()

            async def __aiter__(self):
                yield b"actual-terminal-output"

        api = AsyncMock(side_effect=[{"id": "worker-id"}, None])
        with patch.object(gateway, "ACCESS", "test-code"), \
                patch.object(gateway, "machines", api), \
                patch.object(gateway, "worker_connection", AsyncMock(return_value=Backend())):
            with self.client.websocket_connect("/ws/hosted-tui",
                    headers={"origin": gateway.ORIGINS[0]}) as ws:
                ws.send_json({"type": "auth", "token": "test-code"})
                self.assertEqual(ws.receive_bytes(), b"actual-terminal-output")
        config = api.call_args_list[0].kwargs["json"]["config"]
        self.assertEqual(config["services"], [])
        self.assertEqual(config["restart"]["policy"], "no")
        self.assertTrue(config["auto_destroy"])
        self.assertEqual(config["init"]["exec"], ["/app/worker-start.sh"])
        self.assertFalse({"GEMINI_API_KEY", "HOSAKA_ACCESS_TOKEN",
                          "HOSAKA_FLY_API_TOKEN"} & config["env"].keys())
        self.assertFalse(gateway.sessions)
        self.assertEqual(api.call_args_list[-1].args, ("DELETE", "/worker-id"))


if __name__ == "__main__":
    unittest.main()
