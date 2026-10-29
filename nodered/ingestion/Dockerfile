FROM nodered/node-red:4.0.9

USER root
COPY package.json package-lock.json /opt/nodes/
RUN cd /opt/nodes && npm ci --omit=dev --unsafe-perm --no-update-notifier --no-fund \
    && chown -R node-red:node-red /opt/nodes
USER node-red
