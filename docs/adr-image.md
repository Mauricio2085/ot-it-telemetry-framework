# Nodos dentro de la imagen

[English](adr-image.en.md)

Estado: aceptada. 2026-10-29.

## Contexto

Las dos imágenes oficiales de Node-RED arrancaban y, si el flujo pedía un nodo que no estaba, lo instalaban en `/data`. `/data` es la carpeta del repo montada en el contenedor. El primer arranque necesitaba red, y `node_modules` quedaba en el directorio de trabajo, fuera de git.

## Decisión

Cada Node-RED es una imagen propia, `edge-node-red-ingestion:4.0.9` y `edge-node-red-etl:4.0.9`, sobre `nodered/node-red:4.0.9`. El `npm ci` corre al construir la imagen e instala en `/opt/nodes`, que no es el montaje de `/data`. La ingesta lleva `node-red-contrib-modbus` 5.45.2. El ETL lleva `node-red-contrib-postgresql` 0.16.2.

`settings.js` apunta `nodesDir` a `/opt/nodes` y deja `autoInstall` en falso. El editor tampoco instala nodos. Al arrancar, el entrypoint borra `/data/node_modules` si un arranque anterior lo dejó ahí, para que el mismo nodo no se registre dos veces.

La red hace falta para construir la imagen. Un arranque de esa imagen no llama a npm.

## Comprobación

1. `scripts/check-image.js` revisa los Dockerfile, que `/data/package.json` no tiene dependencias, y que el require de Modbus apunta a `/opt/nodes`.
2. `docker compose build node-red-ingestion node-red-etl`.
3. `docker run --network none --entrypoint node edge-node-red-ingestion:4.0.9 -e "require('/opt/nodes/node_modules/node-red-contrib-modbus/modbus/core/modbus-client-core.js')"` termina sin error. Lo mismo con `node-red-contrib-postgresql` en la imagen del ETL.
4. El log de arranque no dice `Installing module`.

## Consecuencias

- Un nodo nuevo es un cambio de `package.json`, del lockfile y una imagen nueva. No entra por el editor.
- TLS, las cuentas del broker y la política de reinicio no entran en este corte.
- La zona horaria se queda. La política de reinicio está en [adr-alert.md](adr-alert.md).
