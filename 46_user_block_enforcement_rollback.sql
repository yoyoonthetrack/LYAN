-- Rollback of 46_user_block_enforcement.sql.
-- Not an executable undo. Running this file changes nothing.
-- Dropping the message trigger or is_blocked_between would remove a protection
-- that 51 and 52 still rely on, and that members still need.
-- No rows are deleted.

BEGIN;

DO $$
BEGIN
    RAISE EXCEPTION 'Retour arrière 46 non exécuté. Il retirerait le refus des messages entre membres bloqués, protection encore nécessaire. Aucun objet n''a été supprimé.';
END $$;

COMMIT;
