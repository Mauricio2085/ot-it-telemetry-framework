# ETL spool

[Español](adr-spool.md)

Status: accepted. 2026-10-28.

## Context

The ETL subscribes with a clean MQTT session and acknowledges a reading before the insert finishes. Mosquitto can survive its own restart. It does not keep a reading whose insert into TimescaleDB failed.

`Look up asset` and `Look up limits` also need TimescaleDB. While the database is down, a reading never becomes an accepted row, so there is nothing to retry.

## Decision

The spool lives on the ETL, in the `etl_spool` volume. It stores two files.

`catalog.json` is the last successful registry and signal catalog. `Match registry` and `Split signals` rewrite it. A lookup that fails uses this copy. The same acceptance rules apply: the asset has to be there, the topic plant and area have to match, and each signal needs a catalog entry. A signal that fails those rules is a rejection, and a rejection is not spooled.

`queue.jsonl` is one accepted row per line: `time`, `asset_id`, `signal`, `value`, and `quality`. `Append spool` writes a row when `Insert reading` fails. `Drain spool` retries that row with the same `INSERT`. `ON CONFLICT DO NOTHING` keeps a repeated row from being stored twice. `Ack spool` removes the line after the insert returns.

If the ETL starts with TimescaleDB down and `catalog.json` is missing, the reading is dropped. It is not spooled and it is not rejected.

`Drain spool` writes the waiting count to `queue_depth` every two seconds. The Asset Health pipeline reads that row. While TimescaleDB is down the row cannot move, and the dashboard cannot show it.

## Check

1. With the stack up, a motor reading is stored and `catalog.json` exists in the spool volume.
2. `docker compose stop timescaledb`. The motor keeps publishing.
3. `docker compose start timescaledb`. The readings from the outage are in `sensor_readings`, once each.

## Consequences

- A contract rejection still goes to `rejected`. While the database is down, the `rejected_messages` insert fails. The MQTT publish does not.
- The copy can be older than the registry. A signal removed from `asset_limits` during the outage is still accepted until the next successful lookup.
- Restarting `node-red-etl` keeps the spool. The volume is the store.
