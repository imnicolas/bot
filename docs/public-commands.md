# Revisar Pepe sin conectar Discord

Ejecutá `npm run preview` y abrí `http://127.0.0.1:4371`. La sala usa el handler real con una SQLite en memoria, sin token ni conexión a Discord.

1. Probá `mate?`, `vino?`, `té?`, `café?`, `ban?`, `aika?`, `medialunas?`, `buen dia` y `pala?`. Son reacciones públicas del [catálogo de ProBot](probot-commands.txt); `ban?` no modera ni expulsa a nadie. Con o sin tildes, `?` y prefijo `!` llegan al mismo comando.
2. Probá `desayuno?`, `almuerzo?` y `cena?`: cada pedido tiene una chance entre tres de premio. `aluerzo?` y `lamuerzo?` piden almuerzo. Ganar o perder no modifica el XP.
3. `grupo comando?` mantiene su convocatoria. `ayuda` muestra únicamente los comandos habilitados.
4. Por defecto, `rank`, `nivel`, `ranking`, `top` y `niveles` no responden y los mensajes no suman XP. La ayuda y la demo reflejan ese estado.
5. Para revisar participación opcional, ejecutá `FEATURE_LEVELS_ENABLED=true npm run preview`. Lucía parte de 95 XP; un mensaje normal la lleva al nivel 1. Avanzá `+1 minuto` para probar el cooldown y consultá `nivel` o `ranking`.

La demo lee `FEATURE_SOCIAL_ENABLED`, `FEATURE_MEALS_ENABLED` y `FEATURE_LEVELS_ENABLED` del entorno del proceso; no carga `.env`. Reiniciarla aplica cambios y restaura datos ficticios. Los tres valores se documentan en el README.

Las reacciones sólo pueden mencionar al autor; las consultas de participación no notifican a terceros. Las features apagadas no ejecutan comandos ni aparecen en el catálogo; un comando conocido pero apagado tampoco participa en XP. Apagar niveles conserva XP y cooldowns en SQLite, junto con las tablas anteriores de lotería y reputación.

Los GIFs e imágenes del catálogo están en `assets/probot`, salvo `aika`, cuyo host original devuelve “service unavailable”: el comando responde con un aviso temporal y conserva la referencia para recuperarla. La fuente original se conserva sin cambios en `probot-commands.txt`; los reemplazos de mate y pala se documentan en el catálogo de código.
