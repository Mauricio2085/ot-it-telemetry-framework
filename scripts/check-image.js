#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

for (const side of ["ingestion", "etl"]) {
  const docker = read(`nodered/${side}/Dockerfile`);
  assert.ok(docker.includes("FROM nodered/node-red:4.0.9"), `${side} image base`);
  assert.ok(docker.includes("npm ci"), `${side} installs at build`);
  assert.ok(docker.includes("/opt/nodes"), `${side} installs outside /data`);
  const dataPkg = JSON.parse(read(`nodered/${side}/data/package.json`));
  assert.strictEqual(dataPkg.dependencies, undefined, `${side} data package has no dependencies`);
  assert.ok(fs.existsSync(path.join(root, "nodered", side, "package-lock.json")));
  assert.strictEqual(
    fs.existsSync(path.join(root, "nodered", side, "data", "package-lock.json")),
    false
  );
}

const ingestionPkg = JSON.parse(read("nodered/ingestion/package.json"));
assert.strictEqual(ingestionPkg.dependencies["node-red-contrib-modbus"], "~5.45.2");
const etlPkg = JSON.parse(read("nodered/etl/package.json"));
assert.strictEqual(etlPkg.dependencies["node-red-contrib-postgresql"], "~0.16.2");

const ingestionSettings = read("nodered/ingestion/data/settings.js");
assert.ok(ingestionSettings.includes(
  "/opt/nodes/node_modules/node-red-contrib-modbus/modbus/core/modbus-client-core.js"
));
assert.strictEqual(ingestionSettings.includes("/data/node_modules"), false);
assert.ok(ingestionSettings.includes("autoInstall: false"));
assert.ok(ingestionSettings.includes('nodesDir: ["/opt/nodes"]'));

const etlSettings = read("nodered/etl/data/settings.js");
assert.ok(etlSettings.includes("autoInstall: false"));
assert.ok(etlSettings.includes('nodesDir: ["/opt/nodes"]'));
assert.strictEqual(etlSettings.includes("/data/node_modules"), false);

const compose = read("docker-compose.yaml");
const ingestion = compose.split("\n  node-red-ingestion:\n")[1].split("\n  node-red-etl:\n")[0];
const etl = compose.split("\n  node-red-etl:\n")[1].split("\n  timescaledb:\n")[0];
assert.ok(ingestion.includes("build: ./nodered/ingestion"));
assert.ok(etl.includes("build: ./nodered/etl"));
assert.ok(ingestion.includes("rm -rf /data/node_modules"));
assert.ok(etl.includes("rm -rf /data/node_modules"));

console.log("image ok");
