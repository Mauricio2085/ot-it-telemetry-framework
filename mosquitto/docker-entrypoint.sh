#!/bin/sh
# Build the password file and the ACL from the environment on every start,
# then run the image entrypoint. The certificate is created beforehand.
# The key, the password file, and the ACL live on the data volume and are
# not in git. The public CA certificate is the only file on the shared volume.
set -eu

if [ -z "${MQTT_INGEST_USER:-}" ] || [ -z "${MQTT_INGEST_PASSWORD:-}" ] \
  || [ -z "${MQTT_ETL_USER:-}" ] || [ -z "${MQTT_ETL_PASSWORD:-}" ]; then
  echo "mosquitto: MQTT_INGEST_USER, MQTT_INGEST_PASSWORD, MQTT_ETL_USER, and MQTT_ETL_PASSWORD are required" >&2
  exit 1
fi

check_user() {
  case "$1" in
    *[!A-Za-z0-9_-]*)
      echo "mosquitto: $2 must contain only letters, digits, _ and -" >&2
      exit 1
      ;;
  esac
}

check_user "$MQTT_INGEST_USER" MQTT_INGEST_USER
check_user "$MQTT_ETL_USER" MQTT_ETL_USER

if [ "$MQTT_INGEST_USER" = "$MQTT_ETL_USER" ]; then
  echo "mosquitto: ingestion and ETL need different usernames" >&2
  exit 1
fi

mosquitto_passwd -b -c /mosquitto/data/passwd "$MQTT_INGEST_USER" "$MQTT_INGEST_PASSWORD"
mosquitto_passwd -b /mosquitto/data/passwd "$MQTT_ETL_USER" "$MQTT_ETL_PASSWORD"
chmod 0600 /mosquitto/data/passwd

if [ ! -s /mosquitto/data/server.crt ] || [ ! -s /mosquitto/data/server.key ] || [ ! -s /mqtt-ca/ca.crt ]; then
  echo "mosquitto: TLS certificate is missing" >&2
  exit 1
fi

cat > /mosquitto/data/acl <<EOF
user ${MQTT_INGEST_USER}
topic write +/+/+/telemetry

user ${MQTT_ETL_USER}
topic read +/+/+/telemetry
topic write rejected
EOF
chmod 0600 /mosquitto/data/acl

# Password file, key, and ACL are on the data volume. The running config is a
# copy of the mounted settings plus the TLS listener and the ACL path.
sed -e '/^listener /d' -e '/^certfile /d' -e '/^keyfile /d' -e '/^tls_version /d' -e '/^acl_file /d' \
  /broker.conf > /mosquitto/data/mosquitto.conf
printf '\nlistener 8883\ncertfile /mosquitto/data/server.crt\nkeyfile /mosquitto/data/server.key\ntls_version tlsv1.2\nacl_file /mosquitto/data/acl\n' \
  >> /mosquitto/data/mosquitto.conf

exec /docker-entrypoint.sh /usr/sbin/mosquitto -c /mosquitto/data/mosquitto.conf
