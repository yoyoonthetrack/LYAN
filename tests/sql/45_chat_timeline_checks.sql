-- Runs only against the scratch database created by 45_chat_timeline_fixture.sql.
-- Does not connect to production and does not backfill quotes.
CREATE TABLE IF NOT EXISTS public.timeline_check_results (
    name text PRIMARY KEY,
    ok boolean NOT NULL,
    detail text NOT NULL
);
TRUNCATE public.timeline_check_results;

DO $$
DECLARE
    pro uuid := '10000000-0000-4000-8000-000000000001';
    client uuid := '20000000-0000-4000-8000-000000000002';
    older_conv uuid := '30000000-0000-4000-8000-000000000003';
    newer_conv uuid := '30000000-0000-4000-8000-000000000004';
    explicit_conv uuid := '30000000-0000-4000-8000-000000000005';
    quote_d uuid := '40000000-0000-4000-8000-00000000000d';
    quote_e uuid := '40000000-0000-4000-8000-00000000000e';
    proposal_f uuid := '50000000-0000-4000-8000-00000000000f';
    proposal_g uuid := '50000000-0000-4000-8000-000000000010';
    v_token uuid;
    reused uuid;
    refused boolean;
    failure text;
    event_count integer;
    event_conv uuid;
    first_decision uuid;
    second_decision uuid;
    decision_type text;
    decision_count integer;
BEGIN
    INSERT INTO public.conversations (id, created_at) VALUES
        (older_conv, now() - interval '2 days'),
        (newer_conv, now()),
        (explicit_conv, now() - interval '1 day');
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES
        (older_conv, pro), (older_conv, client),
        (newer_conv, pro), (newer_conv, client),
        (explicit_conv, pro), (explicit_conv, client);
    INSERT INTO auth.session (uid) VALUES (client);

    INSERT INTO public.quotes (id, provider_id, requester_id, status, description)
    VALUES (quote_d, pro, client, 'SENT', 'devis sans conversation');
    SELECT count(*) INTO event_count FROM public.messages WHERE entity_id = quote_d;
    INSERT INTO public.timeline_check_results VALUES (
        'D',
        event_count = 0,
        'events=' || event_count
    );

    INSERT INTO public.quotes (id, conversation_id, provider_id, requester_id, status, description)
    VALUES (quote_e, explicit_conv, pro, client, 'SENT', 'devis rattache');
    SELECT count(*) INTO event_count FROM public.messages WHERE entity_id = quote_e;
    SELECT conversation_id INTO event_conv FROM public.messages WHERE entity_id = quote_e LIMIT 1;
    INSERT INTO public.timeline_check_results VALUES (
        'E',
        event_count = 1 AND event_conv = explicit_conv,
        'events=' || event_count || ' conversation=' || COALESCE(event_conv::text, 'null')
    );

    v_token := public.lyann_timeline_claim();
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, entity_type, entity_id)
    VALUES (explicit_conv, client, 'Fonds sécurisés', 'payment_secured', 'payment', '60000000-0000-4000-8000-0000000000a1');
    SELECT count(*) INTO event_count
    FROM public.messages
    WHERE message_type = 'payment_secured'
      AND entity_id = '60000000-0000-4000-8000-0000000000a1';
    SELECT count(*) INTO decision_count FROM private.timeline_write_tokens WHERE token = v_token;
    INSERT INTO public.timeline_check_results VALUES (
        'A',
        event_count = 1 AND decision_count = 0,
        'events=' || event_count || ' token_rows=' || decision_count
    );

    BEGIN
        PERFORM set_config('lyann.timeline_token', v_token::text, true);
        INSERT INTO public.messages (conversation_id, sender_id, content, message_type, entity_type, entity_id)
        VALUES (explicit_conv, client, 'Fonds sécurisés', 'payment_secured', 'payment', '60000000-0000-4000-8000-0000000000b2');
        INSERT INTO public.timeline_check_results VALUES ('B', false, 'insert accepted');
    EXCEPTION WHEN insufficient_privilege THEN
        SELECT count(*) INTO event_count FROM public.messages WHERE message_type = 'payment_secured';
        INSERT INTO public.timeline_check_results VALUES (
            'B',
            event_count = 1,
            'refused events=' || event_count
        );
    END;

    refused := false;
    failure := '';
    PERFORM set_config('lyann.timeline_token', '', true);
    SET LOCAL ROLE authenticated;
    BEGIN
        INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
        VALUES (explicit_conv, client, 'Fonds sécurisés', 'payment_secured');
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS failure = MESSAGE_TEXT;
        refused := failure = 'reserved timeline event';
    END;
    RESET ROLE;
    INSERT INTO public.timeline_check_results VALUES ('C', refused, COALESCE(failure, 'insert accepted'));

    INSERT INTO public.messages (id, conversation_id, sender_id, content, message_type)
    VALUES (proposal_f, explicit_conv, pro, 'Visite proposée', 'visit_proposed');
    first_decision := public.respond_to_visit(proposal_f, 'decline');
    second_decision := public.respond_to_visit(proposal_f, 'accept');
    SELECT count(*) INTO decision_count
    FROM public.messages
    WHERE entity_type = 'visit'
      AND entity_id = proposal_f
      AND message_type IN ('visit_accepted', 'visit_declined');
    SELECT message_type INTO decision_type
    FROM public.messages
    WHERE entity_type = 'visit' AND entity_id = proposal_f
    LIMIT 1;
    INSERT INTO public.timeline_check_results VALUES (
        'F',
        first_decision = second_decision AND decision_count = 1 AND decision_type = 'visit_declined',
        'count=' || decision_count || ' type=' || COALESCE(decision_type, 'null')
    );

    INSERT INTO public.messages (id, conversation_id, sender_id, content, message_type)
    VALUES (proposal_g, explicit_conv, pro, 'Nouvelle visite', 'visit_proposed');
    first_decision := public.respond_to_visit(proposal_g, 'accept');
    SELECT count(*) INTO decision_count
    FROM public.messages
    WHERE entity_type = 'visit' AND entity_id = proposal_g;
    SELECT message_type INTO decision_type
    FROM public.messages
    WHERE entity_type = 'visit' AND entity_id = proposal_g
    LIMIT 1;
    INSERT INTO public.timeline_check_results VALUES (
        'G',
        first_decision IS NOT NULL AND decision_count = 1 AND decision_type = 'visit_accepted',
        'count=' || decision_count || ' type=' || COALESCE(decision_type, 'null')
    );

    refused := false;
    failure := '';
    PERFORM set_config('lyann.timeline_token', '', true);
    SET LOCAL ROLE authenticated;
    BEGIN
        INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
        VALUES (explicit_conv, client, 'Note interne', 'system');
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS failure = MESSAGE_TEXT;
        refused := failure = 'reserved timeline event';
    END;
    RESET ROLE;
    SELECT count(*) INTO event_count FROM public.messages WHERE message_type = 'system';
    INSERT INTO public.timeline_check_results VALUES (
        'H',
        refused AND event_count = 0,
        COALESCE(failure, 'insert accepted') || ' events=' || event_count
    );

    v_token := public.lyann_timeline_claim();
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
    VALUES (explicit_conv, client, 'Note serveur', 'system');
    SELECT count(*) INTO event_count FROM public.messages WHERE message_type = 'system';
    SELECT count(*) INTO decision_count FROM private.timeline_write_tokens WHERE token = v_token;
    INSERT INTO public.timeline_check_results VALUES (
        'I',
        event_count = 1 AND decision_count = 0,
        'events=' || event_count || ' token_rows=' || decision_count
    );

    SELECT token INTO reused FROM private.timeline_write_tokens LIMIT 1;
    IF reused IS NOT NULL THEN
        RAISE EXCEPTION 'a write token was left behind';
    END IF;
END $$;

SELECT name, ok, detail FROM public.timeline_check_results ORDER BY name;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.timeline_check_results WHERE ok IS NOT TRUE)
       OR (SELECT count(*) FROM public.timeline_check_results) <> 9 THEN
        RAISE EXCEPTION 'timeline checks failed';
    END IF;
END $$;
