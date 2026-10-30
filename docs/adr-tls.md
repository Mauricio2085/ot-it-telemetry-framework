# TLS del broker

[English](adr-tls.en.md)

Estado: aceptada. 2026-10-29.

## Contexto

El broker escuchaba en `1883` sin cifrar. Quien estaba en ese cable leía el usuario, la contraseña y el JSON del motor. Las dos cuentas y el ACL ya decidían quién entra y qué puede decir.

## Decisión

Mosquitto escucha solo en `8883`, con TLS 1.2. El `1883` no se publica. El certificado nombra `mosquitto` y `localhost`. Las Node-RED confían en la CA que lo firma y comprueban ese nombre.

Antes de que Mosquitto arranque, un contenedor de un solo uso crea la CA, la llave y el certificado del servidor. Usa la imagen de Node-RED porque ahí ya está `openssl`. La llave queda en el volumen de datos de Mosquitto. Solo `ca.crt` va al volumen `mqtt_ca`. Un reinicio reutiliza esos archivos. La llave no entra en git. Cada Node-RED monta `mqtt_ca` en lectura y apunta el nodo TLS a `/mqtt-ca/ca.crt`.

Las cuentas no cambian. Desde el host se entra por `localhost:8883` con esa CA y con una de las dos cuentas.

## Comprobación

1. `scripts/check-broker.js` revisa el puerto `8883`, el listener TLS y que los dos flujos usen la CA.
2. Una conexión en claro al `1883` no entra.
3. La cuenta del ETL, con la CA, lee una telemetría por el `8883`. La de ingesta, suscrita a `#`, no recibe mensajes.
4. Una lectura del motor sigue llegando a Grafana.

## Consecuencias

- Un certificado de cliente, HTTPS en Grafana y TLS en TimescaleDB quedan fuera.
- La CA y la llave viven en el volumen. Borrar el volumen crea un certificado nuevo.
- El host puede abrir el `8883`. Los bytes van cifrados y hace falta cuenta.
