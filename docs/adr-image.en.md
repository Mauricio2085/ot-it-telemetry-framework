# Nodes inside the image

[Español](adr-image.md)

Status: accepted. 2026-10-29.

## Context

The two official Node-RED images started and, when a flow asked for a node that was not there, installed it into `/data`. `/data` is the repository directory mounted into the container. The first start needed a network, and `node_modules` landed in the working directory, outside git.

## Decision

Each Node-RED is its own image, `edge-node-red-ingestion:4.0.9` and `edge-node-red-etl:4.0.9`, on top of `nodered/node-red:4.0.9`. `npm ci` runs when the image is built and installs into `/opt/nodes`, which is not the `/data` mount. Ingestion carries `node-red-contrib-modbus` 5.45.2. The ETL carries `node-red-contrib-postgresql` 0.16.2.

`settings.js` points `nodesDir` at `/opt/nodes` and leaves `autoInstall` false. The editor does not install nodes either. At start, the entrypoint removes `/data/node_modules` if an earlier start left it there, so the same node is not registered twice.

The network is required to build the image. Starting that image does not call npm.

## Check

1. `scripts/check-image.js` checks the Dockerfiles, that `/data/package.json` has no dependencies, and that the Modbus require points at `/opt/nodes`.
2. `docker compose build node-red-ingestion node-red-etl`.
3. `docker run --network none --entrypoint node edge-node-red-ingestion:4.0.9 -e "require('/opt/nodes/node_modules/node-red-contrib-modbus/modbus/core/modbus-client-core.js')"` exits without an error. The same with `node-red-contrib-postgresql` in the ETL image.
4. The startup log does not say `Installing module`.

## Consequences

- A new node is a change to `package.json`, the lockfile, and a new image. It does not come in through the editor.
- TLS, the broker accounts, and the restart policy stay out of this cut.
- The time zone stays. The restart policy is in [adr-alert.en.md](adr-alert.en.md).
