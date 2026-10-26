# MeetScribe AI

**Extensión para Chrome y Microsoft Edge + transcriptor local con Whisper.** Código fuente abierto, sin registro de cuenta, sin pagos por minuto ni cuotas mensuales impuestas por este proyecto.

> **Estado:** v0.3, prototipo y empaquetado Windows automatizado (pendiente de validación final). El flujo completo debe validarse en Windows y reuniones reales; no es todavía un producto comercial ni está publicado en las tiendas de extensiones.

## ¿Qué hace esta versión?

- Captura **audio de la pestaña activa** (Google Meet y otras pestañas con audio), cuando el usuario hace clic en el icono de la extensión.
- Procesa audio de esa pestaña con [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) en el mismo equipo, en español.
- Muestra segmentos con marcas de tiempo en un panel lateral y los guarda automáticamente en el navegador.
- Permite **copiar todo el texto**, **los últimos 2 minutos** o **una selección** desde el panel lateral sin detener la captura. La copia se realiza en texto limpio, listo para pegar en una IA.
- Ofrece lectura en vivo con desplazamiento automático opcional, botón «Ir al texto más reciente» y ajuste del tamaño de letra.
- Exporta transcripciones a **TXT** y subtítulos a **SRT**.
- Almacena hasta las 30 reuniones más recientes, sin subir el texto a un servicio externo.
- Usa una clave aleatoria para proteger el servicio local y escucha únicamente en `127.0.0.1`.

### Límites reales

- **Solo transcribe el audio de la pestaña**: no mezcla el micrófono propio (V2). En Meet, las voces remotas habitualmente se oyen en la pestaña; la voz local normalmente no se reproduce ahí.
- No separa hablantes ni genera resúmenes, documentos Word o PDF todavía.
- Transcribe en bloques de unos 10 segundos, **no de forma instantánea**: el retardo **depende del hardware**. En CPU lenta puede ir por detrás del audio; un buffer saturado puede ocasionar pérdida de fragmentos.
- Un corte de palabra en el límite de un bloque puede afectar la exactitud. Compruebe la transcripción antes de usarla como registro oficial.
- El instalador de Windows generado por GitHub incluye el entorno Python y el modelo Whisper base; la instalación no requiere Python ni comandos. El modo de desarrollo sigue ofreciendo start_windows.bat.
- No captura audio de una reunión pasada que no haya sido grabada.

## MeetScribe AI Local para Windows (instalador)

La aplicación de Windows empaqueta Python, el servicio local, `faster-whisper` y el modelo `base`. **El usuario no instala Python, no descarga el modelo ni ejecuta comandos.** La extensión sigue siendo necesaria para capturar audio de Google Meet dentro del navegador.

Para obtener el instalador compilado (tras una compilación satisfactoria en GitHub):

1. Abre [GitHub Actions → Generar instalador Windows](https://github.com/gzluis/MeetScribe-AI/actions/workflows/windows-installer.yml).
2. Abre la ejecución completada en verde y descarga el artefacto **MeetScribe-AI-Local-Windows-x64**.
3. Extrae el ZIP del artefacto y ejecuta **MeetScribe-AI-Local-Setup-v0.3.0.exe** en Windows 10/11 de 64 bits.
4. Abre **MeetScribe AI Local** desde el menú Inicio. El motor se inicia automáticamente y muestra una clave con botón **Copiar clave**.
5. Instala también la extensión de Edge/Chrome, pega la clave y usa las funciones de copia en vivo.

El instalador no está firmado digitalmente; Windows SmartScreen puede mostrar una advertencia de editor desconocido. No desactives la protección: comprueba el origen y la integridad del archivo antes de ejecutarlo. El paquete puede ser grande porque incluye el modelo y librerías de transcripción. Si el motor no inicia, consulta `%USERPROFILE%\.meetscribe-ai\local.log` y abre un issue en GitHub. El empaquetado se compila en un runner real de Windows mediante PyInstaller e Inno Setup; **el código fuente no es por sí solo un EXE**.

## Requisitos para modo de desarrollo (sin instalador)

- **Windows 10/11** con **Python 3.11 o 3.12** (instalado y accesible mediante el comando `py`).
- **Edge o Chrome 116+**.
- Internet durante la instalación de dependencias y primera descarga del modelo, cuyo tamaño depende de `MEETSCRIBE_MODEL`.
- Al menos unos pocos GB libres para Python, las dependencias y la caché de modelos.
- Autorización o consentimiento apropiado de los participantes y cumplimiento de reglas institucionales de privacidad.

## Instalación en Windows (paso a paso)

1. Descargue y extraiga este repositorio como carpeta (no ejecute directamente desde un ZIP).
2. Instale [Python](https://www.python.org/downloads/) 3.11 o 3.12, con Python Launcher `py`.
3. Abra `backend/start_windows.bat` con doble clic. La primera vez crea `.venv`, instala las dependencias y descarga el modelo `base`. **Espere hasta leer `Modelo listo`**; este proceso inicial puede tardar.
4. En esa ventana aparecerá una **clave de emparejamiento**. Mantenga abierta la ventana mientras transcribe.
5. Abra `edge://extensions` o `chrome://extensions`. Active **Modo desarrollador** y use **Cargar extensión sin empaquetar**, seleccionando la carpeta `extension/` de este proyecto.
6. Abra una reunión de **Google Meet** en una pestaña, informe a los participantes y obtenga su consentimiento cuando corresponda.
7. Haga clic en el icono de MeetScribe AI. Se abre el panel lateral. Pegue la clave en **Clave de emparejamiento**, pulse **Guardar** y **Comprobar motor local**.
8. Con la pestaña de Meet activa, **vuelva a hacer clic en el icono**. Esto inicia la captura autorizada. Cuando vea `Capturando`, espere la transcripción por bloques.
9. **Durante la clase**, use **Copiar todo** para llevar el texto completo a ChatGPT u otra IA, **Últimos 2 min** para formular una pregunta sobre la explicación reciente, o seleccione una frase dentro del texto y haga clic en **Selección**. La captura **no se detiene al copiar**.
10. Para terminar, haga clic en **Detener transcripción**. Espere el procesamiento final y después exporte TXT o SRT si lo desea.

**Para actualizar la extensión después de descargar una versión nueva:** en `edge://extensions` o `chrome://extensions`, haga clic en el botón de recarga de MeetScribe AI y abra nuevamente el panel lateral. No cambie la clave de emparejamiento si el servidor local sigue siendo el mismo.

**Nota para el uso académico:** el panel copia únicamente texto ya reconocido. Lo que el docente está diciendo todavía no aparecerá hasta que Whisper procese el siguiente bloque (normalmente 10 segundos de audio más el tiempo de reconocimiento).

**Atención:** el sonido de la pestaña se redirige al altavoz mientras dura la captura. No cierre el navegador ni la ventana de servicio antes de detener la reunión.

## Opciones del motor

Por defecto: modelo `base`, CPU, cálculo `int8`. Se pueden establecer variables de entorno antes de ejecutar el `.bat`:

```bat
set MEETSCRIBE_MODEL=small
set MEETSCRIBE_DEVICE=cpu
set MEETSCRIBE_COMPUTE_TYPE=int8
backend\start_windows.bat
```

Los modelos más grandes suelen requerir más memoria y CPU. No se recomienda `small` en tiempo real en equipos modestos sin medir rendimiento.

## Arquitectura

```text
Meet (pestaña de Chrome / Edge)
  └─ clic explícito en el icono
      └─ extension/background.js (tabCapture + offscreen)
          └─ extension/offscreen.js (AudioWorklet PCM mono / 16 kHz)
              └─ WebSocket local, 127.0.0.1:8765, clave de emparejamiento
                  └─ backend/app.py (Whisper sobre bloques de 10 s)
                      └─ segmentos JSON -> chrome.storage.local
                          └─ panel lateral -> TXT / SRT
```

## Desarrollo y pruebas

El código de la extensión no usa paquetes npm; puede analizarse con `node --check extension/*.js` (cada archivo por separado).

```bash
python -m pip install -r backend/requirements.txt
cd backend
python -m unittest discover -s tests -v
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

Las funciones de copia se verifican con una prueba independiente:

```bash
node extension/tests/transcript-utils.test.cjs
```

## Privacidad y seguridad

Consulte [docs/SECURITY.md](docs/SECURITY.md). Las transcripciones pueden contener información sensible y están guardadas en el perfil del navegador. **No publique transcripciones, tokens o grabaciones reales en GitHub.**

## Hoja de ruta

1. Importación de WAV/MP3/MP4, pruebas de calidad en español y reducción gradual de la latencia de procesamiento.
2. Captura separada del micrófono, selección de fuente y mejora de latencia.
3. Historial avanzado, búsqueda, exportación Word/PDF y etiquetado de asignaturas.
4. Resúmenes locales, modo académico y diarización experimental.
5. Validar instalador Windows en una PC distinta, pruebas automatizadas de navegador y empaquetado para las tiendas de extensiones.

**Licencia:** MIT.
