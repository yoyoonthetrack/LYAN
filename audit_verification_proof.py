import json
import urllib.request
import urllib.error
import ssl
import sys

SUPABASE_URL = "https://gzispjfoywklpqatjyop.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A"

headers_base = {
    "apikey": SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
}

ssl_context = ssl._create_unverified_context()

def http_req(url, method="GET", body=None, token=None, prefer=None):
    hdrs = dict(headers_base)
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if prefer:
        hdrs["Prefer"] = prefer

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
    print("--- VERIFICATION DE L'ARCHITECTURE PERSISTANTE SUPABASE ---")

    tokenA, idA = login_user("req_user_a@lyann.app")
    tokenB, idB = login_user("req_user_b@lyann.app")

    print(f"1. Authentification réussie : User A ({idA}), User B ({idB})")

    created_request_ids = []
    try:
        # Query existing requests for A
        url_get_reqs = f"{SUPABASE_URL}/rest/v1/requests?requester_id=eq.{idA}&order=created_at.desc&limit=1"
        reqs_a, status_get = http_req(url_get_reqs, method="GET", token=tokenA)

        if reqs_a and len(reqs_a) > 0:
            req1 = reqs_a[0]
            req_id = req1["id"]
            print(f"2. Demande existante récupérée en base pour User A : ID = {req_id}, Titre = '{req1.get('title')}'")
        else:
            # Create request using POST
            url_req = f"{SUPABASE_URL}/rest/v1/requests"
            body_req = {
                "requester_id": idA,
                "title": "Audit Final - Entretien Jardin & Elagage",
                "description": "Besoin urgent d'un coup de main pour taille de haie à Baie-Mahault",
                "category": "Jardinage",
                "location": "Baie-Mahault",
                "budget": 60,
                "urgency": "Urgent",
                "status": "OPEN"
            }
            res_req, status_req = http_req(url_req, method="POST", body=body_req, token=tokenA, prefer="return=representation")
            print(f"Post request status: {status_req}, body: {res_req}")
            req_id = res_req[0]["id"]
            created_request_ids.append(req_id)

        # Send invitation to B
        url_rpc_send = f"{SUPABASE_URL}/rest/v1/rpc/send_request_invitations"
        res_send, status_send = http_req(url_rpc_send, method="POST", body={"p_request_id": req_id, "p_recipient_ids": [idB]}, token=tokenA)
        print(f"3. RPC send_request_invitations exécutée : status HTTP {status_send}, retour = {json.dumps(res_send)}")

        # Check invitation status PENDING in database
        url_inv_pending = f"{SUPABASE_URL}/rest/v1/request_invitations?request_id=eq.{req_id}&recipient_id=eq.{idB}"
        invs_pending, _ = http_req(url_inv_pending, method="GET", token=tokenB)
        print(f"4. Ligne request_invitations (PENDING) en base : {json.dumps(invs_pending, indent=2)}")

        if invs_pending and len(invs_pending) > 0:
            inv_id = invs_pending[0]["id"]
            # User B accepts invitation via accept_request_invitation RPC
            url_rpc_accept = f"{SUPABASE_URL}/rest/v1/rpc/accept_request_invitation"
            res_accept, status_accept = http_req(url_rpc_accept, method="POST", body={"p_invitation_id": inv_id}, token=tokenB)
            print(f"5. RPC accept_request_invitation exécutée : status HTTP {status_accept}, retour = {json.dumps(res_accept)}")

            # Check invitation status ACCEPTED in database
            invs_accepted, _ = http_req(url_inv_pending, method="GET", token=tokenB)
            print(f"6. Ligne request_invitations après acceptation (ACCEPTED) : {json.dumps(invs_accepted, indent=2)}")

        print("\n--- DEPLOIEMENT & SCRIPT PRODUCTION LYANN.APP ---")
        url_site_script = "https://lyann.app/script.js"
        req_script = urllib.request.Request(url_site_script, method="GET")
        try:
            with urllib.request.urlopen(req_script, context=ssl_context) as resp:
                script_text = resp.read().decode('utf-8')
                has_step7 = "showWizardMatchingStep" in script_text or "Voici les Lyanneurs" in script_text
                has_inv_ui = "loadUserReceivedInvitationsUI" in script_text
                print(f"7. Production https://lyann.app/script.js vérifié : showWizardMatchingStep = {has_step7}, loadUserReceivedInvitationsUI = {has_inv_ui}")
        except Exception as e:
            print(f"7. Error reading lyann.app script.js: {e}")
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
    main()
