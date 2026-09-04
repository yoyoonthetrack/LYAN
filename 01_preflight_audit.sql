-- ============================================================================
-- LYANN DOM — 01_PREFLIGHT_AUDIT.SQL (READ ONLY AUDIT)
-- Exécuter ce script dans le SQL Editor Supabase AVANT la migration 02.
-- Aucun changement de schéma ni écriture de données n'est effectué.
-- ============================================================================

WITH 
dup_participants AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM (
    SELECT conversation_id, user_id
    FROM public.conversation_participants
    GROUP BY conversation_id, user_id
    HAVING COUNT(*) > 1
  ) d
),
orphan_part_users AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.conversation_participants cp
  LEFT JOIN public.profiles p ON cp.user_id = p.id
  WHERE p.id IS NULL
),
orphan_part_convs AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.conversation_participants cp
  LEFT JOIN public.conversations c ON cp.conversation_id = c.id
  WHERE c.id IS NULL
),
orphan_conversations AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.conversations c
  LEFT JOIN public.conversation_participants cp ON c.id = cp.conversation_id
  WHERE cp.conversation_id IS NULL
),
orphan_msg_senders AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.messages m
  LEFT JOIN public.profiles p ON m.sender_id = p.id
  WHERE m.sender_id IS NOT NULL AND p.id IS NULL
),
orphan_msg_convs AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.messages m
  LEFT JOIN public.conversations c ON m.conversation_id = c.id
  WHERE m.conversation_id IS NOT NULL AND c.id IS NULL
),
invalid_roles AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.profiles
  WHERE role IS NOT NULL 
    AND role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OWNER', 'SUPPORT', 'FINANCE', 'MODERATION', 'EMPLOYEE', 'USER')
),
invalid_accounts AS (
  SELECT COALESCE(COUNT(*), 0) AS cnt
  FROM public.profiles
  WHERE account_type IS NOT NULL 
    AND account_type NOT IN ('real', 'seed', 'system')
)
SELECT 'duplicate_participants' AS metric, (SELECT cnt FROM dup_participants) AS anomaly_count
UNION ALL
SELECT 'orphan_participant_users', (SELECT cnt FROM orphan_part_users)
UNION ALL
SELECT 'orphan_participant_conversations', (SELECT cnt FROM orphan_part_convs)
UNION ALL
SELECT 'orphan_conversations', (SELECT cnt FROM orphan_conversations)
UNION ALL
SELECT 'orphan_message_senders', (SELECT cnt FROM orphan_msg_senders)
UNION ALL
SELECT 'orphan_message_conversations', (SELECT cnt FROM orphan_msg_convs)
UNION ALL
SELECT 'invalid_roles', (SELECT cnt FROM invalid_roles)
UNION ALL
SELECT 'invalid_account_types', (SELECT cnt FROM invalid_accounts);
