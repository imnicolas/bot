# Ejecutar el bot en un LXC

Una instancia del bot, Node.js 22 (desde 22.14) o 24+ y SQLite en el disco local del LXC. systemd mantiene el proceso; los datos viven en `/var/lib/discord-bot`, separados del código. No hace falta instalar un servidor de bases de datos ni abrir puertos de entrada.

## Preparar e instalar

Usá un LXC Debian o Ubuntu con systemd. Puede ser no privilegiado: este servicio no necesita Docker, nesting ni acceso a dispositivos del host. Necesita DNS y salida HTTPS/WebSocket hacia Discord.

Dentro del LXC, como root:

1. Instalá Node.js 22 (desde 22.14) o 24+ desde una fuente mantenida para tu distribución ([opciones oficiales](https://nodejs.org/en/download)). Verificá `node --version` y `npm --version`. El servicio busca `node` en `/usr/local/bin`, `/usr/bin` y `/bin`; una instalación sólo dentro de nvm no sirve para este usuario de servicio.
2. Instalá herramientas y creá el usuario:

   ```sh
   apt-get update
   apt-get install -y ca-certificates sqlite3 python3 make g++
   useradd --system --user-group --home-dir /var/lib/discord-bot --no-create-home --shell /usr/sbin/nologin discordbot
   install -d -o root -g root -m 0755 /opt/discord-bot
   install -d -o discordbot -g discordbot -m 0700 /var/lib/discord-bot
   ```

   Python, make y g++ permiten compilar el binding nativo de SQLite si la plataforma no dispone de un binario precompilado.

3. Copiá la revisión del código que vas a desplegar a `/opt/discord-bot`, excluyendo `.env`, `node_modules`, `dist`, `.git` y `data`. No copies los módulos de macOS al LXC; se instalan para Linux en el siguiente paso. Para probar un PR antes del merge, usá su rama; `main` sólo incorpora cambios ya integrados.
4. Compilá y verificá antes de instalar el servicio:

   ```sh
   cd /opt/discord-bot
   npm ci
   npm run check
   npm prune --omit=dev
   npm run smoke
   chown -R root:root /opt/discord-bot
   install -o root -g root -m 0600 deploy/discord-bot.env.example /etc/discord-bot.env
   ```

5. Editá `/etc/discord-bot.env` y completá el token. Conservá `DATABASE_PATH=/var/lib/discord-bot/bot.sqlite`. No copies el token al unit de systemd ni al repositorio. El archivo lo lee systemd antes de cambiar al usuario `discordbot`.
6. Activá **Message Content Intent**, invitá el bot y concedé los permisos del README. Después:

   ```sh
   install -o root -g root -m 0644 deploy/discord-bot.service /etc/systemd/system/discord-bot.service
   systemctl daemon-reload
   systemctl enable --now discord-bot
   systemctl status discord-bot
   journalctl -u discord-bot -n 50 --no-pager
   ```

`npm run smoke` prueba el compilado con datos temporales, una respuesta de Discord simulada, cierre y backup/restauración. Funciona con las dependencias de producción y no usa el token ni conecta a Discord.

El primer arranque crea la base y ejecuta las migraciones. El servicio reinicia ante una caída, con una espera de 10 segundos. Si falla repetidamente por token, permisos o configuración, corregí el problema y ejecutá `systemctl reset-failed discord-bot` y `systemctl start discord-bot`.

## Datos y backups

| Ruta | Contenido |
| --- | --- |
| `/opt/discord-bot` | Código y dependencias; reemplazable al actualizar. |
| `/etc/discord-bot.env` | Token y ruta de la base; root, modo 0600. |
| `/var/lib/discord-bot/bot.sqlite` | XP, cooldowns, versión del esquema y tablas anteriores conservadas. |
| `/var/lib/discord-bot/bot.sqlite-wal` y `-shm` | Archivos administrados por SQLite mientras trabaja. |

La base debe estar en almacenamiento local al LXC. WAL requiere que sus conexiones compartan el mismo host y no funciona sobre NFS. La app usa `synchronous=FULL` y un timeout de bloqueo de 5 segundos. SQLite conserva los cambios confirmados frente a una caída de proceso; la durabilidad ante fallos físicos también depende del almacenamiento del homelab.

Para un backup consistente **con el bot encendido**, como root:

```sh
cd /opt/discord-bot
runuser -u discordbot -- env DATABASE_PATH=/var/lib/discord-bot/bot.sqlite node dist/cli/backup.js /var/lib/discord-bot/backups/bot-$(date -u +%Y%m%dT%H%M%SZ).sqlite
```

El comando usa la API de backup de SQLite y rechaza un destino existente. No necesita el token. Copiá el resultado fuera del LXC y definí retención en tu herramienta habitual de backups. Un backup guardado únicamente dentro del mismo LXC no cubre la pérdida de su disco. Si usás snapshots del contenedor, conservá la base junto con sus sidecars; no copies sólo el `.sqlite` mientras el proceso está escribiendo.

### Restaurar

Elegí un backup compatible con la versión del código. Con el proceso detenido, conservá el directorio actual y restaurá en uno nuevo para no mezclar archivos WAL viejos:

```sh
systemctl stop discord-bot
mv /var/lib/discord-bot /var/lib/discord-bot.previous-$(date -u +%Y%m%dT%H%M%SZ)
install -d -o discordbot -g discordbot -m 0700 /var/lib/discord-bot
install -o discordbot -g discordbot -m 0600 /ruta/al/backup.sqlite /var/lib/discord-bot/bot.sqlite
runuser -u discordbot -- sqlite3 /var/lib/discord-bot/bot.sqlite 'PRAGMA integrity_check;'
```

La comprobación debe imprimir `ok`. Después ejecutá `systemctl start discord-bot`, probá `nivel` y `ranking` y revisá el journal. El directorio anterior se conserva para diagnóstico; limpiá versiones antiguas cuando verifiques la recuperación.

## Actualizar

1. Creá un backup y copialo fuera del LXC.
2. Ejecutá `systemctl stop discord-bot`.
3. Actualizá `/opt/discord-bot`, conservando una copia de la versión anterior. No toques `/var/lib/discord-bot` ni `/etc/discord-bot.env`.
4. Ejecutá `npm ci`, `npm run check` y `npm prune --omit=dev` en el checkout nuevo.
5. Si cambió el unit, instalalo de nuevo y ejecutá `systemctl daemon-reload`.
6. Ejecutá `systemctl start discord-bot` y revisá el journal. Las migraciones se aplican en una transacción al arrancar.

El bot rechaza esquemas de una versión posterior. Para volver a un código que no conoce el esquema nuevo, restaurá también su backup compatible; no basta con cambiar el binario.

## Compatibilidad de datos

La reducción de comandos conserva el XP y el cooldown existentes. Las migraciones anteriores no se reescriben ni eliminan sus tablas: los datos de lotería y reputación de versiones previas quedan archivados en la misma SQLite y sus backups. El ranking actual sólo consulta XP; no convierte esos puntajes en participación.

Si la configuración todavía tiene `DATA_FILE`, reemplazalo por `DATABASE_PATH`. El JSON de lotería anterior no es una fuente de XP. No hay importación automática de historial de Discord ni de ProBot.

## Comprobar en Discord

- `desayuno?`, `almuerzo?`, `cena?` y `grupo comando?`: texto aleatorio, GIF y mención sólo al autor.
- `ayuda`: siete comandos públicos, disponibles para un miembro sin roles especiales.
- Dos mensajes normales de al menos cinco caracteres: sólo el primero suma XP si pasan menos de 60 segundos.
- `nivel`, `nivel @usuario` y `ranking`: consultan XP sin sumar ni notificar a otros miembros.
- Después de 60 segundos, un nuevo mensaje elegible permite sumar otra vez.
- Reiniciá el servicio y verificá que se conservan XP y cooldown. El ranking no incluye mensajes anteriores a la activación del bot.

Fuentes: [SQLite WAL](https://www.sqlite.org/wal.html), [API de better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md), [systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html).
