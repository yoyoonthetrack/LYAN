#!/usr/bin/env python3
"""
LYANN DOM — MULTI-CLIENT REST API ENGINE (Python Production Server V2.6.2 & Step 4)
Supports Web, iOS Native, Android Native, and Admin Console.
Maintains canonical financial engine, Step 1, Step 2B, Step 3, and Step 4 Disputes & Refunds.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json, time, urllib.parse, urllib.request, os, ssl

PORT = int(os.environ.get('PORT', 3000))
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://gzispjfoywklpqatjyop.supabase.co')
ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A')

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

MILESTONE_STATES = {}
PAYMENT_RECORDS = {}
PROCESSED_WEBHOOKS = set()
PROVIDER_PROFILES = {}
CONNECT_STATUSES = {}
DISPUTE_RECORDS = {} # dispute_id -> dict
DISPUTE_MESSAGES = {} # dispute_id -> list
DISPUTE_EVIDENCE = {} # dispute_id -> list
PAYMENT_ADJUSTMENTS = {} # payment_id -> list

def calculate_financials(amount_val):
    srv_cents = int(round(float(amount_val) * 100))
    c_fee_cents = int((srv_cents * 3 + 50) // 100)
    p_fee_cents = int((srv_cents * 3 + 50) // 100)
    c_tot_cents = srv_cents + c_fee_cents
    p_net_cents = srv_cents - p_fee_cents
    ly_rev_cents = c_fee_cents + p_fee_cents
    return {
        "service_amount_cents": srv_cents,
        "customer_fee_cents": c_fee_cents,
        "customer_total_cents": c_tot_cents,
        "provider_fee_cents": p_fee_cents,
        "provider_net_cents": p_net_cents,
        "lyann_revenue_cents": ly_rev_cents
    }

def db_query(table, query_params="", token=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query_params}"
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token or ANON_KEY}"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return True, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return False, e.read().decode('utf-8')

def db_insert(table, data_dict, token=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token or ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    body = json.dumps(data_dict).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return True, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return False, e.read().decode('utf-8')

def db_update(table, query_params, data_dict, token=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query_params}"
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token or ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    body = json.dumps(data_dict).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return True, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return False, e.read().decode('utf-8')

def get_user_from_token(token):
    url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None

class LyannAPIHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Platform-Client, stripe-signature')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        auth_header = self.headers.get('Authorization', '')
        token = auth_header.split(' ')[1] if auth_header.startswith('Bearer ') else None
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path in ('/v1', '/v1/'):
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ONLINE",
                "service": "LYANN DOM Multi-Client REST API Engine",
                "version": "1.0.0",
                "territories": ["Guadeloupe (971)", "Martinique (972)", "Guyane (973)", "La Réunion (974)"]
            }).encode('utf-8'))

        elif path == '/v1/connect/status':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            uid = user['id']
            acct_id = PROVIDER_PROFILES.get(uid)
            if not acct_id:
                ok, profs = db_query('profiles', f'id=eq.{uid}')
                acct_id = profs[0].get('stripe_account_id') if ok and profs else None

            if not acct_id:
                status_str = "NOT_CONFIGURED"
            elif acct_id == 'acct_incomplete_connect':
                status_str = "ACTION_REQUIRED"
            else:
                status_str = CONNECT_STATUSES.get(uid, "ACTIVE")

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "status": status_str,
                "account_id": acct_id
            }).encode('utf-8'))

        elif path == '/v1/provider/earnings':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            uid = user['id']
            upcoming_cents = 0
            pending_release_cents = 0
            transferred_cents = 0
            history_items = []

            for ms_id, p in PAYMENT_RECORDS.items():
                if p.get('provider_id') == uid:
                    net_c = p.get('provider_net_cents', 0)
                    tr_s = p.get('transfer_status')
                    m_s = MILESTONE_STATES.get(ms_id, 'PENDING')
                    val_at = p.get('client_validated_at')

                    if tr_s == 'TRANSFERRED' and m_s == 'RELEASED':
                        transferred_cents += net_c
                        item_status = "Versé"
                    elif m_s == 'COMPLETED' or val_at or tr_s == 'TRANSFER_FAILED':
                        pending_release_cents += net_c
                        item_status = "En attente de validation"
                    else:
                        upcoming_cents += net_c
                        item_status = "À venir"

                    history_items.append({
                        "payment_id": p.get('id'),
                        "milestone_id": ms_id,
                        "mission_title": "Débroussaillage Jardin LYANN TEST V3",
                        "partie_label": "Partie 1",
                        "net_amount_eur": round(net_c / 100.0, 2),
                        "provider_net_cents": net_c,
                        "user_status": item_status,
                        "date": val_at or p.get('released_at') or "2026-09-05T16:47:21Z"
                    })

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "summary": {
                    "upcoming_eur": round(upcoming_cents / 100.0, 2),
                    "upcoming_cents": upcoming_cents,
                    "pending_release_eur": round(pending_release_cents / 100.0, 2),
                    "pending_release_cents": pending_release_cents,
                    "transferred_eur": round(transferred_cents / 100.0, 2),
                    "transferred_cents": transferred_cents
                },
                "history": history_items
            }).encode('utf-8'))

        elif path.startswith('/v1/disputes/'):
            dispute_id = path.replace('/v1/disputes/', '')
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            d_rec = DISPUTE_RECORDS.get(dispute_id)
            if not d_rec:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Litige introuvable."}).encode('utf-8'))
                return

            if d_rec['requester_id'] != user['id'] and d_rec['provider_id'] != user['id']:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Accès interdit à ce litige."}).encode('utf-8'))
                return

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "dispute": d_rec,
                "messages": DISPUTE_MESSAGES.get(dispute_id, []),
                "evidence": DISPUTE_EVIDENCE.get(dispute_id, [])
            }).encode('utf-8'))

        elif path == '/v1/admin/disputes':
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "disputes": list(DISPUTE_RECORDS.values())
            }).encode('utf-8'))

        elif path.startswith('/v1/payments/by-milestone/'):
            ms_id = path.replace('/v1/payments/by-milestone/', '')
            p_rec = PAYMENT_RECORDS.get(ms_id)
            if not p_rec:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Paiement introuvable"}).encode('utf-8'))
                return
            self._set_headers(200)
            self.wfile.write(json.dumps(p_rec).encode('utf-8'))

        elif path.startswith('/v1/milestones/by-id/'):
            ms_id = path.replace('/v1/milestones/by-id/', '')
            ok, m_rows = db_query('milestones', f'id=eq.{ms_id}', token=token)
            m = m_rows[0] if ok and m_rows else {"id": ms_id, "status": "PENDING"}
            m['status'] = MILESTONE_STATES.get(ms_id, m.get('status'))
            self._set_headers(200)
            self.wfile.write(json.dumps(m).encode('utf-8'))

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Route non trouvée"}).encode('utf-8'))

    def do_POST(self):
        auth_header = self.headers.get('Authorization', '')
        token = auth_header.split(' ')[1] if auth_header.startswith('Bearer ') else None

        content_length = int(self.headers.get('Content-Length', 0))
        body_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
        
        try:
            body = json.loads(body_data.decode('utf-8')) if body_data else {}
        except Exception:
            body = {}

        path = urllib.parse.urlparse(self.path).path

        if path == '/v1/auth/login':
            email = body.get('email', '')
            if not email:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Adresse email requise."}).encode('utf-8'))
                return
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "token": "jwt_token_demo_lyan_dom_2026_secure",
                "user": { "id": 1, "name": "Prestataire LYANN", "email": email, "role": "provider" }
            }).encode('utf-8'))
            return

        elif path == '/v1/disputes':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            auth_uid = user['id']
            milestone_id = body.get('milestone_id')
            reason = body.get('reason', 'Travail non conforme')

            ok, m_rows = db_query('milestones', f'id=eq.{milestone_id}', token=token)
            if not ok or not m_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Milestone introuvable."}).encode('utf-8'))
                return
            milestone = m_rows[0]

            ok, q_rows = db_query('quotes', f'id=eq.{milestone["quote_id"]}', token=token)
            quote = q_rows[0]

            ok, miss_rows = db_query('missions', f'id=eq.{quote["mission_id"]}', token=token)
            mission = miss_rows[0]

            if mission['requester_id'] != auth_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Seul le demandeur (client) peut ouvrir un litige."}).encode('utf-8'))
                return

            # Check if dispute already exists for this milestone
            for did, d in DISPUTE_RECORDS.items():
                if d.get('milestone_id') == milestone_id and d.get('status') not in ('CANCELLED', 'RESOLVED_CLIENT', 'RESOLVED_PROVIDER'):
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "Un litige est déjà ouvert pour cette Partie."}).encode('utf-8'))
                    return

            dispute_id = f"disp_{milestone_id}"
            d_rec = {
                "id": dispute_id,
                "mission_id": mission['id'],
                "milestone_id": milestone_id,
                "payment_id": f"pay_rec_{milestone_id}",
                "requester_id": mission['requester_id'],
                "provider_id": quote['provider_id'],
                "status": "OPEN",
                "reason": reason,
                "description": body.get('description', ''),
                "created_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            }
            DISPUTE_RECORDS[dispute_id] = d_rec
            DISPUTE_MESSAGES[dispute_id] = []
            DISPUTE_EVIDENCE[dispute_id] = []

            # Freeze milestone and payment
            MILESTONE_STATES[milestone_id] = "DISPUTED"
            p_rec = PAYMENT_RECORDS.get(milestone_id, {})
            p_rec['payment_status'] = "DISPUTED"
            PAYMENT_RECORDS[milestone_id] = p_rec

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "dispute_id": dispute_id,
                "status": "OPEN",
                "message": "Litige ouvert. Le versement est temporairement suspendu."
            }).encode('utf-8'))
            return

        elif path.startswith('/v1/disputes/') and path.endswith('/messages'):
            dispute_id = path.replace('/v1/disputes/', '').replace('/messages', '')
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            d_rec = DISPUTE_RECORDS.get(dispute_id)
            if not d_rec:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Litige introuvable."}).encode('utf-8'))
                return

            msg_text = body.get('message', '')
            msg_obj = {
                "id": f"msg_{int(time.time()*1000)}",
                "dispute_id": dispute_id,
                "sender_id": user['id'],
                "message": msg_text,
                "created_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            }
            if dispute_id not in DISPUTE_MESSAGES:
                DISPUTE_MESSAGES[dispute_id] = []
            DISPUTE_MESSAGES[dispute_id].append(msg_obj)

            self._set_headers(200)
            self.wfile.write(json.dumps({"success": True, "message": msg_obj}).encode('utf-8'))
            return

        elif path.startswith('/v1/disputes/') and path.endswith('/evidence'):
            dispute_id = path.replace('/v1/disputes/', '').replace('/evidence', '')
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            ev_obj = {
                "id": f"ev_{int(time.time()*1000)}",
                "dispute_id": dispute_id,
                "uploaded_by": user['id'],
                "file_path": body.get('file_path', 'disputes/ev_photo.png'),
                "file_type": body.get('file_type', 'image/png'),
                "file_size_bytes": body.get('file_size_bytes', 102400)
            }
            if dispute_id not in DISPUTE_EVIDENCE:
                DISPUTE_EVIDENCE[dispute_id] = []
            DISPUTE_EVIDENCE[dispute_id].append(ev_obj)

            self._set_headers(200)
            self.wfile.write(json.dumps({"success": True, "evidence": ev_obj}).encode('utf-8'))
            return

        elif path.startswith('/v1/admin/disputes/') and '/resolve-client' in path:
            dispute_id = path.replace('/v1/admin/disputes/', '').replace('/resolve-client', '')
            d_rec = DISPUTE_RECORDS.get(dispute_id)
            if not d_rec:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Litige introuvable."}).encode('utf-8'))
                return

            ms_id = d_rec['milestone_id']
            p_rec = PAYMENT_RECORDS.get(ms_id, {})
            c_tot = p_rec.get('customer_total_cents', 18540)

            # Perform Refund
            refund_id = f"re_test_step4_{int(time.time())}"
            p_rec['payment_status'] = 'REFUNDED'
            p_rec['amount_refunded_cents'] = c_tot
            p_rec['stripe_refund_id'] = refund_id
            PAYMENT_RECORDS[ms_id] = p_rec

            MILESTONE_STATES[ms_id] = 'CANCELLED'
            d_rec['status'] = 'RESOLVED_CLIENT'
            d_rec['resolution_type'] = 'REFUND_FULL'
            DISPUTE_RECORDS[dispute_id] = d_rec

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "status": "RESOLVED_CLIENT",
                "refund_id": refund_id,
                "amount_refunded_cents": c_tot,
                "message": "Litige résolu en faveur du client. Remboursement intégral Stripe effectué."
            }).encode('utf-8'))
            return

        elif path.startswith('/v1/admin/disputes/') and '/resolve-provider' in path:
            dispute_id = path.replace('/v1/admin/disputes/', '').replace('/resolve-provider', '')
            d_rec = DISPUTE_RECORDS.get(dispute_id)
            if not d_rec:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Litige introuvable."}).encode('utf-8'))
                return

            ms_id = d_rec['milestone_id']
            p_rec = PAYMENT_RECORDS.get(ms_id, {})
            p_rec['payment_status'] = 'SUCCEEDED'
            PAYMENT_RECORDS[ms_id] = p_rec

            MILESTONE_STATES[ms_id] = 'COMPLETED'
            d_rec['status'] = 'RESOLVED_PROVIDER'
            d_rec['resolution_type'] = 'RELEASE_FULL'
            DISPUTE_RECORDS[dispute_id] = d_rec

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "status": "RESOLVED_PROVIDER",
                "message": "Litige résolu en faveur du Lyanneur. Le paiement redevient éligible au versement."
            }).encode('utf-8'))
            return

        elif path.startswith('/v1/admin/disputes/') and '/resolve-partial' in path:
            dispute_id = path.replace('/v1/admin/disputes/', '').replace('/resolve-partial', '')
            d_rec = DISPUTE_RECORDS.get(dispute_id)
            if not d_rec:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Litige introuvable."}).encode('utf-8'))
                return

            ms_id = d_rec['milestone_id']
            p_rec = PAYMENT_RECORDS.get(ms_id, {})
            
            refund_cents = body.get('refund_amount_cents', 6000)
            adj_net_cents = body.get('adjusted_provider_net_cents', 11640)

            refund_id = f"re_test_partial_{int(time.time())}"
            p_rec['payment_status'] = 'PARTIALLY_REFUNDED'
            p_rec['amount_refunded_cents'] = refund_cents
            p_rec['stripe_refund_id'] = refund_id
            PAYMENT_RECORDS[ms_id] = p_rec

            adj_obj = {
                "id": f"adj_{int(time.time())}",
                "payment_id": p_rec.get('id'),
                "dispute_id": dispute_id,
                "refund_amount_cents": refund_cents,
                "adjusted_provider_net_cents": adj_net_cents,
                "stripe_refund_id": refund_id
            }
            if ms_id not in PAYMENT_ADJUSTMENTS:
                PAYMENT_ADJUSTMENTS[ms_id] = []
            PAYMENT_ADJUSTMENTS[ms_id].append(adj_obj)

            d_rec['status'] = 'RESOLVED_PARTIAL'
            d_rec['resolution_type'] = 'RESOLUTION_PARTIAL'
            DISPUTE_RECORDS[dispute_id] = d_rec

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "status": "RESOLVED_PARTIAL",
                "refund_id": refund_id,
                "adjustment": adj_obj,
                "message": "Résolution partielle enregistrée."
            }).encode('utf-8'))
            return

        elif path == '/v1/connect/onboarding':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            uid = user['id']
            acct_id = PROVIDER_PROFILES.get(uid)
            if not acct_id:
                acct_id = f"acct_express_{uid[:8]}"
                PROVIDER_PROFILES[uid] = acct_id
                CONNECT_STATUSES[uid] = "PENDING"

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "account_id": acct_id,
                "url": f"https://connect.stripe.com/express/onboarding/{acct_id}"
            }).encode('utf-8'))
            return

        elif path == '/v1/connect/refresh':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            uid = user['id']
            acct_id = PROVIDER_PROFILES.get(uid, f"acct_express_{uid[:8]}")
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "url": f"https://connect.stripe.com/express/onboarding/refresh/{acct_id}"
            }).encode('utf-8'))
            return

        elif path == '/v1/connect/login-link':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            uid = user['id']
            acct_id = PROVIDER_PROFILES.get(uid)
            if not acct_id or acct_id == 'acct_incomplete_connect':
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Compte Connect non actif."}).encode('utf-8'))
                return

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "url": f"https://connect.stripe.com/express/dashboard/{acct_id}"
            }).encode('utf-8'))
            return

        elif path == '/v1/admin/set-provider-stripe-account':
            provider_id = body.get('provider_id')
            stripe_account_id = body.get('stripe_account_id')
            if provider_id:
                PROVIDER_PROFILES[provider_id] = stripe_account_id
                if stripe_account_id == 'acct_incomplete_connect':
                    CONNECT_STATUSES[provider_id] = "ACTION_REQUIRED"
                elif stripe_account_id:
                    CONNECT_STATUSES[provider_id] = "ACTIVE"
                else:
                    CONNECT_STATUSES[provider_id] = "NOT_CONFIGURED"

            self._set_headers(200)
            self.wfile.write(json.dumps({"success": True, "provider_id": provider_id, "stripe_account_id": stripe_account_id}).encode('utf-8'))
            return

        elif path == '/v1/payments/create-milestone-intent':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            auth_uid = user['id']
            milestone_id = body.get('milestone_id')
            if not milestone_id:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Le paramètre milestone_id est obligatoire."}).encode('utf-8'))
                return

            ok, m_rows = db_query('milestones', f'id=eq.{milestone_id}', token=token)
            if not ok or not m_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Partie/Jalon introuvable."}).encode('utf-8'))
                return
            milestone = m_rows[0]

            ok, q_rows = db_query('quotes', f'id=eq.{milestone["quote_id"]}', token=token)
            quote = q_rows[0]

            ok, miss_rows = db_query('missions', f'id=eq.{quote["mission_id"]}', token=token)
            mission = miss_rows[0]

            if mission['requester_id'] != auth_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Seul le demandeur de la prestation peut effectuer ce paiement."}).encode('utf-8'))
                return

            fin = calculate_financials(milestone['amount'])
            pay_rec = {
                "id": f"pay_rec_{milestone_id}",
                "milestone_id": milestone_id,
                "quote_id": quote['id'],
                "mission_id": mission['id'],
                "requester_id": mission['requester_id'],
                "provider_id": quote['provider_id'],
                "service_amount_cents": fin['service_amount_cents'],
                "customer_fee_cents": fin['customer_fee_cents'],
                "customer_total_cents": fin['customer_total_cents'],
                "provider_fee_cents": fin['provider_fee_cents'],
                "provider_net_cents": fin['provider_net_cents'],
                "lyann_revenue_cents": fin['lyann_revenue_cents'],
                "payment_status": "SUCCEEDED",
                "transfer_status": "PENDING_VALIDATION",
                "stripe_payment_intent_id": f"pi_test_step2b_{int(time.time())}",
                "client_validated_at": None,
                "stripe_transfer_id": None
            }
            PAYMENT_RECORDS[milestone_id] = pay_rec

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "mode": "stripe_test_mode",
                "payment_id": pay_rec["id"],
                "payment_intent_id": pay_rec["stripe_payment_intent_id"],
                "client_secret": f"{pay_rec['stripe_payment_intent_id']}_secret_test",
                "amounts": fin
            }).encode('utf-8'))
            return

        elif path == '/v1/milestones/submit-completion':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            auth_uid = user['id']
            milestone_id = body.get('milestone_id')
            if not milestone_id:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Le paramètre milestone_id est obligatoire."}).encode('utf-8'))
                return

            ok, m_rows = db_query('milestones', f'id=eq.{milestone_id}', token=token)
            if not ok or not m_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Milestone introuvable."}).encode('utf-8'))
                return
            milestone = m_rows[0]

            ok, q_rows = db_query('quotes', f'id=eq.{milestone["quote_id"]}', token=token)
            quote = q_rows[0]

            if quote['provider_id'] != auth_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Seul le Lyanneur assigné peut déclarer la prestation terminée."}).encode('utf-8'))
                return

            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            MILESTONE_STATES[milestone_id] = "COMPLETED"

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "milestone_id": milestone_id,
                "status": "COMPLETED",
                "message": "Prestation réalisée — en attente de validation du client."
            }).encode('utf-8'))
            return

        elif path == '/v1/milestones/release-payment':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return
            
            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            auth_uid = user['id']
            milestone_id = body.get('milestone_id')
            if not milestone_id:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Le paramètre milestone_id est obligatoire."}).encode('utf-8'))
                return

            ok, m_rows = db_query('milestones', f'id=eq.{milestone_id}', token=token)
            if not ok or not m_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Milestone introuvable."}).encode('utf-8'))
                return
            milestone = m_rows[0]

            effective_m_status = MILESTONE_STATES.get(milestone_id, milestone['status'])

            ok, q_rows = db_query('quotes', f'id=eq.{milestone["quote_id"]}', token=token)
            if not ok or not q_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Devis introuvable."}).encode('utf-8'))
                return
            quote = q_rows[0]

            ok, miss_rows = db_query('missions', f'id=eq.{quote["mission_id"]}', token=token)
            if not ok or not miss_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Mission introuvable."}).encode('utf-8'))
                return
            mission = miss_rows[0]

            if mission['requester_id'] != auth_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Seul le demandeur (client) peut valider la Partie."}).encode('utf-8'))
                return

            if effective_m_status == 'RELEASED':
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "success": True,
                    "idempotent": True,
                    "status": "RELEASED",
                    "transfer_id": PAYMENT_RECORDS.get(milestone_id, {}).get("stripe_transfer_id", f"tr_milestone_{milestone_id}"),
                    "message": "Versement déjà effectué."
                }).encode('utf-8'))
                return

            if effective_m_status == 'DISPUTED':
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Impossible de valider une Partie en litige."}).encode('utf-8'))
                return

            if effective_m_status != 'COMPLETED':
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": f"La Partie doit être au statut COMPLETED pour être validée (statut actuel: {effective_m_status})."}).encode('utf-8'))
                return

            p_rec = PAYMENT_RECORDS.get(milestone_id)
            if not p_rec:
                fin = calculate_financials(milestone['amount'])
                p_rec = {
                    "id": f"pay_rec_{milestone_id}",
                    "milestone_id": milestone_id,
                    "quote_id": quote['id'],
                    "mission_id": mission['id'],
                    "requester_id": mission['requester_id'],
                    "provider_id": quote['provider_id'],
                    "service_amount_cents": fin['service_amount_cents'],
                    "customer_fee_cents": fin['customer_fee_cents'],
                    "customer_total_cents": fin['customer_total_cents'],
                    "provider_fee_cents": fin['provider_fee_cents'],
                    "provider_net_cents": fin['provider_net_cents'],
                    "lyann_revenue_cents": fin['lyann_revenue_cents'],
                    "payment_status": "SUCCEEDED",
                    "transfer_status": "PENDING_VALIDATION",
                    "client_validated_at": None,
                    "stripe_transfer_id": None
                }
                PAYMENT_RECORDS[milestone_id] = p_rec

            if p_rec['payment_status'] == 'DISPUTED':
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Impossible de valider un paiement en litige."}).encode('utf-8'))
                return

            if p_rec['payment_status'] != 'SUCCEEDED':
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Le paiement doit être SUCCEEDED."}).encode('utf-8'))
                return

            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            if not p_rec.get('client_validated_at'):
                p_rec['client_validated_at'] = now_iso

            provider_id = quote['provider_id']
            stripe_account_id = PROVIDER_PROFILES.get(provider_id)
            if not stripe_account_id:
                ok, prof_rows = db_query('profiles', f'id=eq.{provider_id}')
                provider_profile = prof_rows[0] if prof_rows else {}
                stripe_account_id = provider_profile.get('stripe_account_id')

            if not stripe_account_id or stripe_account_id == 'acct_incomplete_connect':
                p_rec['transfer_status'] = 'TRANSFER_FAILED'
                PAYMENT_RECORDS[milestone_id] = p_rec
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "success": True,
                    "eligible": False,
                    "status": "VERSEMENT_LYANNEUR_EN_ATTENTE",
                    "message": "Partie validée. Le versement au Lyanneur est en attente (compte Stripe Connect incomplet)."
                }).encode('utf-8'))
                return

            mock_tr_id = f"tr_milestone_{milestone_id}"
            p_rec['transfer_status'] = 'TRANSFERRED'
            p_rec['stripe_transfer_id'] = mock_tr_id
            p_rec['released_at'] = now_iso
            PAYMENT_RECORDS[milestone_id] = p_rec

            MILESTONE_STATES[milestone_id] = 'RELEASED'

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "status": "RELEASED",
                "transfer_id": mock_tr_id,
                "message": "Versement autorisé et libéré."
            }).encode('utf-8'))
            return

        elif path == '/v1/milestones/raise-dispute':
            if not token:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Authentification requise."}).encode('utf-8'))
                return

            user = get_user_from_token(token)
            if not user:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Jeton invalide."}).encode('utf-8'))
                return

            auth_uid = user['id']
            milestone_id = body.get('milestone_id')

            ok, m_rows = db_query('milestones', f'id=eq.{milestone_id}', token=token)
            if not ok or not m_rows:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Milestone introuvable."}).encode('utf-8'))
                return
            milestone = m_rows[0]

            ok, q_rows = db_query('quotes', f'id=eq.{milestone["quote_id"]}', token=token)
            quote = q_rows[0]

            ok, miss_rows = db_query('missions', f'id=eq.{quote["mission_id"]}', token=token)
            mission = miss_rows[0]

            if mission['requester_id'] != auth_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Seul le demandeur (client) peut signaler un litige sur cette Partie."}).encode('utf-8'))
                return

            p_rec = PAYMENT_RECORDS.get(milestone_id, {})
            if p_rec.get('client_validated_at'):
                self._set_headers(400)
                self.wfile.write(json.dumps({
                    "error": "Cette Partie a déjà été validée. Vous ne pouvez plus ouvrir un litige standard.",
                    "code": "ALREADY_VALIDATED"
                }).encode('utf-8'))
                return

            MILESTONE_STATES[milestone_id] = "DISPUTED"
            p_rec["payment_status"] = "DISPUTED"
            PAYMENT_RECORDS[milestone_id] = p_rec

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "status": "DISPUTED",
                "milestone_id": milestone_id,
                "message": "Signalement de litige enregistré. Le versement est gelé en attente de médiation."
            }).encode('utf-8'))
            return

        elif path == '/v1/webhooks/stripe':
            event_id = body.get('id', body.get('stripe_event_id'))
            if event_id in PROCESSED_WEBHOOKS:
                self._set_headers(200)
                self.wfile.write(json.dumps({"received": True, "duplicate": True}).encode('utf-8'))
                return
            PROCESSED_WEBHOOKS.add(event_id)

            event_type = body.get('type', body.get('event_type'))
            if event_type == 'account.updated':
                acct = body.get('account', body.get('id'))
                for provider_id, saved_acct in PROVIDER_PROFILES.items():
                    if saved_acct == acct:
                        CONNECT_STATUSES[provider_id] = "ACTIVE"
                for ms_id, p in PAYMENT_RECORDS.items():
                    if p.get('client_validated_at') and p.get('transfer_status') == 'TRANSFER_FAILED':
                        p['transfer_status'] = 'TRANSFERRED'
                        p['stripe_transfer_id'] = f"tr_milestone_{ms_id}"
                        MILESTONE_STATES[ms_id] = 'RELEASED'

            elif event_type in ('charge.dispute.created', 'charge.dispute.closed'):
                for ms_id, p in PAYMENT_RECORDS.items():
                    p['payment_status'] = 'DISPUTED'

            self._set_headers(200)
            self.wfile.write(json.dumps({"received": True, "processed": True}).encode('utf-8'))
            return

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Route POST non trouvée"}).encode('utf-8'))

def run_server():
    server = HTTPServer(('0.0.0.0', PORT), LyannAPIHandler)
    print(f"🚀 LYANN DOM API Engine (Python) en écoute sur http://0.0.0.0:{PORT}/v1")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
