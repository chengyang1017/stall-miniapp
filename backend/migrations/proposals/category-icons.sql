-- Proposal only. Not registered in any runner or Phase 8 manifest. Do not auto-apply.
-- Apply only after explicit operator review, with the normal approved migration role.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE categories ADD COLUMN icon_key text
  CONSTRAINT categories_icon_key_check CHECK (icon_key IS NULL OR icon_key IN ('grid','drink','bowl','snack','bottle','apple','snowflake','cloche','cake','noodle','rice','lunchbox','fries','sunrise','coffee','bubble-tea','bread','seasoning','wine','more'));
COMMENT ON COLUMN categories.icon_key IS 'Optional built-in category icon key; NULL keeps automatic legacy presentation';
COMMIT;
