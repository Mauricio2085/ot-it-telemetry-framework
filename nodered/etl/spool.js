"use strict";

const fs = require("fs");
const path = require("path");

const QUALITIES = ["good", "uncertain", "bad"];

function fail(message) {
  throw new Error(`spool: ${message}`);
}

function ensureDir(dir) {
  if (typeof dir !== "string" || dir.length === 0) fail("SPOOL_DIR is empty");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function catalogPath(dir) {
  return path.join(dir, "catalog.json");
}

function queuePath(dir) {
  return path.join(dir, "queue.jsonl");
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    if (text.length > 0) fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function emptyCatalog() {
  return { assets: {}, limits: {} };
}

function loadCatalog(dir) {
  ensureDir(dir);
  const file = catalogPath(dir);
  if (!fs.existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`catalog copy is invalid JSON (${err.message})`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("catalog copy is not an object");
  }
  if (parsed.assets === null || typeof parsed.assets !== "object" || Array.isArray(parsed.assets)) {
    fail("catalog copy has no assets");
  }
  if (parsed.limits === null || typeof parsed.limits !== "object" || Array.isArray(parsed.limits)) {
    fail("catalog copy has no limits");
  }
  return parsed;
}

function saveCatalog(dir, catalog) {
  ensureDir(dir);
  writeAtomic(catalogPath(dir), JSON.stringify(catalog));
}

function rememberAsset(dir, assetId, plant, area) {
  const catalog = loadCatalog(dir) || emptyCatalog();
  catalog.assets[assetId] = { plant, area };
  saveCatalog(dir, catalog);
}

function rememberLimits(dir, assetId, signals) {
  const catalog = loadCatalog(dir) || emptyCatalog();
  catalog.limits[assetId] = signals.slice();
  saveCatalog(dir, catalog);
}

function forgetAsset(dir, assetId) {
  const catalog = loadCatalog(dir);
  if (!catalog) return;
  delete catalog.assets[assetId];
  delete catalog.limits[assetId];
  saveCatalog(dir, catalog);
}

function decide(dir, reading) {
  const catalog = loadCatalog(dir);
  if (!catalog) return { unavailable: true, rows: [], errors: [] };
  const registered = catalog.assets[reading.asset_id];
  if (!registered) {
    return {
      unavailable: false,
      rows: [],
      errors: ["asset_id is not in the asset registry"]
    };
  }
  if (registered.plant !== reading.plant || registered.area !== reading.area) {
    return {
      unavailable: false,
      rows: [],
      errors: ["plant or area does not match the asset registry"]
    };
  }
  if (!Object.prototype.hasOwnProperty.call(catalog.limits, reading.asset_id)) {
    return { unavailable: true, rows: [], errors: [] };
  }
  const known = new Set(catalog.limits[reading.asset_id]);
  const unknown = [];
  const rows = [];
  for (const signal of reading.signals) {
    if (!known.has(signal.name)) {
      unknown.push(signal.name);
      continue;
    }
    rows.push({
      time: reading.time,
      asset_id: reading.asset_id,
      signal: signal.name,
      value: signal.value,
      quality: signal.quality
    });
  }
  const errors = unknown.map((name) => `signal ${name} has no asset_limits row`);
  if (rows.length === 0 && errors.length === 0) errors.push("signals is empty");
  return { unavailable: false, rows, errors };
}

function readQueue(dir) {
  ensureDir(dir);
  const file = queuePath(dir);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  if (text.length === 0) return [];
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      fail(`queue line is invalid JSON (${err.message})`);
    }
    rows.push(parsed);
  }
  return rows;
}

function writeQueue(dir, rows) {
  ensureDir(dir);
  const text = rows.length === 0 ? "" : `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  writeAtomic(queuePath(dir), text);
}

function asRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) fail("row is not an object");
  if (typeof row.asset_id !== "string" || row.asset_id.length === 0) fail("row is missing asset_id");
  if (typeof row.signal !== "string" || row.signal.length === 0) fail("row is missing signal");
  if (typeof row.time !== "string" || Number.isNaN(Date.parse(row.time))) fail("row time is not a timestamp");
  if (typeof row.value !== "number" || !Number.isFinite(row.value)) fail("row value is not a finite number");
  if (!QUALITIES.includes(row.quality)) fail("row quality is not good, uncertain or bad");
  return {
    time: row.time,
    asset_id: row.asset_id,
    signal: row.signal,
    value: row.value,
    quality: row.quality
  };
}

function append(dir, rows) {
  if (!Array.isArray(rows) || rows.length === 0) fail("append needs at least one row");
  const existing = readQueue(dir);
  let next = existing.reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
  const added = rows.map((row) => Object.assign(asRow(row), { id: next++ }));
  writeQueue(dir, existing.concat(added));
  return added;
}

function head(dir) {
  const rows = readQueue(dir);
  return rows.length === 0 ? null : rows[0];
}

function ack(dir, id) {
  const rows = readQueue(dir);
  writeQueue(dir, rows.filter((row) => row.id !== id));
}

function depth(dir) {
  return readQueue(dir).length;
}

module.exports = {
  ack,
  append,
  decide,
  depth,
  forgetAsset,
  head,
  loadCatalog,
  rememberAsset,
  rememberLimits
};
