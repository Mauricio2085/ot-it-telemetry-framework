-- Safe to run more than once: init applies it to new databases, and existing
-- databases get it by hand with psql.
--
-- The asset registry is the hierarchy. Plant and area live here. The ETL
-- still reads them from the MQTT topic and rejects the message when they
-- disagree with this table. A reading does not store them again.

CREATE TABLE IF NOT EXISTS assets (
    asset_id    TEXT NOT NULL PRIMARY KEY,
    plant       TEXT NOT NULL,
    area        TEXT NOT NULL,
    asset_type  TEXT NOT NULL,
    criticality TEXT NOT NULL,
    CONSTRAINT assets_type_check
        CHECK (asset_type IN ('motor')),
    CONSTRAINT assets_criticality_check
        CHECK (criticality IN ('critical', 'standard'))
);

-- Rows come from the profile. node-red-etl upserts them. This script does not.

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS.
-- ON DELETE RESTRICT keeps history when someone removes a registry row.
-- ON UPDATE RESTRICT keeps the asset id stable for that same history.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sensor_readings_asset_id_fkey'
    ) THEN
        ALTER TABLE sensor_readings
            ADD CONSTRAINT sensor_readings_asset_id_fkey
            FOREIGN KEY (asset_id) REFERENCES assets (asset_id)
            ON DELETE RESTRICT
            ON UPDATE RESTRICT;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'asset_limits_asset_id_fkey'
    ) THEN
        ALTER TABLE asset_limits
            ADD CONSTRAINT asset_limits_asset_id_fkey
            FOREIGN KEY (asset_id) REFERENCES assets (asset_id)
            ON DELETE RESTRICT
            ON UPDATE RESTRICT;
    END IF;
END
$$;
