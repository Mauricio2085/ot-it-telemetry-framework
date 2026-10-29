#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");

const { addReconnectCodes, RECONNECT_CODES } = require(
  path.join(__dirname, "..", "nodered", "ingestion", "reconnect.js")
);

const errors = ["ECONNREFUSED", "ETIMEDOUT"];
addReconnectCodes(errors);
assert.deepStrictEqual(errors, ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"]);
addReconnectCodes(errors);
assert.deepStrictEqual(
  errors.filter((code) => code === "ENOTFOUND"),
  ["ENOTFOUND"]
);
assert.deepStrictEqual(RECONNECT_CODES, ["ENOTFOUND", "EAI_AGAIN"]);
assert.throws(() => addReconnectCodes(null), /networkErrors/);

console.log("reconnect ok");
