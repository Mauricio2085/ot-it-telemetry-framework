# Alcance del producto

[English](adr-scope.en.md)

Estado: aceptada. 2026-10-25.

La fase 1 y la fase 2 están hechas. Las etapas 1, 2 y 3 de la fase 3 están hechas. Falta el tablero.

## De dónde viene

Este repositorio parte de [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). El código que está en el árbol salió de ese laboratorio: tres activos simulados y tres señales fijas. El camino opcional de OPC UA salió en la fase 1.

De ese laboratorio este producto adopta dos decisiones, tal como quedaron escritas:

| Decisión | Texto | Qué se adopta |
| --- | --- | --- |
| Frontera OT/IT y tópico | [adr-ot-it.md](adr-ot-it.md), aceptada el 2026-10-24 | OT e IT solo se encuentran en el broker. El tópico es `plant/area/asset/telemetry`. |
| Mediciones | [adr-measurements.md](adr-measurements.md), aceptada el 2026-10-22 | Las señales siguen el modo de falla. El destino es una fila por señal, con su calidad. Este producto lo aplica en la fase 3, sin dejar el contrato ancho como esquema del framework. |

Esas dos decisiones se mantienen. El motor es el primer perfil, no el esquema de todos los clientes.

## Decisión

El producto monitorea un motor mecánico crítico: `critical-motor-01`.

Las señales son temperatura de rodamientos y vibración. La presión no entra: un motor solo mecánico no tiene presión de proceso que medir. La bomba y el compresor del laboratorio quedan fuera.

La lectura entra por Modbus TCP. El esclavo expone holding registers, Node-RED los escala y publica el JSON en MQTT. OPC UA no forma parte del producto: es un estándar OT de un cliente concreto, no del producto.

Las tres palabras de calidad se quedan: `good`, `uncertain` y `bad`. Salieron del modelo de estado de OPC UA en el laboratorio. Se adopta el vocabulario. No se adopta el protocolo.

Los límites de la temperatura de rodamientos, hasta que una hoja de datos los reemplace, son los que el laboratorio ya tenía para la temperatura de ese motor: nominal 55 °C, aviso 80 °C, alarma 90 °C. La vibración sigue en 2.8 mm/s y 4.5 mm/s (ISO 10816-3).

## Fases

Las fases 1 y 2 están hechas. Las etapas 1, 2 y 3 de la fase 3 están hechas. La etapa 4 no. Cada fase deja el stack levantable y cierra en sus propios commits. La fila del framework es activo, señal, valor, calidad y tiempo. Otro activo es otro perfil: su tipo, sus señales, sus límites y su adaptador de campo. La tabla no se vuelve a migrar por eso.

### 1. Quitar OPC UA

Hecha. Salió la pestaña de ingesta, `node-red-contrib-opcua`, `OPCUA_ENDPOINT` y la guía de Prosys. Modbus, el simulador y el contrato ancho siguen.

Comprobación: el flujo de ingesta no tiene nodos OPC UA y el motor sigue publicando.

### 2. Dejar solo el motor

Hecha. Salieron `mqtt-simulator`, `critical-pump-01` y `critical-compressor-01` del compose, del registro, de los límites y de `scripts/demo-prep.sh`. El tipo del registro quedó `motor`. El episodio `uncertain` de la bomba salió con ella. El desbalance y la falla del transmisor de vibración se quedan: son el caso de referencia.

En esta fase el contrato sigue ancho. El esclavo todavía publica presión. Con un solo activo, un minuto sano tiene 11 o 12 lecturas; el ámbar de «lecturas / min» pasa de 30 a 10. Una base ya creada no pierde las filas viejas con los scripts de inicio: se recrea el volumen.

Comprobación: `asset_condition` tiene una fila, la del motor, y el script de demo ya no reinicia el simulador.

### 3. Perfil del motor en filas

Una sola fase, en cuatro etapas, para no congelar dos columnas:

1. **Contrato.** Hecha. El esquema es `contracts/telemetry-v2.schema.json`. El mensaje lleva `asset_id`, `ts` y `signals`; cada señal lleva nombre, valor y calidad. El ejemplo del perfil publica `bearing_temperature` y `vibration` con la misma calidad. Otro ejemplo trae calidades distintas y pasa. Un nombre que no es de este perfil también pasa: el esquema no lo cierra. El mensaje ancho ya no pasa el chequeo. Comprobación: `scripts/check-contracts.py` acepta el perfil, las calidades distintas y el nombre abierto, y rechaza el mensaje ancho.
2. **Borde.** Hecha. HR0 es temperatura de rodamientos × 10, HR1 es vibración × 100 y HR2 es el estado (`0` good, `1` uncertain, `2` bad). El esclavo ya no publica presión. El ETL parte las señales y rechaza la que no tiene fila en `asset_limits`. En esa etapa la tabla seguía ancha, así que las señales aceptadas se plegaban en una fila. Comprobación: el tópico trae las dos señales y una señal fuera de `asset_limits` queda en `rejected_messages`.
3. **Base.** Hecha. `sensor_readings` guarda `time`, `asset_id`, `signal`, `value` y `quality`. Planta y área siguen en `assets`. `asset_limits` es el catálogo de señales: el `CHECK` ya no cierra los nombres. La condición y el agregado de un minuto agrupan por señal. «Lecturas / min» cuenta instantes, no filas. La base ya creada se recrea con el volumen. Comprobación: un instante deja dos filas, una señal fuera del catálogo no se guarda, y dos calidades distintas del mismo instante sí se guardan.
4. **Tablero.** Dos tendencias, temperatura de rodamientos y vibración, con los límites leídos de `asset_limits`. El panel de presión sigue en el tablero, vacío. La tabla de detalle ya muestra una fila por señal. Una señal nueva entra en la condición y en esa tabla sin cambiar el esquema. Su tendencia es un panel del perfil que la traiga.

Los límites no cambian: temperatura de rodamientos en 55 °C, 80 °C y 90 °C; vibración en 2.8 mm/s y 4.5 mm/s. La base ya creada se recrea con el volumen, porque el agregado continuo no se altera en el sitio.

Comprobación: la vibración pasa a aviso y a alarma, el `bad` de 25 mm/s no mueve la condición, y la temperatura de rodamientos se queda en su banda.

### Lo que no es una fase

Una bomba, un conveyor u OPC UA pedido por un cliente es un perfil nuevo. OPC UA entra como adaptador de ese cliente, no como parte del producto.

## Consecuencias

- Quien levante el stack hoy ve el motor, sin presión. La bomba, el compresor y la pestaña OPC UA ya no están. El mensaje publicado es la lista de señales y `sensor_readings` guarda una fila por señal. El tablero todavía tiene el panel de presión, vacío.
- Los textos de Modbus, condición, registro, historial y rechazos describen ese código hasta que la fase correspondiente los alcance.
- La frontera del broker, el tópico, el registro, la condición por promedio de un minuto y el historial de un minuto se quedan. La fase 3 cambia la forma de la fila, no esa frontera.
