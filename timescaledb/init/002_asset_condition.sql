-- Safe to run more than once: init applies it to new databases, and existing
-- databases get it by hand with psql.

CREATE TABLE IF NOT EXISTS asset_limits (
    asset_id     TEXT             NOT NULL,
    signal       TEXT             NOT NULL,
    unit         TEXT             NOT NULL,
    alarm_low    DOUBLE PRECISION,
    warning_low  DOUBLE PRECISION,
    warning_high DOUBLE PRECISION,
    alarm_high   DOUBLE PRECISION,
    reference    TEXT             NOT NULL DEFAULT 'unknown',
    PRIMARY KEY (asset_id, signal),
    CONSTRAINT asset_limits_has_limit_check
        CHECK (num_nonnulls(alarm_low, warning_low, warning_high, alarm_high) > 0),
    CONSTRAINT asset_limits_low_order_check
        CHECK (alarm_low <= warning_low),
    CONSTRAINT asset_limits_high_order_check
        CHECK (warning_high <= alarm_high),
    CONSTRAINT asset_limits_band_check
        CHECK (warning_low < warning_high)
);

-- Columns added after the table first shipped go through ALTER TABLE, because
-- CREATE TABLE IF NOT EXISTS leaves an existing table untouched.
ALTER TABLE asset_limits ADD COLUMN IF NOT EXISTS nominal DOUBLE PRECISION;

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'asset_limits_nominal_check'
    ) THEN
        ALTER TABLE asset_limits ADD CONSTRAINT asset_limits_nominal_check
            CHECK (nominal > warning_low AND nominal < warning_high);
    END IF;
END
$$;

-- The catalog no longer closes signal names. A name is valid when it has a row.
ALTER TABLE asset_limits DROP CONSTRAINT IF EXISTS asset_limits_signal_check;

-- Rows come from the profile. node-red-etl upserts them. This script does not.

-- One row per asset and signal that has limits. Each signal is judged on its
-- 1-minute average, or 'stale' when no usable reading arrived in that minute.
-- Limits are inclusive. Readings with quality 'bad' stay in sensor_readings
-- but are left out of the averages; 'uncertain' ones are used and counted.
-- Limit usage is the share of the margin between nominal and the alarm limit
-- that the average has consumed: 0 % at nominal, 100 % or more in alarm.
-- A new signal is a new row. The column list changed, so replace the view.
DROP VIEW IF EXISTS asset_condition;
CREATE VIEW asset_condition AS
WITH recent AS (
    SELECT asset_id,
           signal,
           count(*)                                      AS samples_1m,
           count(*) FILTER (WHERE quality = 'uncertain') AS uncertain_1m,
           count(*) FILTER (WHERE quality = 'bad')       AS bad_1m,
           CASE
               WHEN bool_or(quality = 'bad')       THEN 'bad'
               WHEN bool_or(quality = 'uncertain') THEN 'uncertain'
               ELSE 'good'
           END                                           AS data_quality,
           avg(value) FILTER (WHERE quality <> 'bad')    AS value_avg
    FROM sensor_readings
    WHERE time > now() - INTERVAL '1 minute'
    GROUP BY asset_id, signal
),
judged AS (
    SELECT l.asset_id,
           l.signal,
           r.value_avg,
           COALESCE(r.samples_1m, 0)    AS samples_1m,
           COALESCE(r.uncertain_1m, 0)  AS uncertain_1m,
           COALESCE(r.bad_1m, 0)        AS bad_1m,
           r.data_quality,
           CASE
               WHEN r.value_avg >= l.alarm_high   OR r.value_avg <= l.alarm_low   THEN 'alarm'
               WHEN r.value_avg >= l.warning_high OR r.value_avg <= l.warning_low THEN 'warning'
               WHEN r.value_avg IS NOT NULL                                       THEN 'normal'
           END AS state,
           CASE WHEN l.nominal IS NOT NULL AND r.value_avg IS NOT NULL THEN
               GREATEST(
                   0,
                   (r.value_avg - l.nominal) / NULLIF(l.alarm_high - l.nominal, 0),
                   (l.nominal - r.value_avg) / NULLIF(l.nominal - l.alarm_low, 0)
               )
           END AS usage
    FROM asset_limits l
    LEFT JOIN recent r
        ON r.asset_id = l.asset_id AND r.signal = l.signal
)
SELECT j.asset_id,
       j.signal,
       CASE j.state
           WHEN 'alarm'   THEN 'alarm'
           WHEN 'warning' THEN 'warning'
           WHEN 'normal'  THEN 'normal'
           ELSE 'stale'
       END AS condition,
       round(j.value_avg::numeric, 2) AS value_avg,
       j.samples_1m,
       last_reading.time AS last_seen,
       now() AS evaluated_at,
       round((j.usage * 100)::numeric, 1) AS limit_usage_pct,
       -- Each signal is published every 5 s, so a 1-minute window catches
       -- 11 or 12 samples; 11 already counts as full availability.
       round(LEAST(j.samples_1m * 100.0 / 11, 100), 0) AS data_availability_pct,
       j.uncertain_1m,
       j.bad_1m,
       j.data_quality
FROM judged j
LEFT JOIN LATERAL (
    SELECT s.time
    FROM sensor_readings s
    WHERE s.asset_id = j.asset_id AND s.signal = j.signal
    ORDER BY s.time DESC
    LIMIT 1
) AS last_reading ON TRUE;
