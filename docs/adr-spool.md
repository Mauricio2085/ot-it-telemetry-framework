# Cola del ETL

[English](adr-spool.en.md)

Estado: aceptada. 2026-10-28.

## Contexto

El ETL se suscribe con sesión MQTT limpia y da la lectura por recibida antes de que termine el insert. Mosquitto aguanta su propio reinicio. No guarda una lectura cuyo insert en TimescaleDB falló.

`Look up asset` y `Look up limits` también necesitan TimescaleDB. Con la base caída, la lectura no llega a ser una fila aceptada, así que no hay qué reintentar.

## Decisión

La cola vive en el ETL, en el volumen `etl_spool`. Guarda dos archivos.

`catalog.json` es el último registro y catálogo de señales que respondieron bien. `Match registry` y `Split signals` lo reescriben. Una consulta que falla usa esa copia. Valen las mismas reglas: el activo tiene que estar, la planta y el área del tópico tienen que coincidir, y cada señal necesita una entrada del catálogo. Una señal que no las cumple es un rechazo, y un rechazo no entra en la cola.

`queue.jsonl` es una fila aceptada por línea: `time`, `asset_id`, `signal`, `value` y `quality`. `Append spool` escribe la fila cuando falla `Insert reading`. `Drain spool` la reintenta con el mismo `INSERT`. `ON CONFLICT DO NOTHING` evita guardar dos veces la fila repetida. `Ack spool` quita la línea cuando el insert responde.

Si el ETL arranca con TimescaleDB caída y no existe `catalog.json`, la lectura se descarta. No se encola y no se rechaza.

`Drain spool` escribe cuántas lecturas esperan en `queue_depth` cada dos segundos. La banda de pipeline de Asset Health lee esa fila. Con TimescaleDB caída la fila no se mueve, y el tablero no puede mostrarla.

La cola no crece sin fin. Este perfil publica dos señales cada 5 segundos, así que siete días son 241920 líneas. `append` se queda con ese máximo y descarta las más viejas. La profundidad no pasa de ahí. Una caída más larga pierde el extremo viejo: esas líneas no llegan a `sensor_readings`. El flujo no pasa un tope distinto. El chequeo sí, con un máximo de 2, para no escribir los siete días.

## Comprobación

1. Con el stack en marcha, una lectura del motor queda guardada y `catalog.json` existe en el volumen de la cola.
2. `docker compose stop timescaledb`. El motor sigue publicando.
3. `docker compose start timescaledb`. Las lecturas de la caída están en `sensor_readings`, una vez cada una.

## Consecuencias

- Un rechazo del contrato sigue yendo a `rejected`. Con la base caída, el insert en `rejected_messages` falla. La publicación MQTT no.
- La copia puede ir detrás del registro. Una señal borrada de `asset_limits` durante la caída se sigue aceptando hasta la siguiente consulta que responda.
- Reiniciar `node-red-etl` conserva la cola. El volumen es el almacén.
- El tope no abre otro almacén ni hace que el número del tablero se mueva con la base caída. Una cola que ya pasó el tope se recorta en el siguiente `append`.
