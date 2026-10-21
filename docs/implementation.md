# Arquitectura y revisión

El bot combina siete comandos públicos con XP de participación persistido en SQLite. La conexión a Discord, las reglas y la persistencia están separadas para probar el comportamiento sin un token. La demo reutiliza el handler con una base independiente en memoria.

## Recorrido de revisión

| Unidad | Punto de entrada | Qué comprobar |
| --- | --- | --- |
| Bot y persistencia | `src/discord/messages.ts`, `src/features/levels/store.ts` | Sólo mensajes nuevos elegibles suman XP; comandos, sistema, bots, webhooks y privados se excluyen. El cooldown es atómico y sobrevive a reinicios. |
| Comandos | `src/commands/registry.ts`, `src/content/reactions.ts` | Catálogo público de siete comandos, alias naturales y menciones limitadas al autor. `ranking` sólo consulta XP. |
| Operación | `src/discord/client.ts`, `src/database/`, `deploy/` | Cierre tras finalizar respuestas, migraciones transaccionales y backups sin sobrescribir archivos existentes. |
| Demo | `src/preview/`, `preview/` | Miembros ficticios, SQLite en memoria, sin token, loopback y validación de origen para mutaciones. |

El XP usa 15–25 puntos por mensaje elegible, cooldown de 60 segundos por usuario y servidor y nivel `floor(sqrt(XP / 100))`. El bot observa eventos nuevos; no recupera el historial de Discord ni datos de ProBot. No hay moderación ni asignación de roles.

Las migraciones v1–v3 conservan las tablas de los prototipos anteriores para no invalidar una SQLite existente. Lotería y reputación no tienen comandos ni servicios activos; sus datos no se convierten en XP. El build limpia `dist` para no distribuir módulos retirados.

## Hallazgos corregidos antes de publicar

Revisión independiente con Astra Ultra sobre reglas/persistencia y operación:

| Hallazgo reproducido | Corrección y regresión |
| --- | --- |
| `better-sqlite3` usa Node-API 10; Node 22.13 podía terminar con SIGSEGV. | Engines exige Node 22.14+ de la rama 22 o 24+; `.npmrc` rechaza versiones incompatibles. CI verifica las ramas 22 y 24. |
| Un título de hilo podía activar un comando o sumar XP como si fuera un mensaje común. | Se conserva y filtra `Message.system`. El smoke usa objetos reales de Discord de tipo `ThreadCreated`, mensaje normal y respuesta. |
| Destruir el cliente antes de finalizar un handler borraba la autenticación de su aviso de error. | El cierre bloquea eventos nuevos, espera pendientes y recién destruye el cliente. El smoke reproduce una respuesta fallida durante el cierre y valida la autenticación del aviso. |
| SQLite recortaba espacios al final del destino y podía sobrescribir un backup existente. | Se rechazan rutas ambiguas antes de abrir archivos. La regresión compara los bytes originales y comprueba que no quedan archivos vacíos. |

## Verificación

`npm run check` ejecuta tipado estricto, 25 pruebas, compilación y smoke. Las pruebas cubren comandos públicos, menciones, separación por servidor, cooldown después de reiniciar, dos procesos compitiendo por XP, migraciones, backups y demo.

La verificación completa pasó en macOS con Node 22.17 y en un contenedor Debian 12 ARM64 con Node 22.22.2. En Debian se instaló desde cero con `npm ci`, Python, Make y g++; también pasó el smoke tras `npm prune --omit=dev`. Los archivos de ejecución y pruebas se compararon por SHA-256 con el código revisado.

`scripts/discord-smoke.mjs` usa `Message` y `TextChannel` reales del SDK con transporte HTTP sustituido. Ejecuta la preparación/autenticación real de REST sin enviar peticiones. `scripts/smoke.mjs` también restaura un backup y comprueba XP y cooldown. Funciona con las dependencias de producción después de `npm prune --omit=dev`.

`npm audit` completo y de producción no reportó vulnerabilidades durante esta revisión. La comprobación HTTP de la demo verificó recursos y solicitudes válidas, rechazo de POST con origen externo y rechazo de rutas fuera de los archivos públicos.

No se desplegó en un LXC real ni se conectó el bot al gateway. Los permisos y notificaciones reales se comprueban con el recorrido de `docs/self-hosting.md`. Los GIFs dependen de URLs externas; su disponibilidad puede cambiar.

## Unidades y reversión

1. **Bot, SQLite y operación:** `src/` excepto `src/preview/`, pruebas de comandos/eventos/persistencia/configuración, scripts de build/smoke, configuración Node/TS/CI, `deploy/`, README y guía LXC. Elimina el `index.js` monolítico y entrega el proceso completo. Verificar con `npm run check`; sin el test de demo son 24 pruebas. Para revertirlo, restaurar los archivos originales de `e6d88bf` y retirar los agregados de esta unidad. Conservar `.env`, SQLite, sidecars y backups: Git no revierte datos.
2. **Demo local:** `src/preview/`, `preview/`, `tests/preview.test.ts`, script `preview` y documentación de la sala. Verificar con `npm run check` y el recorrido HTTP/visual de `docs/public-commands.md`. Puede retirarse sin cambiar los datos del bot ni el esquema.

Un binario que no reconoce la versión del esquema requiere un backup compatible. No hay migraciones descendentes automáticas.
