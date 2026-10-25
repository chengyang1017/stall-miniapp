-- Source only. Apply after 013; do not auto-run.
BEGIN;
CREATE TABLE merchant_archives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES stores(id),
 actor_subject text NOT NULL,
 client_key uuid NOT NULL,
 request jsonb NOT NULL,
 kind text NOT NULL CHECK (kind IN ('catalog-json','catalog-csv','settings-json','orders-json','archive-json')),
 status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','ready','failed')),
 filename text,
 bytes integer NOT NULL DEFAULT 0 CHECK (bytes BETWEEN 0 AND 4194304),
 sha256 char(64),
 content bytea,
 failure_code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days',
 UNIQUE(store_id,client_key),
 CHECK (content IS NULL OR octet_length(content)=bytes)
);
CREATE INDEX merchant_archives_history ON merchant_archives(store_id,created_at DESC,id DESC);
CREATE TABLE merchant_archive_actions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id uuid NOT NULL REFERENCES stores(id),
 action text NOT NULL CHECK (action IN ('generate','preflight','download')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX merchant_archive_rate ON merchant_archive_actions(store_id,action,created_at DESC);
COMMIT;
