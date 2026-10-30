# Broker TLS

[Español](adr-tls.md)

Status: accepted. 2026-10-29.

## Context

The broker listened on `1883` without encryption. Whoever was on that wire could read the username, the password, and the motor JSON. The two accounts and the ACL already decided who gets in and what they can say.

## Decision

Mosquitto listens only on `8883`, with TLS 1.2. `1883` is not published. The certificate names `mosquitto` and `localhost`. The Node-RED instances trust the CA that signs it and check that name.

Before Mosquitto starts, a one-shot container creates the CA, the key, and the server certificate. It uses the Node-RED image because `openssl` is already there. The key stays on the Mosquitto data volume. Only `ca.crt` goes to the `mqtt_ca` volume. A restart reuses those files. The key is not committed. Each Node-RED mounts `mqtt_ca` read-only and points the TLS node at `/mqtt-ca/ca.crt`.

The accounts stay as they are. From the host the door is `localhost:8883` with that CA and one of the two accounts.

## Check

1. `scripts/check-broker.js` checks port `8883`, the TLS listener, and that both flows use the CA.
2. A cleartext connection to `1883` does not get in.
3. The ETL account, with the CA, reads one telemetry message on `8883`. The ingestion account, subscribed to `#`, receives no messages.
4. A motor reading still reaches Grafana.

## Consequences

- A client certificate, HTTPS on Grafana, and TLS on TimescaleDB stay out.
- The CA and the key live on the volume. Deleting the volume creates a new certificate.
- The host can open `8883`. The bytes are encrypted and an account is required.
