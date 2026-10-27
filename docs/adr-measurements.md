# Mediciones anchas y estrechas

[English](adr-measurements.en.md)

Estado: aceptada. 2026-10-22. El alcance del producto está en [adr-scope.md](adr-scope.md). La fase 3 está hecha: `sensor_readings` guarda una fila por señal y el tablero muestra las dos tendencias del perfil. Este texto es la decisión del laboratorio.

## Contexto

Cada lectura es una fila de `sensor_readings`. Las tres señales viven en columnas porque el laboratorio nació de un solo mensaje MQTT: tres números y una calidad. Con eso, la condición, el margen consumido, la calidad y `stale` se calcularon nombrando columnas, y cada tendencia de Grafana es una consulta por señal. El ETL, el SQL y el tablero no pivotan datos.

| Columna | Contenido |
| --- | --- |
| `time` | `ts` del mensaje |
| `plant`, `area` | Planta y área del tópico, después de coincidir con `assets` |
| `asset_id` | Activo |
| `temperature`, `pressure`, `vibration` | Tres señales fijas |
| `quality` | Un valor para las tres |

`asset_limits` ya es estrecha: una fila por `asset_id` y `signal`, con unidad y umbrales. `assets` guarda planta, área, tipo y criticidad.

El modelo ancho se queda corto en cuatro sitios:

- `critical-motor-01` guarda `pressure` y no tiene fila de umbral para esa señal. Una columna fija no sigue el modo de falla: un motor no tiene presión de proceso que evaluar.
- `quality` es una por mensaje. Cuando el transmisor de vibración del motor marca `bad`, la temperatura y la presión de esa lectura también quedan `bad`.
- Una señal nueva pide cambiar `sensor_readings`, `sensor_readings_1m`, `asset_condition` y los paneles.
- El join con `asset_limits` tiene que nombrar la columna (`vibration`, `temperature` o `pressure`).

## Decisión

El destino es una fila por activo, señal y tiempo.

| Columna | Contenido |
| --- | --- |
| `time` | Instante de la medición |
| `asset_id` | Activo |
| `signal` | Nombre de la señal, el mismo que `asset_limits.signal` |
| `value` | El número |
| `quality` | Calidad de esa señal |

Planta y área siguen en `assets`. Unidad y umbrales siguen en `asset_limits`.

`sensor_readings` sigue siendo el almacén. Las tablas, los flujos y el tablero quedan como están.

Ese JSON ancho es el contrato v1 del laboratorio. No lleva campo de versión:

```json
{
  "asset_id": "critical-pump-01",
  "ts": "2026-10-15T21:00:00.000Z",
  "temperature": 70.2,
  "pressure": 2.4,
  "vibration": 1.1,
  "quality": "good"
}
```

El flujo publica el contrato v2, en `contracts/telemetry-v2.schema.json`: `asset_id`, `ts` y `signals`, cada una con nombre, valor y calidad. `sensor_readings` guarda una fila por señal.

## Consecuencias

- El demo, `sensor_readings_1m`, `asset_condition` y el tablero agrupan por señal. El tablero muestra las dos tendencias del perfil.
- Este esclavo tiene un solo estado, así que las dos señales salen con la misma calidad. La fila guarda la calidad de esa señal.
- Una señal nueva entra con su fila en `asset_limits`. El nombre ya no está cerrado por un `CHECK`. Aparece en la condición y en la tabla de detalle. Su tendencia es un panel del perfil que la traiga.
- La migración de la tabla, del agregado y de la condición está hecha. El relleno del historial no: la base ya creada se recrea con el volumen.
- v2 es el mensaje que publica el flujo. `sensor_readings` guarda una fila por señal.
