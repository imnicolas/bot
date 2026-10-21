# Revisar la propuesta sin conectar Discord

Ejecutá `npm run preview` y abrí `http://127.0.0.1:4371`. La sala usa el handler y repositorio de XP reales con una SQLite independiente en memoria. No lee `.env`, usa token ni se conecta a Discord. Reiniciarla restaura los datos ficticios iniciales.

## Recorrido

1. Probá `desayuno?`, `almuerzo?` o `cena?` varias veces: cada pedido tiene una chance entre tres de premio. Tanto los premios como los rechazos tienen frases y GIFs propios; sólo se menciona al autor. `aluerzo?` y `lamuerzo?` también piden almuerzo. `grupo comando?` mantiene su convocatoria.
2. Cambiá entre Lucía, Nico y Mara. Todos pueden usar los siete comandos sin roles especiales.
3. Escribí un mensaje normal como Lucía: parte de 95 XP y alcanza nivel 1. `nivel` muestra su progreso; `nivel @Nico` consulta otro miembro sin notificarlo.
4. Otro mensaje inmediato no suma XP. Avanzá `+1 minuto` y repetí para probar el cooldown.
5. `ranking` muestra el top por participación. `top` y `niveles` son alias de la misma tabla. `ayuda` muestra sólo los siete comandos vigentes.

Se conservan cuatro comandos de GIFs, dos consultas de participación y la ayuda. La suerte se vuelve a sortear en cada pedido, sin cupos ni cooldown de comida; ganar o perder no modifica el XP. No se garantiza exactamente un premio cada tres intentos. Se retiraron lotería, reputación, dados, saludo, eco, ping y consultas adicionales. No hay comandos administrativos ni cambios de roles.

El XP cuenta mensajes nuevos elegibles observados por este bot; no mide el total histórico de mensajes de Discord. No se recuperan datos de ProBot ni mensajes anteriores en esta etapa. El reloj y los miembros de prueba pertenecen únicamente a la demo.

## Datos y acceso

Todos los comandos declaran `access: 'public'`. Las consultas a terceros requieren una mención resuelta a un miembro del servidor. Las consultas y rankings no notifican a esos miembros; GIFs y avisos de nivel sólo pueden notificar al autor.

El XP existente en SQLite se conserva. Las migraciones ya aplicadas y las tablas de lotería/reputación anteriores no se modifican ni borran; el código activo sólo consulta participación. Los backups siguen incluyendo la base completa.

El estilo de las reacciones y avisos se contrastó con Argentina Developer mediante la interfaz de Discord, sin enviar mensajes ni importar puntajes reales. Los GIFs se pueden reemplazar en `src/content/reactions.ts`.

La demo permite revisar comandos, frases y presentación. Los permisos y notificaciones reales se comprueban después en Discord siguiendo `docs/self-hosting.md`.
