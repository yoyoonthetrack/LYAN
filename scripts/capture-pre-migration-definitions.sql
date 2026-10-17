-- Read-only capture to run in the SQL editor before applying 49 or 52.
-- It does not insert, update or delete anything.
-- Save the result outside the repository. Do not paste connection secrets with it.
-- A rollback that restores lyann_notify_on_message is certified only when this
-- result was taken from the database that will receive the migration.

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       md5(pg_get_functiondef(p.oid)) AS definition_hash,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'lyann_notify_on_message',
      'accept_request_quote',
      'get_or_create_conversation',
      'is_blocked_between',
      'chat_attachment_path_ok'
  )
ORDER BY p.proname, arguments;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'messages'
  AND column_name IN ('message_type', 'entity_type', 'entity_id', 'metadata', 'attachment_type')
ORDER BY column_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stripe_webhook_events'
  AND column_name = 'status';
