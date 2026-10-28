#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const spool = require(path.join(__dirname, "..", "nodered", "etl", "spool.js"));

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "etl-spool-"));
}

const reading = {
  time: "2026-10-28T21:00:00.000Z",
  plant: "plant-01",
  area: "area-01",
  asset_id: "critical-motor-01",
  signals: [
    { name: "bearing_temperature", value: 55, quality: "good" },
    { name: "vibration", value: 0.8, quality: "good" }
  ]
};

const empty = tempDir();
assert.strictEqual(spool.loadCatalog(empty), null);
assert.deepStrictEqual(spool.decide(empty, reading), {
  unavailable: true,
  rows: [],
  errors: []
});
assert.strictEqual(spool.head(empty), null);
assert.strictEqual(spool.depth(empty), 0);

const dir = tempDir();
spool.rememberAsset(dir, "critical-motor-01", "plant-01", "area-01");
assert.deepStrictEqual(spool.decide(dir, reading), {
  unavailable: true,
  rows: [],
  errors: []
});

spool.rememberLimits(dir, "critical-motor-01", ["bearing_temperature", "vibration"]);
const accepted = spool.decide(dir, reading);
assert.strictEqual(accepted.unavailable, false);
assert.deepStrictEqual(accepted.errors, []);
assert.deepStrictEqual(accepted.rows, [
  {
    time: reading.time,
    asset_id: "critical-motor-01",
    signal: "bearing_temperature",
    value: 55,
    quality: "good"
  },
  {
    time: reading.time,
    asset_id: "critical-motor-01",
    signal: "vibration",
    value: 0.8,
    quality: "good"
  }
]);

const extra = spool.decide(dir, {
  ...reading,
  signals: reading.signals.concat({ name: "pressure", value: 1, quality: "good" })
});
assert.strictEqual(extra.rows.length, 2);
assert.deepStrictEqual(extra.errors, ["signal pressure has no asset_limits row"]);

const wrongArea = spool.decide(dir, { ...reading, area: "area-99" });
assert.deepStrictEqual(wrongArea.errors, ["plant or area does not match the asset registry"]);

const unknownAsset = spool.decide(dir, { ...reading, asset_id: "other-motor" });
assert.deepStrictEqual(unknownAsset.errors, ["asset_id is not in the asset registry"]);

spool.forgetAsset(dir, "critical-motor-01");
assert.deepStrictEqual(spool.decide(dir, reading).errors, [
  "asset_id is not in the asset registry"
]);

const queueDir = tempDir();
const stored = spool.append(queueDir, accepted.rows);
assert.strictEqual(stored.length, 2);
assert.strictEqual(spool.depth(queueDir), 2);
const first = spool.head(queueDir);
assert.strictEqual(first.id, stored[0].id);
assert.strictEqual(first.signal, "bearing_temperature");
spool.ack(queueDir, first.id);
assert.strictEqual(spool.head(queueDir).signal, "vibration");
spool.append(queueDir, [accepted.rows[0]]);
assert.strictEqual(spool.depth(queueDir), 2);
spool.ack(queueDir, spool.head(queueDir).id);
spool.ack(queueDir, spool.head(queueDir).id);
assert.strictEqual(spool.head(queueDir), null);
assert.strictEqual(spool.depth(queueDir), 0);

assert.throws(
  () => spool.append(queueDir, [{ ...accepted.rows[0], quality: "ok" }]),
  /quality/
);

const flows = fs.readFileSync(
  path.join(__dirname, "..", "nodered", "etl", "data", "flows.json"),
  "utf8"
);
assert.strictEqual(flows.includes("ON CONFLICT DO NOTHING"), true);
assert.strictEqual(flows.includes("spool.append"), true);
assert.strictEqual(flows.includes("spool.decide"), true);

console.log("spool ok");
