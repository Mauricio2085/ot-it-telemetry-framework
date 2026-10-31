# Aviso por correo local

[English](adr-alert.en.md)

Estado: aceptada. 2026-10-30.

## Contexto

Un aviso o una alarma solo se veían en el tablero. Quien no lo tenía abierto no se enteraba. El demo tiene que mostrar ese aviso sin el correo de la planta, sin WhatsApp y sin un CMMS.

La vista `asset_condition` ya juzga el promedio de un minuto y deja fuera las lecturas `bad`. El fallo del sensor en el minuto 1 no debe generar correo.

## Decisión

Grafana envía el correo a un buzón local, Mailpit `v1.32.0`, en `it-net`. El SMTP `1025` no se publica. La pantalla del buzón es `http://localhost:8025`.

La regla lee `asset_condition` donde `condition` es `warning` o `alarm`. Cada señal es un aviso distinto: el correo nombra el activo, la señal, el estado y el promedio. Al volver a la banda, la fila desaparece y Grafana manda el resuelto en el siguiente medio minuto. `stale` no avisa. La regla no espera un segundo minuto: la vista ya esperó el primero. Mientras el estado no cambia, no se repite antes de cuatro horas.

Los servicios que se quedan corriendo usan `restart: unless-stopped`. El contenedor del certificado sigue en `restart: "no"`. Grafana sigue en HTTP en `3001`.

## Comprobación

1. `scripts/check-alert.js` revisa el buzón, el SMTP, la regla y la política de reinicio.
2. `http://localhost:8025` muestra el buzón. Grafana sigue en `http://localhost:3001`.
3. Con el motor en aviso o alarma llega un correo con el activo, la señal, el estado y el valor. Al volver a la banda llega el resuelto.
4. El pico `bad` del minuto 1 no manda correo.

## Consecuencias

- El correo de la planta es cambiar el SMTP de Grafana. El buzón local es solo el demo.
- En Docker Desktop con WSL, un arranque al boot puede montar vacíos los bind mounts: TimescaleDB no arranca y Grafana queda sin tablero. Después de un reinicio de esa máquina, `docker compose up -d` sigue haciendo falta.
- El cifrado de la pantalla de Grafana queda fuera.
