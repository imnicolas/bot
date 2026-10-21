# Bot del grupo

Bot de Discord en TypeScript estricto con GIFs, respuestas aleatorias y ranking de participación. SQLite conserva XP y cooldowns por servidor para ejecutarlo en un LXC del homelab.

**Probar la propuesta:** `npm ci` y `npm run preview`; abrí [la sala local](http://127.0.0.1:4371). Usa tres miembros ficticios y una SQLite en memoria, sin token ni conexión a Discord. [Recorrido de la demo](docs/public-commands.md).

## Comandos

Todos son públicos, sin roles especiales. Aceptan texto natural o prefijo `!`.

| Comando | Respuesta |
| --- | --- |
| `grupo comando?` | Convocatoria con GIF y mención al autor. |
| `desayuno?` | Café, comida o una gastada al azar con GIF. |
| `almuerzo?` | Respuesta con GIF; también acepta `aluerzo?`. |
| `cena?` | Respuesta con GIF. |
| `nivel [@usuario]` | Tarjeta de nivel, XP y progreso. Alias: `rank`. |
| `ranking` | Top 10 por XP de participación del servidor. Alias: `top`, `niveles`. |
| `ayuda` | Este catálogo. Alias: `comandos`, `help`. |

Las reacciones sólo pueden notificar al autor. Consultar niveles o rankings no notifica a los miembros mencionados. Las frases y GIFs se editan en `src/content/reactions.ts`; `{user}` se reemplaza por la mención del autor.

## Participación

- Un mensaje nuevo de al menos 5 caracteres, sin espacios externos, puede otorgar **15–25 XP** al azar. El cooldown de **60 segundos por usuario y servidor** persiste después de reiniciar.
- Bots, webhooks, privados, mensajes de sistema, comandos reconocidos y mensajes que empiezan por `!` o `/` no suman XP. No se guarda el contenido de los mensajes.
- Nivel = `floor(sqrt(XP / 100))`: 100 XP para nivel 1, 400 para nivel 2 y 900 para nivel 3. Al subir, el bot responde “Treeemendoo” y menciona al autor. No asigna roles.
- `ranking` usa exclusivamente XP registrado por este bot. Los empates se ordenan por ID. **No representa el total de mensajes del servidor ni recupera historial anterior.** Esa integración queda para otra etapa.
- Lotería, reputación, dados y consultas extra se retiraron para concentrar el catálogo. El XP existente se conserva. Las migraciones anteriores y sus tablas permanecen intactas por compatibilidad; los puntajes antiguos no se convierten en XP.

## Arrancar en Discord

Necesitás Node.js 22 (desde 22.14) o 24+ y un bot creado en el [Discord Developer Portal](https://discord.com/developers/applications).

1. Ejecutá `npm ci`.
2. Copiá `.env.example` a `.env` y completá `DISCORD_TOKEN`.
3. En **Bot → Privileged Gateway Intents**, activá **Message Content Intent**.
4. Invitá el bot con scope `bot` y permisos **View Channels**, **Send Messages**, **Read Message History** y **Embed Links**. En hilos necesita **Send Messages in Threads**.
5. Ejecutá `npm run dev` y escribí `ayuda` en un canal.

Para producción: `npm run build` y `npm start`. Ejecutá una sola instancia para evitar respuestas duplicadas. `DATABASE_PATH` define la SQLite, por defecto `./data/bot.sqlite`.

[Instalación en LXC con systemd, backups y recuperación](docs/self-hosting.md). Después de compilar, `npm run db:backup -- /ruta/backup.sqlite` crea una copia consistente con el bot encendido, sin requerir token.

## Estructura

```text
src/
  index.ts              # Arranque y cierre
  config/               # Variables de entorno
  discord/              # Cliente, perfiles y eventos
  commands/             # Registro, GIFs, niveles y ayuda
  content/              # Frases y GIFs
  database/             # SQLite, migraciones y backup
  cli/                  # Backup sin token
  features/levels/      # XP, cooldown y ranking
  preview/              # Sesión de prueba con la lógica real
  shared/               # Selección aleatoria
preview/                # Interfaz local de la demo
tests/                  # Comandos, eventos, persistencia y demo
deploy/                 # Servicio systemd para LXC
```

El contexto de los comandos es independiente de Discord. El adaptador construye embeds y controla las menciones; la ayuda y la demo usan el mismo registro de siete comandos.

## Verificar

`npm run check` ejecuta TypeScript estricto, tests, compilación limpia y smoke del compilado. El smoke comprueba cierre ordenado y backup/restauración de SQLite sin conectarse a Discord. GitHub Actions usa la misma verificación.

TypeScript activa `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y controles de código sin uso. Las pruebas cubren comandos públicos, menciones, cooldown persistente, concurrencia, separación de servidores, migraciones y recuperación. La prueba local no confirma permisos ni notificaciones reales en Discord; la guía del LXC incluye esa comprobación.
