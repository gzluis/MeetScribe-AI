# Privacidad, consentimiento y seguridad

- La captura se inicia solo mediante clic en el icono de la extensión y puede detenerse desde el panel.
- El servicio HTTP/WebSocket se enlaza exclusivamente a `127.0.0.1:8765` y autentica el WebSocket con un secreto generado localmente en `~/.meetscribe-ai/token`.
- El WebSocket requiere además un origen de extensión de Chromium. La clave no aparece en el código fuente ni se envía a internet.
- El audio capturado **no se persiste en disco** en esta versión; los segmentos de texto se conservan en `chrome.storage.local` en el perfil del navegador. La clave también se almacena ahí.
- La primera ejecución descarga el modelo desde el repositorio configurado por faster-whisper. Si no se ha descargado previamente, se necesita conexión.
- La extensión tiene permiso para capturar pestañas, pero no inicia captura automáticamente ni accede a todas las pestañas indiscriminadamente.
- La transcripción **no sustituye el consentimiento** del organizador y de los participantes ni anula las políticas académicas o legales sobre grabación, registro y conservación.
- Cualquier programa local que obtenga el token puede usar el servicio de transcripción; proteja su sesión de Windows. La aplicación es un prototipo, no una solución de alta seguridad para datos confidenciales.
- El puerto 8765 no está abierto a la red; cambie el token borrando el archivo solo cuando el servicio esté cerrado, e inícielo de nuevo, actualizando la clave en la extensión.

## Riesgos y mitigaciones pendientes

- Seguridad de la aplicación local y permisos de los archivos en Windows.
- Pruebas de funcionamiento de versiones recientes de Edge/Chrome.
- Pruebas de sobrecarga: cuando el motor transcribe más lento que el audio, pueden perderse fragmentos.
- Políticas de retención personalizables y borrado de reuniones desde el panel.
- Control de autorización de sitios de reunión específicos antes de captar otras pestañas.
