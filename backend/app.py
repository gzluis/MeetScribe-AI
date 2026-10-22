"""Servicio local de reconocimiento de voz para MeetScribe AI."""
from __future__ import annotations

import asyncio
import json
import os
import secrets
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel
from audio import SAMPLE_RATE, CHUNK_SECONDS, CHUNK_BYTES, pcm16_to_float32

APP_NAME = "MeetScribe AI"
MIN_FINAL_SECONDS = 1.0
CONFIG_DIR = Path.home() / ".meetscribe-ai"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = CONFIG_DIR / "token"


def get_token() -> str:
    if not TOKEN_FILE.exists():
        # One-time randomly generated token; never shipped inside the extension.
        TOKEN_FILE.write_text(secrets.token_urlsafe(32), encoding="utf-8")
        try:
            TOKEN_FILE.chmod(0o600)
        except OSError:
            pass
    return TOKEN_FILE.read_text(encoding="utf-8").strip()


TOKEN = get_token()
MODEL_NAME = os.getenv("MEETSCRIBE_MODEL", "base")
DEVICE = os.getenv("MEETSCRIBE_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("MEETSCRIBE_COMPUTE_TYPE", "int8")
model: WhisperModel | None = None
app = FastAPI(title=APP_NAME, docs_url=None, redoc_url=None)


@app.on_event("startup")
async def initialize_model() -> None:
    global model
    print("\n" + "=" * 59)
    print(f"{APP_NAME} — motor local")
    print(f"Clave de emparejamiento (copie en la extensión): {TOKEN}")
    print(f"Cargando modelo Whisper {MODEL_NAME}... (la primera vez se descarga)")
    model = await asyncio.to_thread(
        WhisperModel, MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE
    )
    print("Modelo listo. El servidor escucha SOLO en 127.0.0.1:8765")
    print("=" * 59 + "\n")


@app.get("/health")
async def health() -> dict:
    return {"app": APP_NAME, "ready": model is not None, "model": MODEL_NAME}


def transcribe(pcm: bytes, offset_seconds: float) -> list[dict]:
    if model is None:
        raise RuntimeError("El modelo de transcripción no está disponible")
    audio = pcm16_to_float32(pcm)
    chunks, _ = model.transcribe(
        audio,
        language="es",
        beam_size=3,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    return [
        {
            "type": "segment",
            "start": round(offset_seconds + item.start, 2),
            "end": round(offset_seconds + item.end, 2),
            "text": item.text.strip(),
        }
        for item in chunks
        if item.text.strip()
    ]


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    # Browsers do not enforce CORS on WebSockets. Validate Origin explicitly.
    origin = ws.headers.get("origin", "")
    if not origin.startswith(("chrome-extension://", "edge-extension://")):
        await ws.close(code=1008, reason="Origen no permitido")
        return
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        if first.get("type") != "auth" or not secrets.compare_digest(
            str(first.get("token", "")), TOKEN
        ):
            await ws.send_json({"type": "error", "message": "Clave incorrecta"})
            await ws.close(code=1008)
            return
        await ws.send_json({"type": "ready"})
        pending = bytearray()
        processed_bytes = 0
        while True:
            incoming = await ws.receive()
            if incoming["type"] == "websocket.disconnect":
                break
            pcm = incoming.get("bytes")
            if pcm:
                if len(pcm) % 2:
                    await ws.send_json({"type": "error", "message": "Audio PCM inválido"})
                    continue
                pending.extend(pcm)
                while len(pending) >= CHUNK_BYTES:
                    chunk = bytes(pending[:CHUNK_BYTES])
                    del pending[:CHUNK_BYTES]
                    await ws.send_json({"type": "processing"})
                    try:
                        found = await asyncio.to_thread(
                            transcribe, chunk, processed_bytes / (SAMPLE_RATE * 2)
                        )
                        for segment in found:
                            await ws.send_json(segment)
                    except Exception as exc:
                        await ws.send_json({"type": "error", "message": f"Falló el reconocimiento: {exc}"})
                    processed_bytes += CHUNK_BYTES
                    await ws.send_json({"type": "ready"})
            elif incoming.get("text"):
                try:
                    payload = json.loads(incoming["text"])
                except ValueError:
                    continue
                if payload.get("type") == "stop":
                    if len(pending) >= SAMPLE_RATE * MIN_FINAL_SECONDS * 2:
                        await ws.send_json({"type": "processing"})
                        try:
                            found = await asyncio.to_thread(
                                transcribe, bytes(pending), processed_bytes / (SAMPLE_RATE * 2)
                            )
                            for segment in found:
                                await ws.send_json(segment)
                        except Exception as exc:
                            await ws.send_json({"type": "error", "message": str(exc)})
                    await ws.send_json({"type": "finished"})
                    await ws.close()
                    return
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
