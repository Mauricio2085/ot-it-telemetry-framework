# Registry from the profile

[Español](adr-registry.md)

Status: accepted. 2026-10-29.

## Context

`profiles/*.json` already names the registers to read. `assets` and `asset_limits` were still an `INSERT` in the init scripts. A threshold and the field map lived in two places, and the file did not write the database.

Ingestion is on `ot-net`. It cannot reach TimescaleDB. The ETL can.

## Decision

The same file carries the type, the criticality, and, on each signal, the unit, the nominal, the limits, and the reference. A limit that does not apply is left out. The type stays closed on `motor`. Criticality stays `critical` or `standard`.

`node-red-etl` mounts `profiles/` and, when the database answers, upserts `assets` and `asset_limits`. A signal of that asset that is no longer in the file loses its limits row. Old readings stay. An asset whose file was removed from `profiles/` stays in `assets`: history blocks the delete, and this cut does not delete it.

The upsert retries every 5 seconds until the first one answers. Editing the file is not enough: a map change needs a restart of `node-red-ingestion`; a registry or limit change needs a restart of `node-red-etl`.

The init scripts create the tables and the keys. They no longer insert the motor.

## Check

1. `scripts/check-profile.js` builds the motor payload: type `motor`, vibration warning 2.8 and alarm 4.5, and it rejects another type, a signal with no limit, and a nominal outside the warning band.
2. With the stack up, `asset_limits` has those two limits.
3. Change the vibration `warning_high` in the file and run `docker compose restart node-red-etl`. The dashboard line moves on the next refresh. Put the file back to 2.8 and restart again, and the line is where it was.

## Consequences

- A new database has no motor until that upsert answers. Ingestion waits 2 seconds before the first poll. The upsert starts at half a second. A reading that wins that race is rejected; it does not enter the spool.
- While the database is down, the retry continues. The catalog copy can lag the file until the upsert answers.
- A direct `UPDATE` in the database lasts until the next ETL start. The file writes the row again.
- There is no commissioning screen. Another asset type does not enter: the file has to say `motor`.
