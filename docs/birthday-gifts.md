# Cumpleaños desde SQLite y retirada del rol Cumpleañeri

Pepe lee cumpleaños de SQLite y **7 días antes retira el rol Cumpleañeri**. Confirma que el cumpleañero no vea ninguno de los canales protegidos y entonces publica `@here 🎁 ¡Organizamos el regalo!` en el canal de organización, con botones de participación. La reincorporación es manual. No lee Excel ni Google Sheets durante la ejecución.

## Configuración

```dotenv
FEATURE_GIFTS_ENABLED=false
GIFTS_GUILD_ID=ID_DEL_SERVIDOR
GIFTS_ROLE_ID=ID_DEL_ROL
GIFTS_CHANNEL_ID=ID_DEL_CANAL_DE_AVISOS
GIFTS_PROTECTED_CHANNEL_IDS=ID_CANAL_1,ID_CANAL_2
GIFTS_TIME_ZONE=America/Montevideo
GIFTS_ADMIN_IDS=ID_ADMIN_A,ID_ADMIN_B
GIFTS_DM_ONLY_ADMIN_ID=ID_ADMIN_B
GIFTS_TEST_COMMAND_ENABLED=false
GIFTS_TEST_CHANNEL_ID=ID_CANAL_DE_PRUEBAS
```

El canal de avisos siempre se incluye entre los protegidos; los adicionales se indican separados por coma, hasta diez canales de texto del mismo servidor. Los IDs y datos reales van en configuración privada, fuera de Git.

En todos los canales, `@everyone` debe tener denegado **Ver canal** y Cumpleañeri debe conceder acceso. Si otro rol o sobrescritura permite que el cumpleañero siga viendo cualquier canal protegido, Pepe bloquea la convocatoria. No modifica sobrescrituras del canal.

Pepe necesita **Gestionar roles** en el servidor, y Cumpleañeri debe estar por debajo de su rol más alto, sin ser un rol administrado por una integración ni `@everyone`. Necesita ver y leer historial en los canales protegidos; en el canal de avisos, además enviar mensajes, insertar enlaces y **Mencionar @everyone, @here y todos los roles**. No necesita Administrador.

## Flujo

| Momento | Acción |
| --- | --- |
| Arranque y cada minuto | Consulta los cumpleaños en SQLite. |
| Desde 7 días antes hasta el cumpleaños | Guarda intención y rol en SQLite, retira únicamente Cumpleañeri a miembros comunes que lo tengan y vuelve a consultar permisos efectivos. |
| Todas las exclusiones confirmadas | Publica una convocatoria con `@here`, nombre, fecha y botones **✅ Participo / Retirar participación**. No menciona al cumpleañero. |
| Participación | Guarda adhesiones en SQLite; repetir el check no duplica participantes. La confirmación es privada y no acredita pagos. |
| Día del cumpleaños | No devuelve el rol automáticamente. |
| Reincorporación | Un organizador ejecuta `!regalo reincorporar @persona`; devuelve sólo el rol retirado y cierra el ciclo. |

Para un cumpleaños el **12/11**, empieza el **05/11**. Usa la zona horaria configurada, incluidos cruces de año; 29/02 se considera 28/02 en años no bisiestos. Si estuvo apagado, recupera cumpleaños todavía dentro de la ventana. Antes de publicar cualquier convocatoria verifica todas las exclusiones superpuestas.

La retirada afecta los accesos concedidos por ese rol en Discord; reservá el rol para organizar regalos. Reincorporar devuelve acceso al canal y su historial. La coordinación, rotación de responsables y transferencias son manuales.

## Administradores y comandos

Los dos administradores reciben DMs cruzados 7 días antes. Pepe no les modifica roles ni revela la sorpresa en el canal mientras conserven acceso: Administrador y dueño pueden eludir restricciones. Tras una exclusión humana comprobada en todos los canales, publica la convocatoria. Su reincorporación también es humana; el comando sólo confirma el acceso restaurado y cierra el ciclo.

`GIFTS_DM_ONLY_ADMIN_ID` identifica a la cuenta que se coordina externamente: sólo DM al otro administrador, sin convocatoria ni cambio de acceso. Pepe no se conecta a WhatsApp. Reintenta DMs rechazados tras seis horas y reconcilia envíos inciertos sin reenviar a ciegas.

Los comandos requieren Administrador o **Gestionar canales** en el canal de avisos, con permisos consultados al ejecutar. No suman XP.

| Comando | Resultado |
| --- | --- |
| `!regalo estado` | Exclusiones pendientes, estados y cantidad de participantes. |
| `!regalo participantes @persona` | Lista las adhesiones sin notificar a los mencionados. |
| `!regalo reincorporar @persona` | Devuelve el rol retirado o confirma la reincorporación administrativa manual. |
| `!regalo anunciar @persona` | Recupera una convocatoria pendiente después de revalidar las exclusiones. |

## Carga privada de la base

El CSV es una herramienta de importación; **SQLite es la fuente durante la ejecución**. Importar no envía mensajes ni cambia Discord. Los cambios se leen en la siguiente revisión, sin necesitar un archivo Excel al arrancar.

```sh
npm run build
DATABASE_PATH=/ruta/privada/bot.sqlite npm run db:backup -- /ruta/privada/antes-de-importar.sqlite
DATABASE_PATH=/ruta/privada/bot.sqlite npm run gifts:import -- --guild ID --file /ruta/privada/cumples.csv
DATABASE_PATH=/ruta/privada/bot.sqlite npm run gifts:import -- --guild ID --file /ruta/privada/cumples.csv --apply
```

La [plantilla mínima](../examples/birthdays.csv) usa `user_id,nombre,fecha cumple`, con IDs como texto y fecha **DD/MM**. También admite las cabeceras originales y apellido opcional. Valida el lote completo, fechas e identidades únicas antes de escribir; admite UTF-8/BOM/CRLF, máximo 1000 filas y 1 MiB. Importar actualiza por servidor e ID; omitir una fila no la borra.

Si faltan IDs, `gifts:resolve -- --guild ID --file origen.csv --output resuelto.csv` consulta usernames exactos en Discord, rechaza bots y ambigüedades y crea un archivo nuevo con permisos 0600. Revisá el resultado antes de importar; no resuelve por apodos.

`gifts:import-roster` carga las nueve columnas de contacto originales, como en la [plantilla ficticia](../examples/gift-roster.csv). Cumpleaños y contactos se actualizan en una transacción; teléfonos y códigos postales quedan como texto. Los contactos se guardan aparte y no aparecen en respuestas de Discord ni en errores de importación.

La columna opcional `categoria=gift/no-gift` se conserva por compatibilidad; un CSV antiguo no borra clasificaciones existentes. El padrón actual incluye **todos sus cumpleaños** como `gift`, sin exclusiones por persona. Un ciclo abierto debe cerrarse antes de aplicar una exclusión futura.

Guardá CSV, SQLite y backups fuera de Git, con archivos 0600 y directorios 0700. No adjuntes planillas reales a PRs, issues o artefactos de CI. Las pruebas versionadas usan datos inventados.

## Recuperación y despliegue

SQLite conserva el rol concreto retirado, estado anual, mensaje y participantes. Una respuesta perdida al retirar el rol se recupera sin retirarlo otra vez. Reiniciar no duplica convocatorias ni privados. Ante un envío incierto, busca su marca entre los últimos 100 mensajes y bloquea el reenvío si no puede confirmarlo; `!regalo anunciar` permite recuperación consciente.

No cambies rol ni canal de avisos con exclusiones pendientes. El ID persistido impide devolver otro rol por un cambio de configuración. Las exclusiones del mecanismo anterior deben cerrarse antes de migrar a retirada de roles; no se convierten silenciosamente.

Antes de desplegar, respaldá y migrá **la base activa**, conservando XP y cooldowns. No la sustituyas por la base de preparación. El esquema actual es 9 y conserva cumpleaños, contactos y categorías anteriores. No abras una base migrada con un ejecutable antiguo. Mantené la función apagada hasta probar el canal real con miembros ficticios.

## Laboratorio y verificación

`npm run preview` sirve [el laboratorio](http://127.0.0.1:4371/cumples): inicio simulado a 7 días, retirada del rol, checks, reinicio y reincorporación. Usa el servicio real con transporte ficticio y SQLite en memoria. No tiene token, cliente Discord ni acceso a la base activa.

`PREVIEW_GIFTS_ROSTER=/ruta/privada/padron.csv` permite cargar identidades locales; configura también los IDs administrativos. Sólo proyecta identidad y cumpleaños, sin servir contactos. Escucha en loopback y valida Host/Origin.

El comando temporal `!cumple @persona` o ID requiere `GIFTS_TEST_COMMAND_ENABLED=true` y un canal de pruebas configurado. Necesita permisos de organización y sólo devuelve un resumen simulado, sin retirar roles, escribir en la base activa ni enviar DMs.

`npm run check` verifica TypeScript, calendario, importación, SQLite, DMs, botones, CLI y backups. El smoke con SDK real y transporte simulado verifica dos canales protegidos, respuesta perdida al quitar el rol, bloqueo mientras el segundo canal siga visible y devolución del rol sin tocar sobrescrituras. `npm run preview:check` prueba la frontera HTTP. Estas pruebas no acreditan permisos efectivos del servidor real.

Esta unidad sustituye el lector Excel y su sincronizador por importadores privados, SQLite y retirada del rol. Para desactivar, primero reincorporá miembros con ciclos abiertos y después apagá `FEATURE_GIFTS_ENABLED`. Conservá base y migraciones durante un rollback. Retirar sólo demo/comando temporal no afecta ciclos; retirar el runtime exige preservar el registro de roles pendientes para restaurarlos manualmente.
