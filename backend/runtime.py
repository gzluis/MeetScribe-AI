"""Detecta modelo local incluido en el instalador sin depender de Internet."""
from __future__ import annotations

import os
from pathlib import Path
import sys


def resolve_model_name() -> str:
    """Prioriza el modelo empacado, salvo selección explícita del usuario."""
    override = os.getenv("MEETSCRIBE_MODEL")
    if override:
        return override
    if getattr(sys, "frozen", False):
        bundled = Path(sys._MEIPASS) / "models" / "base"
        if not (bundled / "model.bin").is_file():
            raise FileNotFoundError(
                "El instalador no contiene el modelo Whisper. Reinstale MeetScribe AI Local."
            )
        return str(bundled)
    return "base"
