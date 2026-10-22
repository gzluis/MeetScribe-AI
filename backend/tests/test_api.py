"""Pruebas HTTP/WebSocket con Whisper simulado: no descargan modelos."""
import sys
import types
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

# Probar el protocolo independientemente de la instalación pesada de Whisper.
module = types.ModuleType('faster_whisper')
module.WhisperModel = object
sys.modules['faster_whisper'] = module
from app import app, TOKEN, CHUNK_BYTES  # noqa: E402


class FakeWhisper:
    def __init__(self, *_args, **_kwargs):
        pass

    def transcribe(self, *_args, **_kwargs):
        return iter([types.SimpleNamespace(start=0.1, end=1.5, text=' Prueba local.')]), {}


class APIProtocolTests(unittest.TestCase):
    def test_health_auth_audio_and_flush(self):
        with patch('app.WhisperModel', FakeWhisper), TestClient(app) as client:
            self.assertTrue(client.get('/health').json()['ready'])
            with client.websocket_connect('/ws', headers={'origin': 'chrome-extension://test'}) as ws:
                ws.send_json({'type': 'auth', 'token': TOKEN})
                self.assertEqual(ws.receive_json()['type'], 'ready')
                ws.send_bytes(bytes(CHUNK_BYTES))
                self.assertEqual(ws.receive_json()['type'], 'processing')
                segment = ws.receive_json()
                self.assertEqual(segment['type'], 'segment')
                self.assertEqual(segment['text'], 'Prueba local.')
                self.assertEqual(ws.receive_json()['type'], 'ready')
                ws.send_json({'type': 'stop'})
                self.assertEqual(ws.receive_json()['type'], 'finished')

    def test_reject_bad_token(self):
        with patch('app.WhisperModel', FakeWhisper), TestClient(app) as client:
            with client.websocket_connect('/ws', headers={'origin': 'chrome-extension://test'}) as ws:
                ws.send_json({'type': 'auth', 'token': 'incorrecta'})
                self.assertEqual(ws.receive_json()['type'], 'error')


if __name__ == '__main__':
    unittest.main()
