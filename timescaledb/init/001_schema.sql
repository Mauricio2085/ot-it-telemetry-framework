CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS sensor_readings (
    time     TIMESTAMPTZ      NOT NULL,
    asset_id TEXT             NOT NULL,
    signal   TEXT             NOT NULL,
    value    DOUBLE PRECISION,
    quality  TEXT             NOT NULL
);

SELECT create_hypertable(
    'sensor_readings',
    by_range('time', INTERVAL '1 day'),
    if_not_exists => TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_asset_signal_time_idx
    ON sensor_readings (asset_id, signal, time DESC);
