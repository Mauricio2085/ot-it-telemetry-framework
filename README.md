[Español](README.es.md)

This product monitors one critical mechanical motor: bearing temperature and vibration, read over Modbus TCP. Pressure, the pump, the compressor, and OPC UA are outside that scope. OPC UA stays a client's OT standard, not part of the product.

The code in this repository is still the lab it was copied from, without OPC UA, the pump, and the compressor. The slave publishes bearing temperature and vibration, and each signal is one row. The decision, where it comes from, and the phases are in [docs/adr-scope.en.md](docs/adr-scope.en.md) ([español](docs/adr-scope.md)).

## Where it comes from

The tree starts from [iiot-asset-health-stack](https://github.com/Mauricio2085/iiot-asset-health-stack). Two lab decisions are adopted as written:

- **OT and IT meet only at the broker**, on `plant/area/asset/telemetry`: [docs/adr-ot-it.en.md](docs/adr-ot-it.en.md) ([español](docs/adr-ot-it.md)), accepted 2026-10-24.
- **Signals follow the failure mode**, and each signal is one row with its own quality: [docs/adr-measurements.en.md](docs/adr-measurements.en.md) ([español](docs/adr-measurements.md)), accepted 2026-10-22.

The quality words `good`, `uncertain`, and `bad` come from the OPC UA status model in that lab. The vocabulary stays. The protocol does not.

## Phases

Each phase is a later code change. Phases 1, 2, and 3 are done.

1. Remove OPC UA. Done: the ingestion tab, the Node-RED package, `OPCUA_ENDPOINT`, and the Prosys guide are gone. Modbus and the wide contract stay.
2. Keep only `critical-motor-01`. Done: `mqtt-simulator`, the pump, and the compressor are gone. The wide contract stays through this phase.
3. Store the motor profile as rows. Done: the message carries `signals`, `sensor_readings` stores one row per signal, and the dashboard shows bearing temperature and vibration. The detail is in [docs/adr-scope.en.md](docs/adr-scope.en.md).

## Current code

The sections below describe the code in the tree: one motor, the signal-list message, and one row per signal.

End-to-end industrial telemetry pipeline for critical asset health monitoring. `critical-motor-01` publishes bearing temperature and vibration. The stack ingests those signals, checks the payload, stores them as a time series, and charts them.

### OT source

| Source | Role | Asset | Default |
| --- | --- | --- | --- |
| `modbus-slave` + Node-RED Modbus tab | Modbus TCP holding registers → scaled JSON → MQTT | `critical-motor-01` | On |

`asset_id` names the equipment. Modbus is only how its readings reach the edge.

| Asset | Nominal bearing temperature | Nominal vibration |
| --- | --- | --- |
| `critical-motor-01` | ~55 °C | ~0.8 mm/s |

Vibration is velocity in mm/s RMS. Reference thresholds follow ISO 10816-3 for medium machines on rigid foundations: warning at 2.8 mm/s, alarm at 4.5 mm/s.

### Demo scenario: motor unbalance

`critical-motor-01` repeats a 13-minute cycle: 3 minutes of normal operation, a progressive unbalance that crosses warning near minute 7.8 and alarm near minute 9.6, 3 minutes of sustained alarm, then a simulated rotor balancing that brings it back to normal. Bearing temperature barely moves, which points to a mechanical cause.

Run `docker compose restart modbus-slave` to start the cycle from minute 0. Details: [docs/modbus-tcp.en.md](docs/modbus-tcp.en.md#unbalance-scenario).

One data-quality episode runs alongside it. At minute 1 of each motor cycle the vibration transmitter fails for 30 seconds: the reading saturates at 25 mm/s and the device flags it as `bad`. The stack keeps those readings in history but leaves them out of the condition, so the motor stays `normal` instead of raising a false alarm.

`scripts/demo-prep.sh` restarts the motor so that warning and alarm fall inside the dashboard window.

### Asset condition

TimescaleDB holds the engineering limits of each asset in `asset_limits` and exposes the `asset_condition` view: one row per asset with `normal`, `warning`, `alarm`, or `stale`. Each signal is judged on its 1-minute average, the asset takes the worst state of its signals, and an asset with no usable readings in the last minute is `stale`. Readings with `quality = bad` are left out of the averages; `uncertain` ones are used and counted.

```bash
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT asset_id, condition, vibration_avg, data_quality, bad_1m, last_seen FROM asset_condition;"'
```

During the motor scenario, `critical-motor-01` moves from `normal` to `warning` and `alarm`, then back after maintenance. Limits, rules, margin used, and how to change a threshold: [docs/asset-condition.en.md](docs/asset-condition.en.md).

### History

Timescale keeps two layers. `sensor_readings` holds every 5-second point, one row per signal. `sensor_readings_1m` holds one clock minute per asset and signal: the average of the readings that are not `bad`, plus how many readings arrived and how many were `uncertain` or `bad`. The live condition and the 15-minute dashboard keep reading the raw table. The aggregate is the layer that remains after a raw point ages out.

Chunks older than one day are compressed. Raw chunks older than seven days are dropped; the minute rows stay. Policies, the refresh window, and the queries: [docs/readings-history.en.md](docs/readings-history.en.md).

### Dashboard

**Asset Health** in Grafana reads top to bottom, one question per band:

1. **Is the edge alive?** Readings stored in the last minute, rejections in the last 15 minutes, the age of the newest reading, and how many accepted readings are waiting in the queue. With the motor publishing every 5 seconds a healthy minute holds 11 or 12 readings. The rate turns amber below 10, a rejection count turns amber at 1, the lag turns amber at 15 seconds, and the queue turns amber at 1.
2. **What needs attention?** Counters of assets in alarm, in warning, and without data, then one tile per asset with its condition, the margin used, and the signal behind it ("87 % of margin used · vibration"). When readings are doubtful or discarded, the tile adds a note such as "6 bad readings discarded".
3. **Why, and where is it heading?** Vibration and bearing temperature, one panel each. Warning (amber) and alarm (red) limits are dashed lines read from `asset_limits`, so changing a limit in the database moves the line. Trends leave out `bad` readings and break the line when readings are missing for more than 15 seconds. A signal that is not part of this profile shows up in the condition and in the detail table; its trend is a panel added with that profile.
4. **Detail.** A table of `asset_condition`, one row per signal: the 1-minute average, condition, margin used, data availability, data quality with the uncertain and discarded readings, and the time of the last reading.

Colors follow ISA-101 for high-performance HMIs: `normal` is gray, and color is kept for abnormal states (amber warning, red alarm, purple no data or doubtful data). With every asset healthy the screen has no color at all.

The dashboard is provisioned from `grafana/dashboards/asset-health.json` and cannot be saved from the Grafana UI. Edit the file instead; Grafana reloads it within about 10 seconds, and the browser shows the change after a page refresh. Rows and tiles repeat over the assets in `asset_limits`, so a new asset shows up without editing the JSON.

Reference: [docs/adr-scope.en.md](docs/adr-scope.en.md) ([español](docs/adr-scope.md)), [docs/adr-ot-it.en.md](docs/adr-ot-it.en.md) ([español](docs/adr-ot-it.md)), [docs/adr-measurements.en.md](docs/adr-measurements.en.md) ([español](docs/adr-measurements.md)), [docs/adr-registry.en.md](docs/adr-registry.en.md) ([español](docs/adr-registry.md)), [docs/adr-image.en.md](docs/adr-image.en.md) ([español](docs/adr-image.md)), [docs/modbus-tcp.en.md](docs/modbus-tcp.en.md) ([español](docs/modbus-tcp.md)), [docs/asset-condition.en.md](docs/asset-condition.en.md) ([español](docs/asset-condition.md)), [docs/asset-registry.en.md](docs/asset-registry.en.md) ([español](docs/asset-registry.md)), [docs/readings-history.en.md](docs/readings-history.en.md) ([español](docs/readings-history.md)), [docs/rejected-messages.en.md](docs/rejected-messages.en.md) ([español](docs/rejected-messages.md)).

### Pipeline

```text
modbus-slave ──► Node-RED (Modbus TCP) ──► Mosquitto
                                              │  +/+/+/telemetry
                                              ▼
                                         Node-RED ETL
                                              │  validate, then insert
                                              ▼
                                         TimescaleDB
                                              │
                                              ▼
                                           Grafana
```

`ot-net` holds the Modbus slave and the ingestion editor. `it-net` holds the ETL, TimescaleDB, and Grafana. Mosquitto is attached to both, so a reading crosses only as an MQTT message. A name on the other network does not resolve. Each Node-RED also prohibits the other Docker subnets, so a guessed IP is refused. TimescaleDB is published only on `127.0.0.1:5435`, so another machine on the LAN cannot open it. Grafana and the ETL use the name `timescaledb` on `it-net`.

### Services

| Service | Image / build | Host port |
| --- | --- | --- |
| Mosquitto | `eclipse-mosquitto:2.0.22` | 1883 |
| modbus-slave | `./modbus-slave` | 1502 |
| Node-RED ingestion | `edge-node-red-ingestion:4.0.9` | 1881 |
| Node-RED ETL | `edge-node-red-etl:4.0.9` | 1882 |
| TimescaleDB | `timescale/timescaledb:2.30.2-pg17` | 127.0.0.1:5435 |
| Grafana | `grafana/grafana-oss:12.0.4` | 3001 |

Grafana login comes from `GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD`. The dashboard is in the **IIoT** folder. The Node-RED editors at `http://localhost:1881` and `http://localhost:1882` ask for `NODE_RED_ADMIN_USER` and `NODE_RED_ADMIN_PASSWORD`. Node-RED hashes that password in memory when the editor starts.

### Quick start

Docker is required. The Modbus TCP path starts with the stack.

```bash
cp .env.example .env
docker compose up -d --build
```

Change the passwords in `.env` before using the stack outside this machine. The Node-RED images already contain their nodes. A start does not download them. See [docs/adr-image.en.md](docs/adr-image.en.md).

Services use `restart: on-failure`: Docker restarts a container that crashes, but does not start the stack when Docker itself starts. After a reboot, run `docker compose up -d` again. On Docker Desktop with WSL, containers started by Docker at boot can come up before the WSL files exist, with empty bind mounts: TimescaleDB fails to start and Grafana loads no dashboard.

Open Grafana at `http://localhost:3001` and select **Asset Health**. Within about a minute you should see the tile and the trend row for `critical-motor-01`.

### What the payload looks like

Every reading publishes QoS 1 JSON to `plant-01/area-01/<asset_id>/telemetry`. Clients connect with `MQTT_USER` and `MQTT_PASSWORD` from `.env`. Mosquitto refuses an anonymous connection. At start the broker writes the password file into its data volume, and each Node-RED writes `${MQTT_USER}` and `${MQTT_PASSWORD}` into its credential file. Neither file is committed.

```json
{
  "asset_id": "critical-motor-01",
  "ts": "2026-10-15T21:00:00.000Z",
  "signals": [
    { "name": "bearing_temperature", "value": 55.0, "quality": "good" },
    { "name": "vibration", "value": 0.8, "quality": "good" }
  ]
}
```

`quality` uses the OPC UA levels `good`, `uncertain`, and `bad`. The source decides it, the edge translates device codes into this vocabulary, and IT validates it. See [docs/asset-condition.en.md](docs/asset-condition.en.md#data-quality).

The ETL flow accepts the message only when `asset_id` matches the topic, `signals` is a non-empty list, each signal has a name, a finite value, and a quality, `ts` is a timestamp, and the asset is in the registry with the same plant and area as the topic. A signal with no `asset_limits` row is rejected. Each accepted signal is one `sensor_readings` row. Plant, area, type, and criticality live in `assets`: [docs/asset-registry.en.md](docs/asset-registry.en.md). A refused message is published to the MQTT topic `rejected` and stored in `rejected_messages`: [docs/rejected-messages.en.md](docs/rejected-messages.en.md).

On every push, GitHub Actions runs `scripts/check-contracts.py`, `scripts/check-profile.js`, `scripts/check-spool.js`, `scripts/check-reconnect.js`, and `scripts/check-image.js`. The v2 examples have to match [`contracts/telemetry-v2.schema.json`](contracts/telemetry-v2.schema.json), and [`grafana/dashboards/asset-health.json`](grafana/dashboards/asset-health.json) has to be the Asset Health dashboard on the `timescaledb` datasource. The profile check loads `profiles/`, scales a known register triple, and builds the registry payload. The spool check appends a row, acknowledges it, accepts a reading from a catalog copy, and expects the dashboard to read `queue_depth`. The reconnect check adds `ENOTFOUND` and `EAI_AGAIN` to the Modbus retry list. The image check expects both Node-RED images to install their nodes at build time, outside `/data`.

Modbus values arrive as integers in holding registers. The profile in [`profiles/`](profiles/) names the asset, the registers, the scale, the quality codes, and the limits. The motor profile multiplies HR0 by 0.1 and HR1 by 0.01; HR2 is the device status copied onto both signals. The ETL writes that asset and those limits when TimescaleDB answers. See [docs/modbus-tcp.en.md](docs/modbus-tcp.en.md) and [docs/adr-registry.en.md](docs/adr-registry.en.md).

### Current limits

- One motor in one plant and area. Its profile is `profiles/critical-motor-01.json`: the Modbus map, the type, the criticality, and the limits for `bearing_temperature` and `vibration`. Another asset on the same Modbus host is another file in `profiles/`. The ETL upserts `assets` and `asset_limits` from those files when TimescaleDB answers. The type check stays `motor`. See [docs/adr-registry.en.md](docs/adr-registry.en.md).
- The message carries one quality per signal. This slave has one device status, so both signals share it. A source that sets them apart is stored that way. See [docs/adr-measurements.en.md](docs/adr-measurements.en.md).
- An accepted reading waits in the ETL spool when TimescaleDB is down, and the same `INSERT` runs when it returns. The spool needs a catalog copy from an earlier successful lookup. A contract rejection is not spooled. The Asset Health pipeline shows how many readings are waiting; that number cannot move while TimescaleDB is down. See [docs/adr-spool.en.md](docs/adr-spool.en.md).
- Nothing sends notifications: a warning or alarm is only visible on the dashboard.
- Grafana 12.0.4 picks the Y-axis tick step on its own; there is no fixed step per panel.
- Dashboard trends read `sensor_readings`. A range older than seven days loses the line; the minute aggregate still has the summary.
- Database changes after the first start are applied by hand with `psql`; there is no migration tool.
- Modbus RTU is not implemented (serial / USB horizon only).

### Accepted direction

The running code stores one row per signal, so condition, margin used, quality, and `stale` are per signal. The product keeps these decisions:

- **Signals follow failure modes.** Reliability work starts from an FMEA per asset type, and ISO 17359 maps each failure mode to the parameters that detect it. The motor does not publish pressure.
- **Measurements are one row per signal.** One row per asset, signal, and time gives each signal its own quality, lets a new signal arrive without adding a column, and joins directly with the narrow `asset_limits` table. That is what `sensor_readings` stores. See [docs/adr-measurements.en.md](docs/adr-measurements.en.md).
- **Metadata stays in the asset registry.** Plant, area, type, and criticality live in `assets`. Units and limits stay on `asset_limits`. The motor profile is what writes those rows. A template of limits per asset type is still ahead.
- **The boundary is the broker.** OT and IT meet at Mosquitto, on the namespace `plant/area/asset/telemetry`. ISA-95 is the reference for that hierarchy. Sparkplug B defines typed metrics with quality, plus birth and death messages for a disconnected device. It stays named and unimplemented. See [docs/adr-ot-it.en.md](docs/adr-ot-it.en.md).
- **Rejections have a store.** Contract violations go to the MQTT topic `rejected` and to `rejected_messages`, one row per message with the reasons. An accepted reading that cannot be inserted waits in the ETL spool.

The code cut that applies this direction is in [docs/adr-scope.en.md](docs/adr-scope.en.md): OPC UA, the pump, and the compressor have left, and the motor profile is one row per signal.
