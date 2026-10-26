"""Descarga la conversión de Whisper para incluirla en el instalador offline."""
from pathlib import Path
from huggingface_hub import snapshot_download

base = Path(__file__).resolve().parent / "models" / "base"
base.mkdir(parents=True, exist_ok=True)
snapshot_download(
    repo_id="Systran/faster-whisper-base",
    local_dir=str(base),
    allow_patterns=["model.bin", "config.json", "tokenizer.json", "preprocessor_config.json", "vocabulary.*"],
)
assert (base / "model.bin").is_file(), "Falta el modelo de Whisper"
print(f"Modelo listo en {base}")
