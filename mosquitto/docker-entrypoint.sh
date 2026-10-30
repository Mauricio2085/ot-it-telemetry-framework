#!/bin/sh
# Build the password file and the ACL from the environment on every start,
# then run the image entrypoint. Both files live on the data volume and are
# not in git.
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

cat > /mosquitto/data/acl <<EOF
user ${MQTT_INGEST_USER}
topic write +/+/+/telemetry

user ${MQTT_ETL_USER}
topic read +/+/+/telemetry
topic write rejected
EOF
chmod 0600 /mosquitto/data/acl

# The password file and the ACL are created on the data volume. The running
# config is a copy of the mounted listener settings plus the ACL path.
sed '/^acl_file /d' /mosquitto/config/mosquitto.conf > /mosquitto/data/mosquitto.conf
printf '\nacl_file /mosquitto/data/acl\n' >> /mosquitto/data/mosquitto.conf

exec /docker-entrypoint.sh /usr/sbin/mosquitto -c /mosquitto/data/mosquitto.conf
