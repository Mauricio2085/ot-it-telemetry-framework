# Alcance del producto

[English](adr-scope.en.md)

Estado: aceptada. 2026-10-25.

La fase 1 está hecha. La bomba, el compresor y la presión siguen en el árbol hasta las fases 2 y 3.

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

La fase 1 está hecha. Las fases 2 y 3 no. Cada una deja el stack levantable y cierra en sus propios commits. La fila del framework es activo, señal, valor, calidad y tiempo. Otro activo es otro perfil: su tipo, sus señales, sus límites y su adaptador de campo. La tabla no se vuelve a migrar por eso.

### 1. Quitar OPC UA

Hecha. Salió la pestaña de ingesta, `node-red-contrib-opcua`, `OPCUA_ENDPOINT` y la guía de Prosys. Modbus, el simulador y el contrato ancho siguen.

Comprobación: el flujo de ingesta no tiene nodos OPC UA y el motor sigue publicando.

### 2. Dejar solo el motor

Salen `mqtt-simulator`, `critical-pump-01` y `critical-compressor-01` del compose, del registro, de los límites y de `scripts/demo-prep.sh`. El tipo del registro queda `motor`. El episodio `uncertain` de la bomba sale con ella. El desbalance y la falla del transmisor de vibración se quedan: son el caso de referencia.

En esta fase el contrato sigue ancho. El esclavo todavía publica presión. Con un solo activo, un minuto sano tiene 11 o 12 lecturas; el ámbar de «lecturas / min» pasa de 30 a 10. Una base ya creada no pierde las filas viejas con los scripts de inicio: se recrea el volumen.

Comprobación: `asset_condition` tiene una fila, la del motor, y el script de demo ya no reinicia el simulador.

### 3. Perfil del motor en filas

Una sola fase, en cuatro etapas, para no congelar dos columnas:

1. **Contrato.** El mensaje lleva `asset_id`, `ts` y `signals`, cada una con nombre, valor y calidad. Este perfil publica `bearing_temperature` y `vibration`. El esclavo tiene un solo estado de equipo, así que las dos señales salen con esa misma calidad. La forma ya permite que otra fuente las distinga.
2. **Borde.** HR0 es temperatura de rodamientos × 10, HR1 es vibración × 100 y HR2 es el estado (`0` good, `1` uncertain, `2` bad). El ETL parte el mensaje en una fila por señal y rechaza una señal que no tenga fila en `asset_limits`.
3. **Base.** `sensor_readings` guarda `time`, `asset_id`, `signal`, `value` y `quality`. Planta y área siguen en `assets`. `asset_limits` es el catálogo de señales: el `CHECK` deja de cerrar los nombres. La condición y el agregado de un minuto agrupan por señal. «Lecturas / min» cuenta instantes, no filas, y sigue en 11 o 12.
4. **Tablero.** Dos tendencias, temperatura de rodamientos y vibración, con los límites leídos de `asset_limits`. La tabla de detalle es una fila por señal. Una señal nueva entra en la condición y en esa tabla sin cambiar el esquema. Su tendencia es un panel del perfil que la traiga.

Los límites no cambian: temperatura de rodamientos en 55 °C, 80 °C y 90 °C; vibración en 2.8 mm/s y 4.5 mm/s. La base ya creada se recrea con el volumen, porque el agregado continuo no se altera en el sitio.

Comprobación: la vibración pasa a aviso y a alarma, el `bad` de 25 mm/s no mueve la condición, y la temperatura de rodamientos se queda en su banda.

### Lo que no es una fase

Una bomba, un conveyor u OPC UA pedido por un cliente es un perfil nuevo. OPC UA entra como adaptador de ese cliente, no como parte del producto.

## Consecuencias

- Quien levante el stack hoy ve la bomba, el compresor y la presión. La pestaña OPC UA ya no está. La bomba y el compresor siguen siendo el laboratorio, no el alcance de arriba.
- Los textos de Modbus, condición, registro, historial y rechazos describen ese código hasta que la fase correspondiente los alcance.
- La frontera del broker, el tópico, el registro, la condición por promedio de un minuto y el historial de un minuto se quedan. La fase 3 cambia la forma de la fila, no esa frontera.
