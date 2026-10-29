"use strict";

// node-red-contrib-modbus 5.45.2 retries TCP failures whose code is in
// networkErrors. Docker removes the slave name while the container is stopped,
// and the next connect fails with ENOTFOUND, which is not in that list.
const RECONNECT_CODES = ["ENOTFOUND", "EAI_AGAIN"];

function addReconnectCodes(networkErrors) {
  if (!Array.isArray(networkErrors)) {
    throw new Error("reconnect: networkErrors is not a list");
  }
  for (const code of RECONNECT_CODES) {
    if (!networkErrors.includes(code)) networkErrors.push(code);
  }
  return networkErrors;
}

module.exports = { RECONNECT_CODES, addReconnectCodes };
