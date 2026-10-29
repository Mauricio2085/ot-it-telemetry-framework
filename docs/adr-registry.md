# Registro desde el perfil

[English](adr-registry.en.md)

Estado: aceptada. 2026-10-29.

## Contexto

`profiles/*.json` ya dice qué registros leer. `assets` y `asset_limits` seguían siendo un `INSERT` en los scripts de inicio. Cambiar un umbral y cambiar el mapa eran dos sitios distintos, y el archivo no escribía la base.

La ingesta está en `ot-net`. No llega a TimescaleDB. El ETL sí.

## Decisión

El mismo archivo lleva el tipo, la criticidad y, en cada señal, la unidad, el nominal, los umbrales y la referencia. Un umbral que no aplica se omite. El tipo sigue cerrado en `motor`. La criticidad sigue siendo `critical` o `standard`.

`node-red-etl` monta `profiles/` y, cuando la base responde, hace el upsert de `assets` y de `asset_limits`. Si una señal de ese activo ya no está en el archivo, borra su fila de límites. Las lecturas viejas se quedan. Un activo cuyo archivo se quitó de `profiles/` se queda en `assets`: el historial impide borrarlo, y este corte no lo borra.

El upsert reintenta cada 5 segundos hasta el primero que responde. Editar el archivo no alcanza: un cambio de mapa pide reiniciar `node-red-ingestion`; un cambio de registro o de umbral pide reiniciar `node-red-etl`.

Los scripts de inicio crean las tablas y las claves. Ya no insertan el motor.

## Comprobación

1. `scripts/check-profile.js` arma el payload del motor: tipo `motor`, vibración con aviso 2.8 y alarma 4.5, y rechaza un tipo distinto, una señal sin umbral y un nominal fuera de la banda de aviso.
2. Con el stack en marcha, `asset_limits` tiene esos dos umbrales.
3. Cambiar `warning_high` de la vibración en el archivo y ejecutar `docker compose restart node-red-etl` mueve la línea del tablero en el siguiente refresco. Volver el archivo a 2.8 y reiniciar otra vez deja la línea donde estaba.

## Consecuencias

- Una base nueva no tiene el motor hasta que ese upsert responde. La ingesta espera 2 segundos antes del primer poll. El upsert arranca al medio segundo. Una lectura que gane esa carrera se rechaza; no entra en la cola.
- Con la base caída, el reintento sigue. La copia del catálogo puede ir detrás del archivo hasta que el upsert responda.
- Un `UPDATE` directo en la base dura hasta el próximo arranque del ETL. El archivo vuelve a escribir la fila.
- No hay pantalla de alta. Otro tipo de activo no entra: el archivo tiene que decir `motor`.
