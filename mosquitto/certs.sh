#!/bin/bash
# Create the broker CA and server certificate once. The Node-RED image
# supplies openssl. The key stays on the Mosquitto data volume. Only the
# public CA certificate is written to the shared volume.
set -eu

mkdir -p /mosquitto/data /mqtt-ca

if [ ! -s /mosquitto/data/server.crt ] || [ ! -s /mosquitto/data/server.key ] || [ ! -s /mqtt-ca/ca.crt ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout /mosquitto/data/ca.key \
    -out /mqtt-ca/ca.crt \
    -subj "/CN=edge-mqtt-ca" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  openssl req -newkey rsa:2048 -nodes \
    -keyout /mosquitto/data/server.key \
    -out /mosquitto/data/server.csr \
    -subj "/CN=mosquitto" \
    -addext "subjectAltName=DNS:mosquitto,DNS:localhost" \
    -addext "extendedKeyUsage=serverAuth" \
    -addext "basicConstraints=CA:FALSE"
  openssl x509 -req \
    -in /mosquitto/data/server.csr \
    -CA /mqtt-ca/ca.crt \
    -CAkey /mosquitto/data/ca.key \
    -CAserial /mosquitto/data/ca.srl \
    -CAcreateserial \
    -out /mosquitto/data/server.crt \
    -days 3650 \
    -copy_extensions copy
  rm -f /mosquitto/data/server.csr
fi

chmod 0600 /mosquitto/data/ca.key /mosquitto/data/server.key
chmod 0644 /mqtt-ca/ca.crt /mosquitto/data/server.crt
