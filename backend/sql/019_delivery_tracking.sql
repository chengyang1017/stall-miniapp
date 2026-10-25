-- Phase31. Apply after 018 (009 supplies the orders(store_id,id) key).
-- Source only. No historical coordinates or movement trail is stored.
BEGIN;
CREATE TABLE delivery_tracking_tasks (
 order_id uuid PRIMARY KEY,
 store_id uuid NOT NULL,
 courier_subject text NOT NULL,
 assigned_by text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id) ON DELETE CASCADE
);
CREATE TABLE delivery_tracking_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES delivery_tracking_tasks(order_id) ON DELETE CASCADE,
 store_id uuid NOT NULL,
 courier_subject text NOT NULL,
 control_hash text NOT NULL,
 state text NOT NULL CHECK(state IN ('active','paused','ended')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 paused_at timestamptz,
 ended_at timestamptz,
 last_location_at timestamptz,
 sampled_at timestamptz,
 seq bigint NOT NULL DEFAULT 0 CHECK(seq>=0),
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180),
 accuracy double precision CHECK(accuracy>0 AND accuracy<=200),
 coordinate_system text NOT NULL DEFAULT 'gcj02' CHECK(coordinate_system='gcj02'),
 FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX tracking_one_order ON delivery_tracking_sessions(order_id) WHERE state<>'ended';
CREATE UNIQUE INDEX tracking_one_courier ON delivery_tracking_sessions(courier_subject) WHERE state<>'ended';
CREATE INDEX tracking_retention ON delivery_tracking_sessions(started_at,ended_at);
CREATE INDEX tracking_order_latest ON delivery_tracking_sessions(order_id,started_at DESC,id DESC);
CREATE INDEX tracking_courier_recent ON delivery_tracking_sessions(courier_subject,started_at DESC);
-- Atomic revocation regardless of which existing order API changes status.
CREATE FUNCTION end_order_tracking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.fulfillment_status<>'delivering' THEN
  UPDATE delivery_tracking_sessions SET state='ended',ended_at=clock_timestamp(),latitude=NULL,longitude=NULL,accuracy=NULL,sampled_at=NULL
   WHERE order_id=NEW.id AND state<>'ended';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER end_order_tracking_on_status AFTER UPDATE OF fulfillment_status ON orders
 FOR EACH ROW EXECUTE FUNCTION end_order_tracking();
COMMIT;
