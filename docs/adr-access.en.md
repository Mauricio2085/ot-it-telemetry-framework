# Broker accounts and workshop ports

[Español](adr-access.md)

Status: accepted. 2026-10-29.

## Context

The ingestion editor, the ETL editor, and the Modbus slave were published on the host, on `1881`, `1882`, and `1502`. The broker had one account. Whoever held it could publish and subscribe to any topic. Port `1883` was published in the clear.

Ingestion only publishes `plant/area/asset/telemetry`. The ETL only subscribes to `+/+/+/telemetry` and publishes rejections on the topic `rejected`.

## Decision

The host no longer publishes `1881`, `1882`, or `1502`. Those programs stay on their Docker networks and are reached by name. Grafana stays on `3001`. TimescaleDB stays on `127.0.0.1:5435`. Broker encryption is in [adr-tls.en.md](adr-tls.en.md).

There are two accounts. On start, the entrypoint writes the password file and the ACL on the data volume, and starts from a copy of `mosquitto.conf` that points at that ACL.

| Account | May |
| --- | --- |
| Ingestion | publish to `+/+/+/telemetry` |
| ETL | subscribe to `+/+/+/telemetry` and publish to `rejected` |

Ingestion does not publish to `rejected`. The ETL does not publish telemetry and does not read `rejected`. Mosquitto accepts a subscription to `#` and then does not deliver topics that account cannot read: ingestion receives nothing, and the ETL receives only telemetry. A `topic deny #` rule also vetoes the allowed publish, so it is not used.

Inside each Node-RED the variables are still named `MQTT_USER` and `MQTT_PASSWORD`. Compose puts that service's account there.

## Check

1. `scripts/check-broker.js` checks the ports, the account wiring, and the ACL lines.
2. A motor reading still reaches Grafana.
3. The ingestion account cannot publish to `rejected` and, subscribed to `#`, receives no messages. The ETL account cannot publish to `.../telemetry`.
4. The host does not listen on `1881`, `1882`, or `1502`.

## Consequences

- The TLS listener is in [adr-tls.en.md](adr-tls.en.md). This cut did not open it.
- The `prohibit` route stays. The restart policy is in [adr-alert.en.md](adr-alert.en.md).
- A rejection is seen in `rejected_messages`. Neither account can subscribe to `rejected`.
- A compromised ingestion can still publish readings on the telemetry topics. It cannot listen to the plant or write rejections.
