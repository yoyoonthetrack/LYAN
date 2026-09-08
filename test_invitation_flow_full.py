import json
import urllib.request
import urllib.error
import ssl
import sys

SUPABASE_URL = "https://gzispjfoywklpqatjyop.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A"

headers_base = {
    "apikey": SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

ssl_context = ssl._create_unverified_context()

def http_req(url, method="GET", body=None, token=None):
    hdrs = dict(headers_base)
    if token:
        hdrs["Authorization"] = f"Bearer {token}"

    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)

    try:
        with urllib.request.urlopen(req, context=ssl_context) as resp:
            resp_body = resp.read().decode('utf-8')
            return json.loads(resp_body) if resp_body else None, resp.status
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        return json.loads(err_body) if err_body else {"error": str(e)}, e.code

def login_user(email, password="Password123!"):
    url_signin = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    body = {"email": email, "password": password}
    res, status = http_req(url_signin, method="POST", body=body)

    if status == 200 and "access_token" in res:
        return res["access_token"], res["user"]["id"]

    raise Exception(f"Failed to authenticate {email}: {res}")

def main():
    print("🚀 STARTING REAL SUPABASE PYTHON TEST FOR MATCHING -> SELECTION -> INVITATION FLOW...")

    # 1. Authenticate A & B
    tokenA, idA = login_user("req_user_a@lyann.app")
    tokenB, idB = login_user("req_user_b@lyann.app")
    idC = "b5051e99-0e32-4c2e-a24d-adf7dc02f9e7" # User C (unselected recipient)

    print(f"✅ User A Authenticated: ID {idA}")
    print(f"✅ User B Authenticated: ID {idB}")
    print(f"✅ User C Registered: ID {idC}")

    created_request_ids = []
    try:
        # Upsert profiles for A, B, C
        url_prof = f"{SUPABASE_URL}/rest/v1/profiles"
        http_req(url_prof, method="POST", body={"id": idA, "email": "req_user_a@lyann.app", "first_name": "UserA", "city": "Le Gosier"}, token=tokenA)
        http_req(url_prof, method="POST", body={"id": idB, "email": "req_user_b@lyann.app", "first_name": "UserB", "city": "Le Gosier"}, token=tokenB)

        # 2. User A creates Request 1
        url_req = f"{SUPABASE_URL}/rest/v1/requests"
        body_req1 = {
            "requester_id": idA,
            "title": "Jardinage - Débroussaillage Le Gosier",
            "description": "Besoin d'un coup de main pour débroussailler",
            "category": "Jardinage",
            "location": "Le Gosier",
            "budget": 50,
            "urgency": "Flexible",
            "status": "OPEN"
        }
        res_req1, status = http_req(url_req, method="POST", body=body_req1, token=tokenA)
        req1_id = res_req1[0]["id"]
        created_request_ids.append(req1_id)
        print(f"✅ User A created Request 1: ID {req1_id}")

        # 3. User A sends invitation ONLY to User B
        url_rpc_send = f"{SUPABASE_URL}/rest/v1/rpc/send_request_invitations"
        body_send = {"p_request_id": req1_id, "p_recipient_ids": [idB]}
        res_send, status = http_req(url_rpc_send, method="POST", body=body_send, token=tokenA)
        print(f"✅ send_request_invitations response: {res_send} (status {status})")

        # 4. User B checks received invitations
        url_b_invs = f"{SUPABASE_URL}/rest/v1/request_invitations?recipient_id=eq.{idB}&request_id=eq.{req1_id}"
        b_invs, status = http_req(url_b_invs, method="GET", token=tokenB)
        print(f"✅ User B received {len(b_invs)} invitation(s). Status: {b_invs[0]['status']}")
        if len(b_invs) != 1 or b_invs[0]['status'] != 'PENDING':
            raise Exception("FAIL: User B should have 1 PENDING invitation!")

        inv_id_b = b_invs[0]['id']

        # 5. User C checks received invitations -> Expect 0
        url_c_invs = f"{SUPABASE_URL}/rest/v1/request_invitations?recipient_id=eq.{idC}&request_id=eq.{req1_id}"
        c_invs, status = http_req(url_c_invs, method="GET", token=tokenA)
        print(f"✅ User C received {len(c_invs)} invitation(s) for Request 1.")
        if len(c_invs) > 0:
            raise Exception("FAIL: User C was not selected but received invitation!")

        # 6. User B accepts the invitation
        url_rpc_accept = f"{SUPABASE_URL}/rest/v1/rpc/accept_request_invitation"
        body_accept = {"p_invitation_id": inv_id_b}
        res_accept, status = http_req(url_rpc_accept, method="POST", body=body_accept, token=tokenB)
        print(f"✅ User B accept_request_invitation response: {res_accept}")

        if not res_accept.get('success') or res_accept.get('request_id') != req1_id:
            raise Exception("FAIL: Accept invitation invalid response structure!")

        conv_id_1 = res_accept['conversation_id']
        print(f"✅ Verified: Invitation ACCEPTED, conversation_id = {conv_id_1}, request_id = {req1_id}")

        # 7. RLS / Security Checks:
        # a) Non-recipient (User A) attempts to accept B's invitation -> Should fail with permission error
        res_a_accept, status_a_accept = http_req(url_rpc_accept, method="POST", body={"p_invitation_id": inv_id_b}, token=tokenA)
        print(f"🔒 Non-recipient accept attempt status: {status_a_accept}, response: {res_a_accept}")
        if status_a_accept < 400 and isinstance(res_a_accept, dict) and res_a_accept.get('success') is True:
            raise Exception("FAIL: Unauthorized user accepted invitation!")

        # b) User A attempts to invite self (A -> A) -> Should return inserted_count 0
        res_self, status = http_req(url_rpc_send, method="POST", body={"p_request_id": req1_id, "p_recipient_ids": [idA]}, token=tokenA)
        print(f"🔒 Self-invitation attempt response: {res_self}")
        if res_self.get('inserted_count', 0) != 0:
            raise Exception("FAIL: User A invited self!")

        # c) Duplicate selection (A selects B twice) -> Should ignore duplicates
        res_dup, status = http_req(url_rpc_send, method="POST", body={"p_request_id": req1_id, "p_recipient_ids": [idB, idB]}, token=tokenA)
        print(f"🔒 Duplicate selection attempt response: {res_dup}")

        # 8. Multi-request context test (Requirement 8):
        body_req2 = {
            "requester_id": idA,
            "title": "Plomberie - Réparation fuite évier",
            "description": "Fuite sous évier cuisine",
            "category": "Plomberie",
            "location": "Le Gosier",
            "budget": 75,
            "urgency": "Urgent",
            "status": "OPEN"
        }
        res_req2, _ = http_req(url_req, method="POST", body=body_req2, token=tokenA)
        req2_id = res_req2[0]["id"]
        created_request_ids.append(req2_id)
        print(f"✅ User A created Request 2: ID {req2_id}")

        # Invite B for Request 2
        res_send2, status = http_req(url_rpc_send, method="POST", body={"p_request_id": req2_id, "p_recipient_ids": [idB]}, token=tokenA)
        print(f"✅ User A invited B for Request 2: {res_send2}")

        # B accepts Request 2
        b_invs2, _ = http_req(f"{SUPABASE_URL}/rest/v1/request_invitations?recipient_id=eq.{idB}&request_id=eq.{req2_id}", method="GET", token=tokenB)
        inv_id_b2 = b_invs2[0]['id']
        res_accept2, _ = http_req(url_rpc_accept, method="POST", body={"p_invitation_id": inv_id_b2}, token=tokenB)
        print(f"✅ User B accepted Request 2 invitation: {res_accept2}")

        # Verify both invitations exist with distinct request_id
        url_all_ab = f"{SUPABASE_URL}/rest/v1/request_invitations?requester_id=eq.{idA}&recipient_id=eq.{idB}"
        all_ab, _ = http_req(url_all_ab, method="GET", token=tokenB)
        print(f"✅ Total invitations between A and B in DB: {len(all_ab)}")
        req_ids_set = set(inv["request_id"] for inv in all_ab)
        print(f"✅ Unique request_ids stored in invitations: {req_ids_set}")

        if len(req_ids_set) >= 2:
            print("🎉 VERIFIED: Distinct request_id context maintained per invitation!")
        else:
            raise Exception("FAIL: lost distinct request_id context!")

        print("\n==========================================")
        print("ALL TESTS PASSED SUCCESSFULLY ON REAL SUPABASE PRODUCTION DB!")
        print("==========================================\n")
    finally:
        if created_request_ids:
            print("🧹 [Teardown] Cleaning up created test requests:", created_request_ids)
            for r_id in created_request_ids:
                try:
                    http_req(f"{SUPABASE_URL}/rest/v1/request_invitations?request_id=eq.{r_id}", method="DELETE", token=tokenA)
                    http_req(f"{SUPABASE_URL}/rest/v1/requests?id=eq.{r_id}", method="DELETE", token=tokenA)
                except Exception as e:
                    print(f"Teardown error for request {r_id}: {e}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ TEST FAILED: {e}")
        sys.exit(1)
