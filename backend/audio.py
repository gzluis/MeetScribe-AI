"""Utilidades PCM independientes de Whisper para facilitar las pruebas."""
import numpy as np

SAMPLE_RATE = 16_000
CHUNK_SECONDS = 10
CHUNK_BYTES = SAMPLE_RATE * CHUNK_SECONDS * 2


def pcm16_to_float32(pcm: bytes) -> np.ndarray:
    """PCM signed-16 LE mono -> float32 normalizado [-1, 1)."""
    if len(pcm) % 2:
        raise ValueError("El paquete PCM debe contener pares de bytes")
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
