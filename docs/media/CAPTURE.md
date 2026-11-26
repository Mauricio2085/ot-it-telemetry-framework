# Capture checklist for README media

Already in this folder: `architecture.svg`, `mailbox-alert.png` (firing alarm mail), `mailbox-inbox.png`. Grafana uses the local admin password from `.env` (not in git). Mailpit has no login.

## Files to produce

| File | Status | When / how |
| --- | --- | --- |
| `architecture.svg` | Done | OT/IT pipeline diagram |
| `mailbox-alert.png` | Done | Open firing alarm mail in Mailpit |
| `mailbox-inbox.png` | Done | Mailpit inbox list (optional for carousel) |
| `dashboard-normal.png` | Done | Tile `NORMAL`, no bad readings |
| `dashboard-bad-quality.png` | Done | Tile `NORMAL` with “bad readings discarded” |
| `dashboard-alarm.png` | Done | ALARM KPI tile + vibration/temperature charts (same framing as warning) |
| `dashboard-warning-trends.png` | Done | WARNING KPI tile + vibration/temperature charts in one frame |
| Short MP4/GIF | **You** | 45–60 s: cycle restart → condition moves → mail → bad spike does not mail |

Dashboard PNGs are linked from `README.md` / `README.es.md`.

## Commands

```bash
# Align the live window (waits ~8 min, then watch Grafana + Mailpit)
scripts/demo-prep.sh

# Or restart the cycle from minute 0 yourself
docker compose restart modbus-slave
```

Check condition while you wait:

```bash
docker compose exec -T timescaledb sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT signal, condition, round(value_avg::numeric,2) AS avg, bad_1m, data_quality FROM asset_condition;"'
```

| Cycle minute | What to capture |
| --- | --- |
| 0–1 | `dashboard-normal.png` |
| ~1.0–1.5 | `dashboard-bad-quality.png` (`bad_1m` > 0, condition still `normal`) |
| ~8–10 | `dashboard-alarm.png` + `mailbox-alert.png` |

Drop the PNGs into this folder with those exact names so the README images resolve.
