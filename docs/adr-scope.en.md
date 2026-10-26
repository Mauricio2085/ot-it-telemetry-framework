# Product scope

[Español](adr-scope.md)

Status: accepted. 2026-10-25.

This decision does not change the code. The tree stays the lab until the phases below are implemented.

## Where it comes from

This repository starts from [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). The code in the tree is that lab: three simulated assets, three fixed signals, and an optional OPC UA path.

This product adopts two decisions from that lab, as they were written:

| Decision | Text | What is adopted |
| --- | --- | --- |
| OT/IT boundary and topic | [adr-ot-it.en.md](adr-ot-it.en.md), accepted 2026-10-24 | OT and IT meet only at the broker. The topic is `plant/area/asset/telemetry`. |
| Measurements | [adr-measurements.en.md](adr-measurements.en.md), accepted 2026-10-22 | Signals follow the failure mode. The target is one row per signal, with its own quality. While the wide contract is in force, the table stays in columns. |

Those two decisions stand. This text narrows which asset and which signals they apply to.

## Decision

The product monitors one critical mechanical motor: `critical-motor-01`.

The signals are bearing temperature and vibration. Pressure is out: a mechanical-only motor has no process pressure to measure. The lab pump and compressor are out.

The reading comes in over Modbus TCP. The slave exposes holding registers, Node-RED scales them, and publishes the JSON to MQTT. OPC UA is not part of the product: it is one client's OT standard, not the product's.

The three quality words stay: `good`, `uncertain`, and `bad`. They came from the OPC UA status model in the lab. The vocabulary is adopted. The protocol is not.

Bearing-temperature limits, until a datasheet replaces them, are the ones the lab already used for that motor's temperature: nominal 55 °C, warning 80 °C, alarm 90 °C. Vibration stays at 2.8 mm/s and 4.5 mm/s (ISO 10816-3).

## Phases

Each phase is a separate code change. None of them is done.

1. **Remove OPC UA.** The ingestion tab, `node-red-contrib-opcua`, `OPCUA_ENDPOINT`, and the Prosys guide. Modbus stays.
2. **Keep only the motor.** `mqtt-simulator`, `critical-pump-01`, and `critical-compressor-01` leave the compose file, the registry, the limits, and the demo script. The pump's `uncertain` episode leaves with the pump. The motor unbalance and the vibration-transmitter failure stay: they are the reference case.
3. **Keep two signals.** The contract, the database, the ETL, the Modbus map, and the dashboard become `bearing_temperature` and `vibration`. `pressure` goes. The `temperature` field is renamed to `bearing_temperature`. The product register map is: HR0 bearing temperature × 10, HR1 vibration × 100, HR2 device status (`0` good, `1` uncertain, `2` bad). The code today still has pressure on HR1 and status on HR3.
4. **One row per signal.** After phase 3, the migration to one row per signal and contract v2 with a quality per signal. That remains the decision in [adr-measurements.en.md](adr-measurements.en.md). It is not mixed into phases 1 to 3.

## Consequences

- Anyone who starts the stack today still sees the pump, the compressor, pressure, and the OPC UA tab. That is the lab, not the scope above.
- The Modbus, condition, registry, history, and rejection texts describe that code. The product map and signals are phase 3.
- The broker boundary, the topic, the registry, the one-minute condition, and the one-minute history stay. Phase 4 changes the shape of the row, not that boundary.
