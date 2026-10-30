# Cuentas del broker y puertos de taller

[English](adr-access.en.md)

Estado: aceptada. 2026-10-29.

## Contexto

El editor de ingesta, el editor del ETL y el esclavo Modbus se publicaban en el host, en `1881`, `1882` y `1502`. El broker tenía una sola cuenta. Quien la tenía publicaba y se suscribía a cualquier tópico. El puerto `1883` se publicaba en claro.

La ingesta solo publica `plant/area/asset/telemetry`. El ETL solo se suscribe a `+/+/+/telemetry` y publica los rechazos en el tópico `rejected`.

## Decisión

El host deja de publicar `1881`, `1882` y `1502`. Esos programas siguen en sus redes Docker y se alcanzan por nombre. Grafana sigue en `3001`. TimescaleDB sigue en `127.0.0.1:5435`. El cifrado del broker está en [adr-tls.md](adr-tls.md).

Hay dos cuentas. Al arrancar, el entrypoint escribe el archivo de contraseñas y el ACL en el volumen de datos, y arranca con una copia de `mosquitto.conf` que apunta a ese ACL.

| Cuenta | Puede |
| --- | --- |
| Ingesta | publicar en `+/+/+/telemetry` |
| ETL | suscribirse a `+/+/+/telemetry` y publicar en `rejected` |

La ingesta no publica en `rejected`. El ETL no publica telemetría ni lee `rejected`. Mosquitto acepta una suscripción a `#` y luego no entrega los tópicos que esa cuenta no puede leer: la ingesta no recibe nada, y el ETL solo recibe telemetría. Una regla `topic deny #` también veta la publicación permitida, así que no se usa.

Dentro de cada Node-RED las variables siguen llamándose `MQTT_USER` y `MQTT_PASSWORD`. El compose pone ahí la cuenta de ese servicio.

## Comprobación

1. `scripts/check-broker.js` revisa los puertos, el cableado de las cuentas y las líneas del ACL.
2. Una lectura del motor sigue llegando a Grafana.
3. La cuenta de ingesta no publica en `rejected` y, suscrita a `#`, no recibe mensajes. La cuenta del ETL no publica en `.../telemetry`.
4. El host no escucha en `1881`, `1882` ni `1502`.

## Consecuencias

- El listener TLS está en [adr-tls.md](adr-tls.md). Este corte no lo abría.
- La ruta `prohibit` y `restart: on-failure` se quedan como están.
- Un rechazo se ve en `rejected_messages`. Ninguna de las dos cuentas puede suscribirse a `rejected`.
- Una ingesta comprometida puede publicar lecturas en los tópicos de telemetría. No puede escuchar la planta ni escribir rechazos.
