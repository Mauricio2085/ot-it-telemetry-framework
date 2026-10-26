# Salud de activos críticos

[English](README.md)

El producto monitorea un motor mecánico crítico: temperatura de rodamientos y vibración, leídas por Modbus TCP. La presión, la bomba, el compresor y OPC UA quedan fuera. OPC UA sigue siendo un estándar OT de un cliente, no del producto.

El código de este repositorio sigue siendo el laboratorio del que salió, sin OPC UA, la bomba y el compresor. La presión sigue en el contrato ancho. La decisión, de dónde viene y las fases están en [docs/adr-scope.md](docs/adr-scope.md).

## De dónde viene

El árbol parte de [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). Se adoptan dos decisiones del laboratorio, tal como quedaron escritas:

- **OT e IT solo se encuentran en el broker**, en `plant/area/asset/telemetry`: [docs/adr-ot-it.md](docs/adr-ot-it.md), aceptada el 2026-10-24.
- **Las señales siguen el modo de falla**, y el destino es una fila por señal con su calidad. La tabla sigue ancha hasta esa migración: [docs/adr-measurements.md](docs/adr-measurements.md), aceptada el 2026-10-22.

Las palabras `good`, `uncertain` y `bad` salen del modelo de estado de OPC UA de ese laboratorio. Se queda el vocabulario. No el protocolo.

## Fases

Cada fase es un cambio de código posterior. Las fases 1 y 2 están hechas. La fase 3 no.

1. Quitar OPC UA. Hecha: salieron la pestaña de ingesta, el paquete de Node-RED, `OPCUA_ENDPOINT` y la guía de Prosys. Modbus y el contrato ancho siguen.
2. Dejar solo `critical-motor-01`. Hecha: salieron `mqtt-simulator`, la bomba y el compresor. El contrato ancho sigue durante esta fase.
3. Guardar el perfil del motor en filas: `bearing_temperature` y `vibration`, una fila por señal, en el mapa Modbus HR0, HR1 y HR2. El detalle está en [docs/adr-scope.md](docs/adr-scope.md).

## Arranque

Hace falta Docker.

```bash
cp .env.example .env
docker compose up -d --build
```

Cambia las contraseñas de `.env` antes de usar el stack fuera de esta máquina.

Grafana queda en `http://localhost:3001`, dashboard **Asset Health**. Los editores de Node-RED piden usuario en `http://localhost:1881` y `http://localhost:1882`.

La arquitectura, los puertos y el contrato del código actual —el motor, con el contrato ancho— están en el [README en inglés](README.md).
