@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo [MeetScribe AI] Creando entorno virtual...
  py -3.12 -V >nul 2>&1
  if not errorlevel 1 (
    py -3.12 -m venv .venv
  ) else (
    py -3.11 -m venv .venv
  )
  if errorlevel 1 (
    echo Instala Python 3.11 o 3.12 desde python.org y vuelve a intentarlo.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
)
".venv\Scripts\python.exe" -c "import faster_whisper, fastapi, uvicorn, numpy" >nul 2>&1
if errorlevel 1 (
  echo [MeetScribe AI] Instalando dependencias...
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (pause & exit /b 1)
)
echo [MeetScribe AI] Iniciando servicio local...
".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8765
pause
