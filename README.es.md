# Salud de activos críticos

[English](README.md)

El producto monitorea un motor mecánico crítico: temperatura de rodamientos y vibración, leídas por Modbus TCP. La presión, la bomba, el compresor y OPC UA quedan fuera. OPC UA sigue siendo un estándar OT de un cliente, no del producto.

El código de este repositorio sigue siendo el laboratorio del que salió. El recorte todavía no está aplicado. La decisión, de dónde viene y las fases están en [docs/adr-scope.md](docs/adr-scope.md).

## De dónde viene

El árbol parte de [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). Se adoptan dos decisiones del laboratorio, tal como quedaron escritas:

- **OT e IT solo se encuentran en el broker**, en `plant/area/asset/telemetry`: [docs/adr-ot-it.md](docs/adr-ot-it.md), aceptada el 2026-10-24.
- **Las señales siguen el modo de falla**, y el destino es una fila por señal con su calidad. La tabla sigue ancha hasta esa migración: [docs/adr-measurements.md](docs/adr-measurements.md), aceptada el 2026-10-22.

Las palabras `good`, `uncertain` y `bad` salen del modelo de estado de OPC UA de ese laboratorio. Se queda el vocabulario. No el protocolo.

## Fases

Cada fase es un cambio de código posterior. Ninguna está hecha.

1. Quitar OPC UA: la pestaña de ingesta, el paquete de Node-RED, `OPCUA_ENDPOINT` y la guía de Prosys.
2. Dejar solo `critical-motor-01`. Salen `mqtt-simulator`, la bomba y el compresor.
3. Dejar dos señales: `bearing_temperature` y `vibration`. Sale `pressure` y `temperature` cambia de nombre. El mapa del producto es HR0 temperatura de rodamientos, HR1 vibración, HR2 estado del equipo.
4. Una fila por señal, y el contrato v2 con una calidad por señal. Sigue siendo la decisión de mediciones, después de la fase 3.

## Arranque

Hace falta Docker.

```bash
cp .env.example .env
docker compose up -d --build
```

Cambia las contraseñas de `.env` antes de usar el stack fuera de esta máquina.

Grafana queda en `http://localhost:3001`, dashboard **Asset Health**. Los editores de Node-RED piden usuario en `http://localhost:1881` y `http://localhost:1882`.

La arquitectura, los puertos y el contrato del código actual —el laboratorio, todavía sin recortar— están en el [README en inglés](README.md).
