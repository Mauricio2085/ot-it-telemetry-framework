# Local email alert

[Español](adr-alert.md)

Status: accepted. 2026-10-30.

## Context

A warning or an alarm was only visible on the dashboard. Someone who was not looking at it heard nothing. The demo has to show that notice without the plant mail server, without WhatsApp, and without a CMMS.

The `asset_condition` view already judges the one-minute average and leaves `bad` readings out. The sensor fault at minute 1 must not send mail.

## Decision

Grafana sends mail to a local mailbox, Mailpit `v1.32.0`, on `it-net`. SMTP `1025` is not published. The mailbox screen is `http://localhost:8025`.

The rule reads `asset_condition` where `condition` is `warning` or `alarm`. Each signal is its own notice: the mail names the asset, the signal, the state, and the average. When the signal returns to band, the row disappears and Grafana sends the resolved mail within the next half minute. `stale` does not alert. The rule does not wait a second minute: the view already waited the first. While the state stays, it does not repeat before four hours.

Services that keep running use `restart: unless-stopped`. The certificate container stays `restart: "no"`. Grafana stays HTTP on `3001`.

## Check

1. `scripts/check-alert.js` checks the mailbox, SMTP, the rule, and the restart policy.
2. `http://localhost:8025` shows the mailbox. Grafana stays at `http://localhost:3001`.
3. With the motor in warning or alarm, a mail arrives with the asset, the signal, the state, and the value. Returning to band sends the resolved mail.
4. The `bad` spike at minute 1 does not send mail.

## Consequences

- The plant mail server is a change to Grafana's SMTP. The local mailbox is only the demo.
- On Docker Desktop with WSL, a boot start can mount the bind mounts empty: TimescaleDB fails to start and Grafana loads no dashboard. After a reboot of that machine, `docker compose up -d` is still required.
- Encrypting the Grafana screen stays out.
