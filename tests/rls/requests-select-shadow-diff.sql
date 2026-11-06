-- READ-ONLY. Staging (tdktfbtqceldlaeqjtow) only. Writes nothing, changes no role, no policy.
-- Evaluates, for every profile and every request, (a) the SELECT policy that is live today and
-- (b) the proposed one (migration 90), with auth.uid() replaced by the profile id.
-- Run it BEFORE and AFTER applying 90: the "live_ok" column must equal the proposed column once applied.
-- Expected result: rows lost by a user who has a legitimate relationship = 0.
WITH admins AS (
  SELECT am.user_id AS uid
  FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
  WHERE am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER')
), pairs AS (
  SELECT p.id AS uid, r.*
  FROM public.profiles p CROSS JOIN public.requests r
), eval AS (
  SELECT x.uid, x.id AS request_id, x.visibility, x.status, x.public_moderation_status AS moderation,
         (x.target_user_id IS NOT NULL) AS has_target,
         -- policy live today: "Requests are viewable by everyone"
         CASE
           WHEN x.requester_id = x.uid AND x.public_moderation_status IS DISTINCT FROM 'rejected' THEN true
           WHEN x.public_moderation_status IS DISTINCT FROM 'approved' THEN EXISTS (SELECT 1 FROM admins a WHERE a.uid = x.uid)
           ELSE true
         END AS live_ok,
         -- proposed policy (migration 90). NULL counts as denied, as in RLS.
         COALESCE(   (x.requester_id = x.uid AND x.public_moderation_status IS DISTINCT FROM 'rejected')
          OR EXISTS (SELECT 1 FROM admins a WHERE a.uid = x.uid)
          OR (x.public_moderation_status = 'approved' AND (
                (x.visibility = 'PUBLIC' AND x.status = 'OPEN' AND x.safety_status = 'SAFE' AND x.target_user_id IS NULL
                 AND x.classification_status IN ('CLASSIFIED','UNCLASSIFIED'))
             OR (x.safety_status IS DISTINCT FROM 'PROHIBITED' AND (
                    x.target_user_id = x.uid
                 OR EXISTS (SELECT 1 FROM public.request_invitations i WHERE i.request_id = x.id AND i.recipient_id = x.uid AND i.status <> 'CANCELLED')
                 OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.request_id = x.id AND q.provider_id = x.uid)
                 OR EXISTS (SELECT 1 FROM public.missions m WHERE m.related_request_id = x.id AND m.helper_id = x.uid)))))
         , false) AS new_ok,
         concat_ws('+',
           CASE WHEN x.requester_id = x.uid THEN 'author' END,
           CASE WHEN x.target_user_id = x.uid THEN 'target' END,
           CASE WHEN EXISTS (SELECT 1 FROM public.request_invitations i WHERE i.request_id = x.id AND (i.recipient_id = x.uid OR i.requester_id = x.uid)) THEN 'invitation' END,
           CASE WHEN EXISTS (SELECT 1 FROM public.quotes q WHERE q.request_id = x.id AND (q.provider_id = x.uid OR q.requester_id = x.uid)) THEN 'quote' END,
           CASE WHEN EXISTS (SELECT 1 FROM public.missions m WHERE m.related_request_id = x.id AND (m.helper_id = x.uid OR m.requester_id = x.uid)) THEN 'mission' END,
           CASE WHEN EXISTS (SELECT 1 FROM admins a WHERE a.uid = x.uid) THEN 'admin' END) AS relations
  FROM pairs x
)
SELECT CASE WHEN live_ok AND NOT new_ok THEN 'LOST' WHEN NOT live_ok AND new_ok THEN 'GAINED' WHEN live_ok THEN 'KEPT' ELSE 'DENIED_BOTH' END AS outcome,
       CASE WHEN relations = '' THEN 'third party' ELSE relations END AS relationship,
       (live_ok AND NOT new_ok AND relations <> '') AS regression,
       visibility, status, moderation, has_target, count(*) AS pairs, count(DISTINCT request_id) AS requests
FROM eval
GROUP BY 1,2,3,4,5,6,7
ORDER BY 3 DESC, 1, 2, 4, 5;
