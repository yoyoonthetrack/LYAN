BEGIN;
INSERT INTO auth.users(id,email) VALUES
('86000000-0000-4000-a000-000000000001','store-one@example.invalid'),
('86000000-0000-4000-a000-000000000002','store-two@example.invalid');
DO $$
DECLARE u uuid:='86000000-0000-4000-a000-000000000001'; other uuid:='86000000-0000-4000-a000-000000000002'; a uuid; b uuid; m record;
BEGIN
 a:=lyann_store_account(u);b:=lyann_store_account(other);
 IF a<>lyann_store_account(u) THEN RAISE EXCEPTION 'account token not stable'; END IF;
 PERFORM lyann_apply_store_subscription(u,a,'apple',repeat('a',64),'test.plus','PLUS','active',now()+interval '1 hour',now()-interval '4 seconds','Sandbox');
 PERFORM lyann_apply_store_subscription(u,a,'google',repeat('b',64),'test.pro','PRO','active',now()+interval '1 hour',now()-interval '3 seconds','Test');
 PERFORM lyann_apply_store_subscription(u,a,'apple',repeat('a',64),'test.plus','PLUS','expired',now()-interval '1 hour',now()-interval '2 seconds','Sandbox');
 SELECT * INTO m FROM lyann_plan_memberships WHERE user_id=u;
 IF m.plan<>'PRO' OR m.status<>'active' THEN RAISE EXCEPTION 'expired restore downgraded active Pro'; END IF;
 PERFORM lyann_apply_store_subscription(u,a,'google',repeat('b',64),'test.pro','PRO','revoked',now()+interval '1 hour',now(),'Test');
 PERFORM lyann_apply_store_subscription(u,a,'google',repeat('b',64),'test.pro','PRO','active',now()+interval '1 hour',now()-interval '1 second','Test');
 SELECT * INTO m FROM lyann_plan_memberships WHERE user_id=u;
 IF m.status<>'revoked' THEN RAISE EXCEPTION 'older response reactivated revoked purchase'; END IF;
 BEGIN
  PERFORM lyann_apply_store_subscription(other,b,'apple',repeat('a',64),'test.plus','PLUS','active',now()+interval '1 hour',now(),'Sandbox');
  RAISE EXCEPTION 'purchase transferred accounts';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM lyann_apply_store_subscription(u,a,'apple',repeat('c',64),'test.plus','PLUS','active',now()+interval '1 hour',now(),'Production');
  RAISE EXCEPTION 'production accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF has_function_privilege('authenticated','public.lyann_apply_store_subscription(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text)','EXECUTE')
 OR has_table_privilege('anon','public.lyann_store_accounts','SELECT') THEN RAISE EXCEPTION 'store state exposed'; END IF;
END $$;
ROLLBACK;
