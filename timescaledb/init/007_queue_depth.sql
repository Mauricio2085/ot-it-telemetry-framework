-- Safe to run more than once: init applies it to new databases, and existing
-- databases get it by hand with psql.
--
-- One row. The ETL rewrites it every two seconds with the number of accepted
-- readings waiting in the spool. Grafana reads that row. While TimescaleDB is
-- down the row cannot move, and the dashboard cannot show it.

CREATE TABLE IF NOT EXISTS queue_depth (
    id         SMALLINT    PRIMARY KEY,
    depth      INTEGER     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT queue_depth_one_row CHECK (id = 1),
    CONSTRAINT queue_depth_nonnegative CHECK (depth >= 0)
);

INSERT INTO queue_depth (id, depth, updated_at)
VALUES (1, 0, now())
ON CONFLICT (id) DO NOTHING;
