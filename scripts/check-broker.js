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
const mosquitto = service(compose, "\n  mosquitto:\n", "\n  modbus-slave:\n");
const slave = service(compose, "\n  modbus-slave:\n", "\n  node-red-ingestion:\n");
const ingestion = service(compose, "\n  node-red-ingestion:\n", "\n  node-red-etl:\n");
const etl = service(compose, "\n  node-red-etl:\n", "\n  timescaledb:\n");
const timescale = service(compose, "\n  timescaledb:\n", "\n  grafana:\n");
const grafana = service(compose, "\n  grafana:\n");

assert.ok(mosquitto.includes('"1883:1883"'), "broker stays on 1883");
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

const conf = read("mosquitto/config/mosquitto.conf");
assert.ok(conf.includes("listener 1883"));
assert.ok(conf.includes("allow_anonymous false"));
assert.ok(conf.includes("password_file /mosquitto/data/passwd"));

const entry = read("mosquitto/docker-entrypoint.sh");
assert.ok(entry.includes('mosquitto_passwd -b -c /mosquitto/data/passwd "$MQTT_INGEST_USER"'));
assert.ok(entry.includes('mosquitto_passwd -b /mosquitto/data/passwd "$MQTT_ETL_USER"'));
assert.ok(entry.includes("different usernames"));
assert.ok(entry.includes("topic write +/+/+/telemetry"));
assert.ok(entry.includes("topic read +/+/+/telemetry"));
assert.ok(entry.includes("topic write rejected"));
assert.strictEqual(entry.includes("topic deny"), false);
assert.ok(entry.includes("acl_file /mosquitto/data/acl"));
assert.ok(entry.includes("/usr/sbin/mosquitto -c /mosquitto/data/mosquitto.conf"));
assert.strictEqual(entry.includes("MQTT_USER"), false);

const example = read(".env.example");
assert.ok(/^MQTT_INGEST_USER=/m.test(example));
assert.ok(/^MQTT_ETL_USER=/m.test(example));
assert.ok(/^MQTT_INGEST_PASSWORD=/m.test(example));
assert.ok(/^MQTT_ETL_PASSWORD=/m.test(example));
assert.strictEqual(/^MQTT_USER=/m.test(example), false);
assert.strictEqual(/^MQTT_PASSWORD=/m.test(example), false);

console.log("broker ok");
