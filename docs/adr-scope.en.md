# Product scope

[Español](adr-scope.md)

Status: accepted. 2026-10-25.

Phase 1 and phase 2 are done. Stages 1 and 2 of phase 3 are done. The `sensor_readings` row stays wide until stage 3.

## Where it comes from

This repository starts from [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). The code in the tree came from that lab: three simulated assets and three fixed signals. The optional OPC UA path left in phase 1.

This product adopts two decisions from that lab, as they were written:

| Decision | Text | What is adopted |
| --- | --- | --- |
| OT/IT boundary and topic | [adr-ot-it.en.md](adr-ot-it.en.md), accepted 2026-10-24 | OT and IT meet only at the broker. The topic is `plant/area/asset/telemetry`. |
| Measurements | [adr-measurements.en.md](adr-measurements.en.md), accepted 2026-10-22 | Signals follow the failure mode. The target is one row per signal, with its own quality. This product applies that target in phase 3, and does not keep the wide contract as the framework schema. |

Those two decisions stand. The motor is the first profile, not the schema for every client.

## Decision

The product monitors one critical mechanical motor: `critical-motor-01`.

The signals are bearing temperature and vibration. Pressure is out: a mechanical-only motor has no process pressure to measure. The lab pump and compressor are out.

The reading comes in over Modbus TCP. The slave exposes holding registers, Node-RED scales them, and publishes the JSON to MQTT. OPC UA is not part of the product: it is one client's OT standard, not the product's.

The three quality words stay: `good`, `uncertain`, and `bad`. They came from the OPC UA status model in the lab. The vocabulary is adopted. The protocol is not.

Bearing-temperature limits, until a datasheet replaces them, are the ones the lab already used for that motor's temperature: nominal 55 °C, warning 80 °C, alarm 90 °C. Vibration stays at 2.8 mm/s and 4.5 mm/s (ISO 10816-3).

## Phases

Phases 1 and 2 are done. Stages 1 and 2 of phase 3 are done. Stages 3 and 4 are not. Each phase leaves the stack runnable and closes in its own commits. The framework row is asset, signal, value, quality, and time. Another asset is another profile: its type, its signals, its limits, and its field adapter. That does not migrate the table again.

### 1. Remove OPC UA

Done. The ingestion tab, `node-red-contrib-opcua`, `OPCUA_ENDPOINT`, and the Prosys guide are gone. Modbus, the simulator, and the wide contract stay.

Check: the ingestion flow has no OPC UA nodes, and the motor still publishes.

### 2. Keep only the motor

Done. `mqtt-simulator`, `critical-pump-01`, and `critical-compressor-01` left the compose file, the registry, the limits, and `scripts/demo-prep.sh`. The registry type is `motor`. The pump's `uncertain` episode left with the pump. The unbalance and the vibration-transmitter failure stay: they are the reference case.

The contract stays wide in this phase. The slave still publishes pressure. With one asset, a healthy minute holds 11 or 12 readings; the "readings / min" amber threshold moves from 30 to 10. A database created earlier does not drop old rows when the init scripts run: recreate the volume.

Check: `asset_condition` has one row, the motor, and the demo script no longer restarts the simulator.

### 3. Motor profile as rows

One phase, in four stages, so the two signals do not freeze as columns:

1. **Contract.** Done. The schema is `contracts/telemetry-v2.schema.json`. The message carries `asset_id`, `ts`, and `signals`; each signal carries a name, a value, and a quality. The profile example publishes `bearing_temperature` and `vibration` with the same quality. Another example carries different qualities and passes. A name that is not part of this profile also passes: the schema does not close it. The wide message no longer passes the check. Check: `scripts/check-contracts.py` accepts the profile, the split qualities, and the open name, and rejects the wide message.
2. **Edge.** Done. HR0 is bearing temperature × 10, HR1 is vibration × 100, and HR2 is the status (`0` good, `1` uncertain, `2` bad). The slave no longer publishes pressure. The ETL splits the signals and rejects one with no `asset_limits` row. The table stays wide, with one index per asset and time, so accepted signals fold into that row: `bearing_temperature` lands in the `temperature` column. If the accepted signals do not share one quality, the whole message is rejected. One table row per signal is stage 3. Check: the topic carries both signals, a signal outside `asset_limits` lands in `rejected_messages`, and `sensor_readings` still receives one row per instant.
3. **Database.** `sensor_readings` stores `time`, `asset_id`, `signal`, `value`, and `quality`. Plant and area stay on `assets`. `asset_limits` is the signal catalog: the `CHECK` no longer closes the signal names. Condition and the one-minute aggregate group by signal. "Readings / min" counts timestamps, not rows, and stays at 11 or 12.
4. **Dashboard.** Two trends, bearing temperature and vibration, with limits read from `asset_limits`. The detail table is one row per signal. A new signal shows up in the condition and in that table without a schema change. Its trend is a panel that belongs to the profile which brings it.

The limits do not change: bearing temperature at 55 °C, 80 °C, and 90 °C; vibration at 2.8 mm/s and 4.5 mm/s. A database created earlier is recreated with the volume, because the continuous aggregate cannot be altered in place.

Check: vibration moves through warning and alarm, the 25 mm/s `bad` reading does not move the condition, and bearing temperature stays inside its band.

### Not a phase

A pump, a conveyor, or OPC UA asked for by a client is a new profile. OPC UA arrives as that client's adapter, not as part of the product.

## Consequences

- Anyone who starts the stack today sees the motor, without pressure. The pump, the compressor, and the OPC UA tab are gone. The published message is already the signal list. `sensor_readings` stays wide.
- The Modbus, condition, registry, history, and rejection texts describe that code until the phase that replaces them.
- The broker boundary, the topic, the registry, the one-minute condition, and the one-minute history stay. Phase 3 changes the shape of the row, not that boundary.
