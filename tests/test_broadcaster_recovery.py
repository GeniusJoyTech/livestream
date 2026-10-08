"""Exercise the real recovery methods without desktop capture/aiortc dependencies."""
import ast
import asyncio
import json
import unittest
from pathlib import Path
from types import SimpleNamespace


class FakePC:
    def __init__(self, **kwargs):
        self.handlers = {}
        self.connectionState = "new"
        self.closed = False

    def on(self, event):
        def register(handler):
            self.handlers[event] = handler
            return handler
        return register

    def addTrack(self, track):
        pass

    async def createOffer(self):
        return SimpleNamespace(type="offer", sdp="test")

    async def setLocalDescription(self, offer):
        self.localDescription = offer

    async def close(self):
        self.closed = True
        self.connectionState = "closed"
        await self.handlers["connectionstatechange"]()


class FakeSocket:
    async def send(self, message):
        pass


class BroadcasterRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        source = Path("public/broadcaster/Broadcaster.py").read_text()
        tree = ast.parse(source)
        original = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "Broadcaster")
        methods = [node for node in original.body if isinstance(node, ast.AsyncFunctionDef)
                   and node.name in ("_handle_new_viewer", "_handle_viewer_disconnected")]
        isolated = ast.ClassDef(name="Subject", bases=[], keywords=[], body=methods, decorator_list=[])
        module = ast.fix_missing_locations(ast.Module(body=[isolated], type_ignores=[]))
        self.gate = asyncio.Event()
        self.delays = []

        async def sleep(seconds):
            self.delays.append(seconds)
            await self.gate.wait()

        namespace = {
            "asyncio": SimpleNamespace(create_task=asyncio.create_task, sleep=sleep),
            "json": json, "ScreenCaptureTrack": lambda **kw: object(),
            "RTCIceServer": lambda **kw: object(), "RTCConfiguration": lambda **kw: object(),
            "RTCPeerConnection": FakePC
        }
        exec(compile(module, "Broadcaster recovery methods", "exec"), namespace)
        self.broadcaster = namespace["Subject"]()
        self.broadcaster.peers = {}

    async def start_peer(self):
        await self.broadcaster._handle_new_viewer(FakeSocket(), {"viewerId": "viewer", "monitor_number": 1})
        return self.broadcaster.peers["viewer"]

    async def test_brief_interruption_does_not_close_video(self):
        pc = await self.start_peer()
        pc.connectionState = "disconnected"
        await pc.handlers["connectionstatechange"]()
        await asyncio.sleep(0)
        self.assertEqual(self.delays, [15])
        self.assertFalse(pc.closed)
        pc.connectionState = "connected"
        await pc.handlers["connectionstatechange"]()
        self.gate.set()
        await asyncio.sleep(0)
        self.assertIs(self.broadcaster.peers["viewer"], pc)
        self.assertFalse(pc.closed)

    async def test_sustained_interruption_releases_dead_session(self):
        pc = await self.start_peer()
        pc.connectionState = "disconnected"
        await pc.handlers["connectionstatechange"]()
        await asyncio.sleep(0)
        self.gate.set()
        await asyncio.sleep(0)
        self.assertTrue(pc.closed)
        self.assertNotIn("viewer", self.broadcaster.peers)

    async def test_old_connection_callback_does_not_close_replacement(self):
        old = await self.start_peer()
        replacement = await self.start_peer()
        self.assertTrue(old.closed)
        old.connectionState = "failed"
        await old.handlers["connectionstatechange"]()
        self.assertIs(self.broadcaster.peers["viewer"], replacement)
        self.assertFalse(replacement.closed)


if __name__ == "__main__":
    unittest.main()
