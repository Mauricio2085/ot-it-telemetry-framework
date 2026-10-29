"use strict";

const fs = require("fs");
const path = require("path");

const QUALITIES = ["good", "uncertain", "bad"];
const ASSET_TYPES = ["motor"];
const CRITICALITIES = ["critical", "standard"];
const LIMIT_KEYS = ["alarm_low", "warning_low", "warning_high", "alarm_high"];
const MAX_QUANTITY = 125;

function fail(file, message) {
  const where = file ? `${file}: ` : "";
  throw new Error(`profile: ${where}${message}`);
}

function isTopicSegment(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("/")
    && !value.includes("+")
    && !value.includes("#");
}

function limitValue(signal, key, file) {
  if (!Object.prototype.hasOwnProperty.call(signal, key) || signal[key] === null) return null;
  const value = signal[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(file, `signal ${signal.name} ${key} must be a finite number or null`);
  }
  return value;
}

function validateSignalLimits(signal, file) {
  const name = signal.name;
  if (typeof signal.unit !== "string" || signal.unit.length === 0) {
    fail(file, `signal ${name} needs a unit`);
  }
  if (typeof signal.nominal !== "number" || !Number.isFinite(signal.nominal)) {
    fail(file, `signal ${name} nominal must be a finite number`);
  }
  if (typeof signal.reference !== "string" || signal.reference.length === 0) {
    fail(file, `signal ${name} needs a reference`);
  }
  const limits = {};
  for (const key of LIMIT_KEYS) limits[key] = limitValue(signal, key, file);
  if (LIMIT_KEYS.every((key) => limits[key] === null)) {
    fail(file, `signal ${name} needs a limit`);
  }
  if (limits.alarm_low !== null && limits.warning_low !== null && limits.alarm_low > limits.warning_low) {
    fail(file, `signal ${name} alarm_low must be at or below warning_low`);
  }
  if (limits.warning_high !== null && limits.alarm_high !== null && limits.warning_high > limits.alarm_high) {
    fail(file, `signal ${name} warning_high must be at or below alarm_high`);
  }
  if (limits.warning_low !== null && limits.warning_high !== null && limits.warning_low >= limits.warning_high) {
    fail(file, `signal ${name} warning_low must be below warning_high`);
  }
  if (limits.warning_low !== null && !(signal.nominal > limits.warning_low)) {
    fail(file, `signal ${name} nominal must sit inside the warning band`);
  }
  if (limits.warning_high !== null && !(signal.nominal < limits.warning_high)) {
    fail(file, `signal ${name} nominal must sit inside the warning band`);
  }
}

function signalRow(signal) {
  const row = {
    name: signal.name,
    unit: signal.unit,
    nominal: signal.nominal,
    alarm_low: null,
    warning_low: null,
    warning_high: null,
    alarm_high: null,
    reference: signal.reference
  };
  for (const key of LIMIT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(signal, key) && signal[key] !== null) {
      row[key] = signal[key];
    }
  }
  return row;
}

function readWindow(profile) {
  const registers = profile.modbus.signals
    .map((signal) => signal.register)
    .concat(profile.modbus.quality.register);
  const address = Math.min(...registers);
  return {
    address,
    quantity: Math.max(...registers) - address + 1
  };
}

function validateProfile(profile, file) {
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) {
    fail(file, "must be an object");
  }
  for (const key of ["plant", "area", "asset_id"]) {
    if (!isTopicSegment(profile[key])) {
      fail(file, `${key} must be a topic segment`);
    }
  }
  if (!ASSET_TYPES.includes(profile.asset_type)) {
    fail(file, "asset_type must be motor");
  }
  if (!CRITICALITIES.includes(profile.criticality)) {
    fail(file, "criticality must be critical or standard");
  }
  if (!Number.isInteger(profile.poll_interval_s) || profile.poll_interval_s < 1) {
    fail(file, "poll_interval_s must be a whole number of seconds");
  }
  const modbus = profile.modbus;
  if (modbus === null || typeof modbus !== "object" || Array.isArray(modbus)) {
    fail(file, "modbus must be an object");
  }
  if (!Number.isInteger(modbus.unit_id) || modbus.unit_id < 0 || modbus.unit_id > 255) {
    fail(file, "modbus.unit_id must be an integer from 0 to 255");
  }
  if (!Array.isArray(modbus.signals) || modbus.signals.length === 0) {
    fail(file, "modbus.signals must list at least one signal");
  }

  const names = new Set();
  const registers = new Set();
  for (const signal of modbus.signals) {
    if (signal === null || typeof signal !== "object" || Array.isArray(signal)) {
      fail(file, "a signal must be an object");
    }
    if (typeof signal.name !== "string" || signal.name.length === 0) {
      fail(file, "a signal needs a name");
    }
    if (names.has(signal.name)) fail(file, `signal ${signal.name} is duplicated`);
    names.add(signal.name);
    if (!Number.isInteger(signal.register) || signal.register < 0 || signal.register > 65535) {
      fail(file, `signal ${signal.name} register must be an integer from 0 to 65535`);
    }
    if (registers.has(signal.register)) fail(file, `register ${signal.register} is used twice`);
    registers.add(signal.register);
    if (typeof signal.scale !== "number" || !Number.isFinite(signal.scale) || signal.scale === 0) {
      fail(file, `signal ${signal.name} scale must be a finite number other than 0`);
    }
    validateSignalLimits(signal, file);
  }

  const quality = modbus.quality;
  if (quality === null || typeof quality !== "object" || Array.isArray(quality)) {
    fail(file, "modbus.quality must be an object");
  }
  if (!Number.isInteger(quality.register) || quality.register < 0 || quality.register > 65535) {
    fail(file, "quality register must be an integer from 0 to 65535");
  }
  if (registers.has(quality.register)) {
    fail(file, "quality register must not be a signal register");
  }
  if (!QUALITIES.includes(quality.unknown)) {
    fail(file, "quality.unknown must be good, uncertain, or bad");
  }
  if (quality.codes === null || typeof quality.codes !== "object" || Array.isArray(quality.codes)) {
    fail(file, "quality.codes must be an object");
  }
  const codeKeys = Object.keys(quality.codes);
  if (codeKeys.length === 0) fail(file, "quality.codes must map at least one device code");
  for (const key of codeKeys) {
    if (!/^\d+$/.test(key) || Number(key) > 65535) {
      fail(file, `quality code ${key} must be a non-negative integer`);
    }
    if (!QUALITIES.includes(quality.codes[key])) {
      fail(file, `quality code ${key} must map to good, uncertain, or bad`);
    }
  }

  const read = readWindow(profile);
  if (read.quantity > MAX_QUANTITY) {
    fail(file, `register span is ${read.quantity}, and one read can hold at most ${MAX_QUANTITY}`);
  }
  return profile;
}

function registryParams(profiles) {
  if (!Array.isArray(profiles)) fail("", "registryParams expects a list of profiles");
  return [JSON.stringify(profiles.map((item) => ({
    asset_id: item.asset_id,
    plant: item.plant,
    area: item.area,
    asset_type: item.asset_type,
    criticality: item.criticality,
    signals: item.modbus.signals.map(signalRow)
  })))];
}

function topicFor(profile) {
  return `${profile.plant}/${profile.area}/${profile.asset_id}/telemetry`;
}

function loadProfiles(dir) {
  if (typeof dir !== "string" || dir.length === 0) fail("", "PROFILE_DIR is empty");
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    fail(dir, err.code === "ENOENT" ? "directory not found" : err.message);
  }
  const files = names.filter((name) => name.endsWith(".json")).sort();
  if (files.length === 0) fail(dir, "no profile json files");

  const profiles = files.map((name) => {
    const full = path.join(dir, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (err) {
      fail(name, `invalid JSON (${err.message})`);
    }
    return validateProfile(parsed, name);
  });

  const topics = new Set();
  for (const profile of profiles) {
    const topic = topicFor(profile);
    if (topics.has(topic)) fail("", `topic ${topic} is declared by more than one profile`);
    topics.add(topic);
  }
  return profiles;
}

function pollMessage(profile) {
  const read = readWindow(profile);
  return {
    topic: topicFor(profile),
    profile,
    payload: {
      fc: 3,
      unitid: profile.modbus.unit_id,
      address: read.address,
      quantity: read.quantity
    }
  };
}

function scaled(raw, scale) {
  const value = raw * scale;
  const text = String(scale);
  const dot = text.indexOf(".");
  if (dot === -1) return value;
  const factor = 10 ** (text.length - dot - 1);
  return Math.round(value * factor) / factor;
}

function registerValues(payload) {
  const source = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.data) ? payload.data : null);
  if (!source) return null;
  return source.map((value) => (typeof value === "number" ? value : Number(value)));
}

function telemetryFromRegisters(profile, payload, now) {
  const read = readWindow(profile);
  const registers = registerValues(payload);
  if (!registers || registers.length < read.quantity) {
    const got = registers ? String(registers.length) : "none";
    return { error: `expected ${read.quantity} holding registers, got ${got}` };
  }
  if (registers.slice(0, read.quantity).some((value) => !Number.isFinite(value))) {
    return { error: "a holding register is not a number" };
  }
  const code = registers[profile.modbus.quality.register - read.address];
  const codes = profile.modbus.quality.codes;
  const key = String(code);
  const quality = Object.prototype.hasOwnProperty.call(codes, key)
    ? codes[key]
    : profile.modbus.quality.unknown;
  return {
    topic: topicFor(profile),
    payload: {
      asset_id: profile.asset_id,
      ts: now.toISOString(),
      signals: profile.modbus.signals.map((signal) => ({
        name: signal.name,
        value: scaled(registers[signal.register - read.address], signal.scale),
        quality
      }))
    }
  };
}

module.exports = {
  loadProfiles,
  pollMessage,
  registryParams,
  telemetryFromRegisters,
  topicFor,
  validateProfile
};
