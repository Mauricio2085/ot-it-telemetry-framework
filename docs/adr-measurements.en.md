# Wide and narrow measurements

[Español](adr-measurements.md)

Status: accepted. 2026-10-22. The product scope is in [adr-scope.en.md](adr-scope.en.md). Stages 1, 2, and 3 of phase 3 are done: `sensor_readings` stores one row per signal. This text is the lab decision.

## Context

Each reading is one row of `sensor_readings`. The three signals live in columns because the lab started from a single MQTT message: three numbers and one quality. Condition, margin used, quality, and `stale` were calculated by naming columns, and each Grafana trend is one query per signal. The ETL, the SQL, and the dashboard do not pivot data.

| Column | Contents |
| --- | --- |
| `time` | Message `ts` |
| `plant`, `area` | Topic plant and area, after they match `assets` |
| `asset_id` | Asset |
| `temperature`, `pressure`, `vibration` | Three fixed signals |
| `quality` | One value for all three |

`asset_limits` is already narrow: one row per `asset_id` and `signal`, with its unit and limits. `assets` holds plant, area, type, and criticality.

The wide model stops short in four places:

- `critical-motor-01` stores `pressure` and has no limits row for that signal. A fixed column does not follow the failure mode: a motor has no process pressure to evaluate.
- `quality` is one value per message. When the motor's vibration transmitter reports `bad`, the temperature and pressure of that reading are `bad` too.
- A new signal means changing `sensor_readings`, `sensor_readings_1m`, `asset_condition`, and the panels.
- The join to `asset_limits` has to name the column (`vibration`, `temperature`, or `pressure`).

## Decision

The target is one row per asset, signal, and time.

| Column | Contents |
| --- | --- |
| `time` | Instant of the measurement |
| `asset_id` | Asset |
| `signal` | Signal name, the same value as `asset_limits.signal` |
| `value` | The number |
| `quality` | Quality of that signal |

Plant and area stay in `assets`. Units and limits stay in `asset_limits`.

`sensor_readings` stays the store. Tables, flows, and the dashboard stay as they are.

That wide JSON is the lab's contract v1. It has no version field:

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

The flow publishes contract v2, in `contracts/telemetry-v2.schema.json`: `asset_id`, `ts`, and `signals`, each with a name, a value, and a quality. `sensor_readings` stores one row per signal.

## Consequences

- The demo, `sensor_readings_1m`, and `asset_condition` group by signal. The dashboard still has the pressure panel, empty, until stage 4.
- This slave has one status, so both signals leave with the same quality. The row stores that signal's quality.
- A new signal arrives with its `asset_limits` row. The name is no longer closed by a `CHECK`. Its trend is a panel of the profile, in stage 4.
- The table, aggregate, and condition migration is done. History backfill is not: a database created earlier is recreated with the volume.
- v2 is the message the flow publishes. `sensor_readings` stores one row per signal.
