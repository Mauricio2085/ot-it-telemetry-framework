# Modbus TCP

[Español](modbus-tcp.md)

This map is the one in the code today: bearing temperature, vibration, and the device status. The decision is in [adr-scope.en.md](adr-scope.en.md).

`modbus-slave` is the OT source in this lab. It is a Modbus TCP server that exposes three holding registers for `critical-motor-01`: two readings and a device status. The map itself is [`profiles/critical-motor-01.json`](../profiles/critical-motor-01.json). `node-red-ingestion` reads every `*.json` file in `profiles/`, polls that file's registers, scales each signal, translates the quality register into the contract vocabulary, and publishes the telemetry JSON. Another asset on this same Modbus host is another file. Restart `node-red-ingestion` when the map changes. The file also carries the type, the criticality, the unit, the nominal, and the limits. `node-red-etl` writes them into `assets` and `asset_limits` when the database answers; that change needs an ETL restart. See [adr-registry.en.md](adr-registry.en.md).

The asset is a motor, not a "Modbus pump". The `asset_id` names the equipment; Modbus is only how its readings reach the edge.

## Register map

| Register | Signal | Scaling | Example |
| --- | --- | --- | --- |
| HR0 | bearing_temperature | value / 10 | `550` → `55.0` °C |
| HR1 | vibration | value / 100 | `80` → `0.80` mm/s RMS |
| HR2 | device status | `0` good, `1` uncertain, `2` bad | `0` → `good` |

- Unit id: `1`
- Container port: `502`
- Host port: `1502` (`localhost:1502` from the host)
- Nominal point: ~55 °C, ~0.8 mm/s
- Soft noise is a slow sine drift plus small jitter

## Unbalance scenario

The motor repeats a 13-minute cycle that simulates a progressive rotor unbalance:

| Minutes | Phase in the log | Vibration |
| --- | --- | --- |
| 0–3 | `normal` | ~0.8 mm/s |
| 1:00–1:30 | `sensor-fault` | the transmitter fails: HR1 saturates at 25.00 mm/s and HR2 is `2` (bad) |
| 3–10 | `unbalance-ramp` | rises on a curve; crosses 2.8 near minute 7.8 and 4.5 near minute 9.6 |
| 10–13 | `alarm-hold` | ~5.0 mm/s, sustained |
| 13 | maintenance | the rotor is balanced, vibration returns to ~0.8 and the cycle repeats |

The ramp is quadratic: it starts slow and accelerates, like the P-F curve of a real failure. Bearing temperature rises by at most 1.5 °C. Only vibration moving points to a mechanical cause. With overall vibration alone, the pattern is *consistent with* unbalance; confirming it would take a vibration spectrum.

Reference thresholds, based on ISO 10816-3 for medium machines on rigid foundations: **warning at 2.8 mm/s** (zone B/C limit) and **alarm at 4.5 mm/s** (zone C/D limit). Exact limits depend on each machine's size and mounting.

### Sensor fault

During the normal phase the vibration transmitter fails for 30 seconds. A broken 4–20 mA loop drives the reading to the top of the sensor range (NAMUR NE43 treats a current above 21 mA as a failure), so HR1 reads 25.00 mm/s, five times the alarm limit. The device flags it by setting HR2 to `2`. Bearing temperature stays near 55 °C: the instrument failed, not the motor. The slave has one status, so both signals leave as `bad`.

The readings are stored with `quality = bad`, but `asset_condition` leaves them out of the averages, so the motor stays `normal` instead of raising a false alarm. The dashboard shows a gap in the vibration trend and notes the discarded readings on the motor tile. See [asset-condition.en.md](asset-condition.en.md#data-quality).

To start the cycle from minute 0, for example at the beginning of a demo:

```bash
docker compose restart modbus-slave
```

## MQTT contract

Topic: `plant-01/area-01/critical-motor-01/telemetry` (QoS 1)

```json
{
  "asset_id": "critical-motor-01",
  "ts": "2026-10-16T15:00:00.000Z",
  "signals": [
    { "name": "bearing_temperature", "value": 55.0, "quality": "good" },
    { "name": "vibration", "value": 0.8, "quality": "good" }
  ]
}
```

The `asset_id` in the payload must match the asset segment of the topic, or the ETL rejects the message.

`quality` comes from the profile's quality register. For this motor that register is HR2, and the same quality is copied onto both signals. The device decides it, and Node-RED translates the device code with the profile's `codes`: `0` → `good`, `1` → `uncertain`, `2` → `bad`. A code that is not in `codes` becomes `unknown` (`bad` here), because the edge cannot vouch for a reading whose status it does not understand.

## Check

1. `docker compose up -d --build`
2. From the host, a Modbus TCP client against `localhost:1502`, unit `1`, can read holding registers 0–2.
3. In the ingestion editor (`http://localhost:1881`), the **Modbus TCP Ingestion** tab is enabled and **Read holding registers** shows activity every 5 seconds.
4. An MQTT read of `plant-01/area-01/critical-motor-01/telemetry` returns the JSON above.
5. Grafana **Asset Health** lists `critical-motor-01`.
6. One minute after `docker compose restart modbus-slave`, six motor readings arrive with `vibration = 25` and `quality = bad`, and the motor tile stays `NORMAL` with "6 bad readings discarded".

If step 3 fails, confirm `modbus-slave` is healthy and that Node-RED finished installing `node-red-contrib-modbus` (first start can take a minute).

### Reconnecting after the slave stops

`node-red-contrib-modbus` 5.45.2 retries a TCP failure when the error code is in its list (`ECONNREFUSED`, `ETIMEDOUT`, and the rest of that list). Stopping `modbus-slave` with `docker compose stop` removes the name `modbus-slave`. The next connect gets `ENOTFOUND`, which is not in that list, so the client used to stay in its initial state.

Ingestion adds `ENOTFOUND` and `EAI_AGAIN` to the list when Node-RED starts. The client then uses its own retry, every `reconnectTimeout` (2 seconds). While the slave is stopped the motor goes `stale`. When the slave is back, the next successful poll publishes again. Restarting `node-red-ingestion` is not required.

A restart of `modbus-slave` that returns within a couple of seconds already recovered before this change, because the name never stayed missing long enough.

## RTU (horizon)

The same register map and scaling would apply over Modbus RTU (`/dev/ttyUSB0`, baud, parity, stop bits). This stack does not implement RTU yet: no serial device is mounted into Compose, and there is no RTU client tab in Node-RED. When a USB adapter is available, the ingestion client type would switch from TCP to serial; the MQTT contract would stay the same.
