# Alcance del producto

[English](adr-scope.en.md)

Estado: aceptada. 2026-10-25.

Esta decisión no cambia el código. El árbol sigue siendo el laboratorio hasta que las fases de abajo se implementen.

## De dónde viene

Este repositorio parte de [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). El código que está en el árbol es ese laboratorio: tres activos simulados, tres señales fijas y un camino opcional de OPC UA.

De ese laboratorio este producto adopta dos decisiones, tal como quedaron escritas:

| Decisión | Texto | Qué se adopta |
| --- | --- | --- |
| Frontera OT/IT y tópico | [adr-ot-it.md](adr-ot-it.md), aceptada el 2026-10-24 | OT e IT solo se encuentran en el broker. El tópico es `plant/area/asset/telemetry`. |
| Mediciones | [adr-measurements.md](adr-measurements.md), aceptada el 2026-10-22 | Las señales siguen el modo de falla. El destino es una fila por señal, con su calidad. Mientras el contrato ancho siga vigente, la tabla sigue en columnas. |

Esas dos decisiones se mantienen. Este texto acota a qué activo y a qué señales se aplican.

## Decisión

El producto monitorea un motor mecánico crítico: `critical-motor-01`.

Las señales son temperatura de rodamientos y vibración. La presión no entra: un motor solo mecánico no tiene presión de proceso que medir. La bomba y el compresor del laboratorio quedan fuera.

La lectura entra por Modbus TCP. El esclavo expone holding registers, Node-RED los escala y publica el JSON en MQTT. OPC UA no forma parte del producto: es un estándar OT de un cliente concreto, no del producto.

Las tres palabras de calidad se quedan: `good`, `uncertain` y `bad`. Salieron del modelo de estado de OPC UA en el laboratorio. Se adopta el vocabulario. No se adopta el protocolo.

Los límites de la temperatura de rodamientos, hasta que una hoja de datos los reemplace, son los que el laboratorio ya tenía para la temperatura de ese motor: nominal 55 °C, aviso 80 °C, alarma 90 °C. La vibración sigue en 2.8 mm/s y 4.5 mm/s (ISO 10816-3).

## Fases

Cada fase es un cambio de código aparte. Ninguna está hecha.

1. **Quitar OPC UA.** La pestaña de ingesta, `node-red-contrib-opcua`, `OPCUA_ENDPOINT` y la guía de Prosys. Modbus se queda.
2. **Dejar solo el motor.** Salen `mqtt-simulator`, `critical-pump-01` y `critical-compressor-01` del compose, del registro, de los límites y del script de demo. El episodio `uncertain` de la bomba sale con la bomba. El desbalance del motor y la falla del transmisor de vibración se quedan: son el caso de referencia.
3. **Dejar dos señales.** El contrato, la base, el ETL, el mapa Modbus y el tablero pasan a `bearing_temperature` y `vibration`. Sale `pressure`. El campo `temperature` pasa a llamarse `bearing_temperature`. El mapa de registros del producto queda así: HR0 temperatura de rodamientos × 10, HR1 vibración × 100, HR2 estado del equipo (`0` good, `1` uncertain, `2` bad). Hoy el código todavía tiene la presión en HR1 y el estado en HR3.
4. **Medición por señal.** Después de la fase 3, la migración a una fila por señal y el contrato v2 con una calidad por señal. Sigue siendo la decisión de [adr-measurements.md](adr-measurements.md). No se mezcla con las fases 1 a 3.

## Consecuencias

- Quien levante el stack hoy ve la bomba, el compresor, la presión y la pestaña OPC UA. Eso es el laboratorio, no el alcance de arriba.
- Los textos de Modbus, condición, registro, historial y rechazos describen ese código. El mapa y las señales del producto son los de la fase 3.
- La frontera del broker, el tópico, el registro, la condición por promedio de un minuto y el historial de un minuto se quedan. La fase 4 cambia la forma de la fila, no esa frontera.
