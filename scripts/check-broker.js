#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function service(compose, start, end) {
  const chunk = compose.split(start)[1];
  assert.ok(chunk, `missing ${start.trim()}`);
  return end ? chunk.split(end)[0] : chunk;
}

const compose = read("docker-compose.yaml");
const certs = service(compose, "\n  mqtt-certs:\n", "\n  mosquitto:\n");
const mosquitto = service(compose, "\n  mosquitto:\n", "\n  modbus-slave:\n");
const slave = service(compose, "\n  modbus-slave:\n", "\n  node-red-ingestion:\n");
const ingestion = service(compose, "\n  node-red-ingestion:\n", "\n  node-red-etl:\n");
const etl = service(compose, "\n  node-red-etl:\n", "\n  timescaledb:\n");
const timescale = service(compose, "\n  timescaledb:\n", "\n  mailbox:\n");
const grafana = service(compose, "\n  grafana:\n");

assert.ok(mosquitto.includes('"8883:8883"'), "broker stays on 8883");
assert.ok(mosquitto.includes("image: eclipse-mosquitto:2.0.22"));
assert.ok(mosquitto.includes("service_completed_successfully"));
assert.ok(mosquitto.includes("mqtt_ca:/mqtt-ca:ro"));
assert.ok(certs.includes("image: nodered/node-red:4.0.9"));
assert.ok(certs.includes("./mosquitto/certs.sh:/certs.sh:ro"));
assert.ok(ingestion.includes("mqtt_ca:/mqtt-ca:ro"));
assert.ok(etl.includes("mqtt_ca:/mqtt-ca:ro"));
assert.ok(ingestion.includes("/mqtt-ca/ca.crt"));
assert.ok(etl.includes("/mqtt-ca/ca.crt"));
assert.strictEqual(compose.includes("1883:1883"), false);
assert.ok(timescale.includes("127.0.0.1:5435:5432"), "database stays on localhost");
assert.ok(grafana.includes('"3001:3000"'), "grafana stays on 3001");
assert.strictEqual(slave.includes("ports:"), false, "modbus slave is not published");
assert.strictEqual(ingestion.includes("ports:"), false, "ingestion editor is not published");
assert.strictEqual(etl.includes("ports:"), false, "etl editor is not published");
assert.strictEqual(compose.includes("1881:1880"), false);
assert.strictEqual(compose.includes("1882:1880"), false);
assert.strictEqual(compose.includes("1502:502"), false);

assert.ok(mosquitto.includes("MQTT_INGEST_USER=${MQTT_INGEST_USER}"));
assert.ok(mosquitto.includes("MQTT_INGEST_PASSWORD=${MQTT_INGEST_PASSWORD}"));
assert.ok(mosquitto.includes("MQTT_ETL_USER=${MQTT_ETL_USER}"));
assert.ok(mosquitto.includes("MQTT_ETL_PASSWORD=${MQTT_ETL_PASSWORD}"));
assert.strictEqual(mosquitto.includes("MQTT_USER="), false);
assert.ok(ingestion.includes("MQTT_USER=${MQTT_INGEST_USER}"));
assert.ok(ingestion.includes("MQTT_PASSWORD=${MQTT_INGEST_PASSWORD}"));
assert.ok(etl.includes("MQTT_USER=${MQTT_ETL_USER}"));
assert.ok(etl.includes("MQTT_PASSWORD=${MQTT_ETL_PASSWORD}"));

const conf = read("mosquitto/broker.conf");
assert.strictEqual(conf.includes("listener "), false);
assert.ok(conf.includes("allow_anonymous false"));
assert.ok(conf.includes("password_file /mosquitto/data/passwd"));
assert.ok(mosquitto.includes("mosquitto/broker.conf:/broker.conf:ro"));

const certScript = read("mosquitto/certs.sh");
assert.ok(certScript.includes("openssl req"));
assert.ok(certScript.includes("DNS:mosquitto,DNS:localhost"));

const entry = read("mosquitto/docker-entrypoint.sh");
assert.ok(entry.includes('mosquitto_passwd -b -c /mosquitto/data/passwd "$MQTT_INGEST_USER"'));
assert.ok(entry.includes('mosquitto_passwd -b /mosquitto/data/passwd "$MQTT_ETL_USER"'));
assert.ok(entry.includes("different usernames"));
assert.ok(entry.includes("topic write +/+/+/telemetry"));
assert.ok(entry.includes("topic read +/+/+/telemetry"));
assert.ok(entry.includes("topic write rejected"));
assert.strictEqual(entry.includes("topic deny"), false);
assert.ok(entry.includes("acl_file /mosquitto/data/acl"));
assert.ok(entry.includes("listener 8883"));
assert.strictEqual(entry.includes("listener 1883"), false);
assert.ok(entry.includes("certfile /mosquitto/data/server.crt"));
assert.ok(entry.includes("keyfile /mosquitto/data/server.key"));
assert.ok(entry.includes("tls_version tlsv1.2"));
assert.ok(entry.includes("TLS certificate is missing"));
assert.ok(entry.includes("/broker.conf"));
assert.ok(entry.includes("/usr/sbin/mosquitto -c /mosquitto/data/mosquitto.conf"));
assert.strictEqual(entry.includes("MQTT_USER"), false);

const example = read(".env.example");
assert.ok(/^MQTT_INGEST_USER=/m.test(example));
assert.ok(/^MQTT_ETL_USER=/m.test(example));
assert.ok(/^MQTT_INGEST_PASSWORD=/m.test(example));
assert.ok(/^MQTT_ETL_PASSWORD=/m.test(example));
assert.strictEqual(/^MQTT_USER=/m.test(example), false);
assert.strictEqual(/^MQTT_PASSWORD=/m.test(example), false);

for (const rel of ["nodered/ingestion/data/flows.json", "nodered/etl/data/flows.json"]) {
  const flows = JSON.parse(read(rel));
  const broker = flows.find((node) => node.type === "mqtt-broker");
  assert.ok(broker, rel);
  assert.strictEqual(broker.broker, "mosquitto");
  assert.strictEqual(broker.port, 8883);
  assert.strictEqual(broker.usetls, true);
  const tls = flows.find((node) => node.id === broker.tls);
  assert.strictEqual(tls.type, "tls-config");
  assert.strictEqual(tls.ca, "/mqtt-ca/ca.crt");
  assert.strictEqual(tls.cert, "");
  assert.strictEqual(tls.key, "");
  assert.strictEqual(tls.servername, "mosquitto");
  assert.strictEqual(tls.verifyservercert, true);
}

console.log("broker ok");
