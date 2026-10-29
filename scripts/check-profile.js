#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const profile = require(path.join(root, "nodered", "ingestion", "profile.js"));

const motorPath = path.join(root, "profiles", "critical-motor-01.json");
const motor = profile.validateProfile(
  JSON.parse(fs.readFileSync(motorPath, "utf8")),
  "critical-motor-01.json"
);
const loaded = profile.loadProfiles(path.join(root, "profiles"));
assert.strictEqual(loaded.length, 1);
assert.strictEqual(loaded[0].asset_id, "critical-motor-01");

const poll = profile.pollMessage(motor);
assert.deepStrictEqual(poll.payload, { fc: 3, unitid: 1, address: 0, quantity: 3 });
assert.strictEqual(poll.topic, "plant-01/area-01/critical-motor-01/telemetry");

const now = new Date("2026-10-16T15:00:00.000Z");
const healthy = profile.telemetryFromRegisters(motor, [550, 80, 0], now);
assert.deepStrictEqual(healthy.payload, {
  asset_id: "critical-motor-01",
  ts: "2026-10-16T15:00:00.000Z",
  signals: [
    { name: "bearing_temperature", value: 55, quality: "good" },
    { name: "vibration", value: 0.8, quality: "good" }
  ]
});

const rounded = profile.telemetryFromRegisters(motor, [568, 474, 0], now);
assert.strictEqual(rounded.payload.signals[0].value, 56.8);
assert.strictEqual(rounded.payload.signals[1].value, 4.74);

const fault = profile.telemetryFromRegisters(motor, { data: [550, 2500, 2] }, now);
assert.strictEqual(fault.payload.signals[0].quality, "bad");
assert.strictEqual(fault.payload.signals[1].quality, "bad");
assert.strictEqual(fault.payload.signals[1].value, 25);

const uncertain = profile.telemetryFromRegisters(motor, [550, 80, 1], now);
assert.strictEqual(uncertain.payload.signals[0].quality, "uncertain");

const unknown = profile.telemetryFromRegisters(motor, [550, 80, 9], now);
assert.strictEqual(unknown.payload.signals[0].quality, "bad");

const short = profile.telemetryFromRegisters(motor, [550], now);
assert.strictEqual(short.error, "expected 3 holding registers, got 1");

const shifted = {
  plant: "plant-02",
  area: "area-02",
  asset_id: "motor-02",
  asset_type: "motor",
  criticality: "standard",
  poll_interval_s: 5,
  modbus: {
    unit_id: 4,
    signals: [
      {
        name: "bearing_temperature",
        register: 10,
        scale: 0.1,
        unit: "°C",
        nominal: 55,
        warning_high: 80,
        alarm_high: 90,
        reference: "lab default"
      },
      {
        name: "vibration",
        register: 12,
        scale: 0.01,
        unit: "mm/s",
        nominal: 0.8,
        warning_high: 2.8,
        alarm_high: 4.5,
        reference: "ISO 10816-3"
      }
    ],
    quality: {
      register: 14,
      codes: { "0": "good", "2": "bad" },
      unknown: "bad"
    }
  }
};
profile.validateProfile(shifted, "shifted.json");
const shiftedPoll = profile.pollMessage(shifted);
assert.deepStrictEqual(shiftedPoll.payload, { fc: 3, unitid: 4, address: 10, quantity: 5 });
const shiftedReading = profile.telemetryFromRegisters(
  shifted,
  [550, 999, 80, 999, 0],
  now
);
assert.strictEqual(shiftedReading.payload.signals[0].value, 55);
assert.strictEqual(shiftedReading.payload.signals[1].value, 0.8);
assert.strictEqual(shiftedReading.payload.signals[1].quality, "good");

const registry = JSON.parse(profile.registryParams([motor])[0]);
assert.deepStrictEqual(registry, [{
  asset_id: "critical-motor-01",
  plant: "plant-01",
  area: "area-01",
  asset_type: "motor",
  criticality: "critical",
  signals: [
    {
      name: "bearing_temperature",
      unit: "°C",
      nominal: 55,
      alarm_low: null,
      warning_low: null,
      warning_high: 80,
      alarm_high: 90,
      reference: "lab default"
    },
    {
      name: "vibration",
      unit: "mm/s",
      nominal: 0.8,
      alarm_low: null,
      warning_low: null,
      warning_high: 2.8,
      alarm_high: 4.5,
      reference: "ISO 10816-3"
    }
  ]
}]);

assert.throws(
  () => profile.validateProfile({ ...motor, asset_id: "plant/motor" }, "bad.json"),
  /topic segment/
);
assert.throws(
  () => profile.validateProfile({ ...motor, asset_type: "pump" }, "bad.json"),
  /asset_type must be motor/
);
assert.throws(
  () => profile.validateProfile({
    ...motor,
    modbus: {
      ...motor.modbus,
      quality: { ...motor.modbus.quality, codes: { "0": "ok" } }
    }
  }, "bad.json"),
  /good, uncertain, or bad/
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-"));
const copy = JSON.parse(JSON.stringify(motor));
fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify(copy));
fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify(copy));
assert.throws(() => profile.loadProfiles(dir), /more than one profile/);

const flows = fs.readFileSync(
  path.join(root, "nodered", "ingestion", "data", "flows.json"),
  "utf8"
);
assert.strictEqual(flows.includes("critical-motor-01"), false);
assert.strictEqual(flows.includes("bearing_temperature"), false);
assert.strictEqual(flows.includes("/ 10"), false);
assert.strictEqual(flows.includes("/ 100"), false);

const bare = JSON.parse(JSON.stringify(motor));
delete bare.modbus.signals[0].warning_high;
delete bare.modbus.signals[0].alarm_high;
assert.throws(() => profile.validateProfile(bare, "bad.json"), /needs a limit/);

const swapped = JSON.parse(JSON.stringify(motor));
swapped.modbus.signals[1].warning_high = 5;
swapped.modbus.signals[1].alarm_high = 4;
assert.throws(
  () => profile.validateProfile(swapped, "bad.json"),
  /warning_high must be at or below alarm_high/
);

const outside = JSON.parse(JSON.stringify(motor));
outside.modbus.signals[0].nominal = 90;
assert.throws(
  () => profile.validateProfile(outside, "bad.json"),
  /nominal must sit inside the warning band/
);

const limitsSql = fs.readFileSync(
  path.join(root, "timescaledb", "init", "002_asset_condition.sql"),
  "utf8"
);
const assetsSql = fs.readFileSync(
  path.join(root, "timescaledb", "init", "004_assets.sql"),
  "utf8"
);
assert.strictEqual(/INSERT\s+INTO\s+asset_limits/i.test(limitsSql), false);
assert.strictEqual(/INSERT\s+INTO\s+assets/i.test(assetsSql), false);

const etlFlows = fs.readFileSync(
  path.join(root, "nodered", "etl", "data", "flows.json"),
  "utf8"
);
assert.strictEqual(etlFlows.includes("Upsert registry"), true);
assert.strictEqual(etlFlows.includes("Prune limits"), true);

const compose = fs.readFileSync(path.join(root, "docker-compose.yaml"), "utf8");
const etlService = compose.split("node-red-etl:")[1].split("timescaledb:")[0];
assert.strictEqual(etlService.includes("PROFILE_DIR=/profile"), true);
assert.strictEqual(etlService.includes("./profiles:/profile:ro"), true);
assert.strictEqual(etlService.includes("/opt/ingestion/profile.js"), true);

console.log("profile ok");
