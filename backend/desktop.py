"""MeetScribe AI Local: ventana Windows para el motor Whisper empacado."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import socket
import sys
import threading
import tkinter as tk
from tkinter import messagebox, ttk
import webbrowser

# app exporta el TOKEN existente y el modelo elegido por runtime.py
from app import TOKEN, MODEL_NAME, app
import uvicorn

HOST = "127.0.0.1"
PORT = 8765


def configure_log() -> None:
    logdir = Path.home() / ".meetscribe-ai"
    logdir.mkdir(parents=True, exist_ok=True)
    logfile = logdir / "local.log"
    if getattr(sys, "frozen", False):
        # En una aplicación --windowed PyInstaller stdout/stderr pueden ser None.
        stream = open(logfile, "a", encoding="utf-8", buffering=1)
        if sys.stdout is None:
            sys.stdout = stream
        if sys.stderr is None:
            sys.stderr = stream
    logging.basicConfig(filename=logfile, level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.settimeout(0.3)
        return conn.connect_ex((HOST, PORT)) == 0


def self_test(result_path: str) -> int:
    """Verifica el paquete congelado, incluyendo inicialización offline del modelo."""
    result = {"status": "error", "model": MODEL_NAME}
    try:
        from faster_whisper import WhisperModel
        WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
        result["status"] = "ok"
    except Exception as exc:
        result["message"] = repr(exc)
    Path(result_path).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return 0 if result["status"] == "ok" else 1


class DesktopApp:
    def __init__(self) -> None:
        self.window = tk.Tk()
        self.window.title("MeetScribe AI Local")
        self.window.geometry("585x465")
        self.window.minsize(500, 430)
        self.window.configure(bg="#f5f7fa")
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.server: uvicorn.Server | None = None
        self.thread: threading.Thread | None = None
        self.error = ""
        self.exiting = False
        self._make_ui()
        self.window.after(250, self.start)
        self.window.after(500, self.poll)

    def _make_ui(self) -> None:
        frame = tk.Frame(self.window, bg="#f5f7fa", padx=28, pady=20)
        frame.pack(fill="both", expand=True)
        tk.Label(frame, text="MEETSCRIBE AI LOCAL", font=("Segoe UI", 19, "bold"),
                 fg="#193552", bg="#f5f7fa").pack(anchor="w")
        tk.Label(frame, text="Motor de transcripción Whisper · Todo se procesa en esta computadora",
                 font=("Segoe UI", 10), bg="#f5f7fa", fg="#526272").pack(anchor="w", pady=(4, 20))
        self.status = tk.StringVar(value="Preparando el motor de transcripción...")
        tk.Label(frame, textvariable=self.status, bg="#e6edf5", fg="#193552", padx=15,
                 pady=12, anchor="w", font=("Segoe UI", 11)).pack(fill="x")
        tk.Label(frame, text="CLAVE DE EMPAREJAMIENTO", font=("Segoe UI", 9, "bold"),
                 fg="#34495e", bg="#f5f7fa").pack(anchor="w", pady=(23, 7))
        tokenrow = tk.Frame(frame, bg="#f5f7fa")
        tokenrow.pack(fill="x")
        self.token = ttk.Entry(tokenrow, show="•", font=("Consolas", 10))
        self.token.insert(0, TOKEN)
        self.token.configure(state="readonly")
        self.token.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ttk.Button(tokenrow, text="Copiar clave", command=self.copy_token).pack(side="right")
        self.reveal = tk.BooleanVar(value=False)
        ttk.Checkbutton(frame, text="Mostrar clave", variable=self.reveal, command=self.toggle_token).pack(anchor="w", pady=(5, 10))
        self.start_btn = ttk.Button(frame, text="Iniciar motor", command=self.start)
        self.start_btn.pack(side="top", anchor="w", pady=(3, 13))
        tk.Label(frame, text="CÓMO UTILIZARLO", font=("Segoe UI", 9, "bold"),
                 bg="#f5f7fa", fg="#34495e").pack(anchor="w")
        instructions = (
            "1. Mantén abierta esta ventana mientras dure la clase.\n"
            "2. Copia la clave y pégala en la extensión de Edge o Chrome.\n"
            "3. Abre Meet y activa la transcripción desde la extensión.\n"
            "4. Usa 'Últimos 2 min' o 'Copiar todo' para consultar con una IA."
        )
        tk.Label(frame, text=instructions, justify="left", font=("Segoe UI", 10),
                 bg="#f5f7fa", fg="#263d52").pack(anchor="w", pady=(7, 12))
        tk.Button(frame, text="Ver instrucciones y descargar la extensión", relief="flat",
                  bg="#f5f7fa", fg="#1365a1", cursor="hand2", anchor="w",
                  command=lambda: webbrowser.open("https://github.com/gzluis/MeetScribe-AI")).pack(anchor="w")
        tk.Label(frame, text="Privado y local · Puerto 127.0.0.1:8765 · Cierra para detener el servicio",
                 font=("Segoe UI", 8), bg="#f5f7fa", fg="#6c7a89").pack(side="bottom", anchor="w", pady=(12, 0))

    def toggle_token(self) -> None:
        self.token.configure(show="" if self.reveal.get() else "•")

    def copy_token(self) -> None:
        self.window.clipboard_clear()
        self.window.clipboard_append(TOKEN)
        self.window.update()
        messagebox.showinfo("MeetScribe AI Local", "Clave copiada. Pégala en la extensión.")

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        if port_in_use():
            self.status.set("El puerto 8765 está ocupado. Cierra el otro motor y reintenta.")
            self.start_btn.configure(state="normal")
            return
        self.error = ""
        self.start_btn.configure(state="disabled")
        self.status.set("Cargando modelo Whisper local... puede tardar unos segundos.")
        self.server = uvicorn.Server(uvicorn.Config(app, host=HOST, port=PORT,
                                                   log_level="warning", access_log=False))

        def serve() -> None:
            try:
                self.server.run()
            except Exception as exc:
                self.error = str(exc)
                logging.exception("No se pudo iniciar el servicio")

        self.thread = threading.Thread(target=serve, daemon=True, name="meetscribe-server")
        self.thread.start()

    def poll(self) -> None:
        if self.exiting:
            return
        if self.server is not None and self.server.started and self.thread and self.thread.is_alive():
            self.status.set("Listo: puedes comenzar a transcribir en Edge o Chrome.")
        elif self.thread and not self.thread.is_alive():
            self.status.set("Motor detenido. " + (self.error or "Revisa el archivo de registro local.log"))
            self.start_btn.configure(state="normal")
        self.window.after(500, self.poll)

    def close(self) -> None:
        self.exiting = True
        if self.server is not None:
            self.server.should_exit = True
        self.window.destroy()

    def run(self) -> None:
        self.window.mainloop()


if __name__ == "__main__":
    configure_log()
    if len(sys.argv) > 2 and sys.argv[1] == "--self-test":
        raise SystemExit(self_test(sys.argv[2]))
    DesktopApp().run()
