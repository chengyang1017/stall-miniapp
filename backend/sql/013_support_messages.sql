BEGIN;
CREATE TABLE support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_seq bigint NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  customer_read_seq bigint NOT NULL DEFAULT 0,
  merchant_read_seq bigint NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(store_id, customer_subject),
  CHECK (customer_read_seq BETWEEN 0 AND last_seq AND merchant_read_seq BETWEEN 0 AND last_seq)
);
CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES support_conversations(id),
  seq bigint NOT NULL CHECK (seq > 0),
  sender_role text NOT NULL CHECK (sender_role IN ('customer','merchant')),
  sender_subject text NOT NULL,
  client_key uuid NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type = 'text'),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(conversation_id,seq),
  UNIQUE(conversation_id,sender_subject,client_key)
);
CREATE INDEX support_inbox_idx ON support_conversations(store_id,last_message_at DESC,id DESC);
CREATE INDEX support_sender_rate_idx ON support_messages(sender_subject,created_at DESC);
CREATE INDEX support_unread_idx ON support_messages(conversation_id,sender_role,seq);
COMMIT;
