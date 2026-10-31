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
const mailbox = service(compose, "\n  mailbox:\n", "\n  grafana:\n");
const grafana = service(compose, "\n  grafana:\n");

assert.ok(certs.includes('restart: "no"'), "certificate job stays one-shot");
for (const chunk of [mosquitto, slave, ingestion, etl, timescale, mailbox, grafana]) {
  assert.ok(chunk.includes("restart: unless-stopped"));
}
assert.strictEqual(compose.includes("restart: on-failure"), false);
assert.strictEqual(compose.includes("1025:1025"), false, "smtp stays on it-net");
assert.ok(mailbox.includes("image: axllent/mailpit:v1.32.0"));
assert.ok(mailbox.includes('"8025:8025"'));
assert.ok(mailbox.includes("it-net"));
assert.ok(grafana.includes("GF_SMTP_ENABLED=true"));
assert.ok(grafana.includes("GF_SMTP_HOST=mailbox:1025"));
assert.ok(grafana.includes("GF_SMTP_STARTTLS_POLICY=NoStartTLS"));
assert.ok(grafana.includes("mailbox:"));
assert.strictEqual(grafana.includes("GF_SERVER_PROTOCOL"), false);

const rules = read("grafana/provisioning/alerting/rules.yaml");
assert.ok(rules.includes("FROM asset_condition"));
assert.ok(rules.includes("condition IN ('warning', 'alarm')"));
assert.strictEqual(rules.includes("sensor_readings"), false);
assert.ok(rules.includes("noDataState: OK"));
assert.ok(rules.includes("for: 0s"));
assert.ok(rules.includes("abs($B)"));
assert.strictEqual(rules.includes("$$"), false);
assert.ok(rules.includes("{{ $labels.asset_id }}"));
assert.ok(rules.includes("{{ $labels.signal }}"));
assert.ok(rules.includes("{{ $labels.condition }}"));
assert.ok(rules.includes("{{ $values.B.Value }}"));
assert.ok(rules.includes("datasourceUid: timescaledb"));

const contacts = read("grafana/provisioning/alerting/contact_points.yaml");
assert.ok(contacts.includes("name: demo-mailbox"));
assert.ok(contacts.includes("type: email"));
assert.ok(contacts.includes("addresses: demo@edge.local"));
assert.ok(contacts.includes("disableResolveMessage: false"));

const policies = read("grafana/provisioning/alerting/policies.yaml");
assert.ok(policies.includes("receiver: demo-mailbox"));
assert.ok(policies.includes("group_interval: 30s"));
assert.ok(policies.includes("repeat_interval: 4h"));
assert.ok(policies.includes("- asset_id"));
assert.ok(policies.includes("- signal"));
assert.ok(policies.includes("- condition"));

console.log("alert ok");
