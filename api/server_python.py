#!/usr/bin/env python3
"""
LYANN DOM — MULTI-CLIENT REST API ENGINE (Python Production Server)
Supports Web, iOS Native, Android Native, and Admin Console.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json, time, urllib.parse, os

PORT = int(os.environ.get('PORT', 3000))

MEMBERS_DB = [
    { "id": 200, "name": "Jocelyn Cabort", "age": 52, "role": "Plomberie & Fuites d'eau PRO", "city": "Baie-Mahault", "locationName": "Guadeloupe (971)", "territoryKey": "guadeloupe", "rating": "5.0", "avatar": "jocelyn-cabort.png", "badge": "PRO VÉRIFIÉ", "kycVerified": True },
    { "id": 201, "name": "Hugues Zami", "age": 45, "role": "Climatisation & Électricité PRO", "city": "Les Abymes", "locationName": "Guadeloupe (971)", "territoryKey": "guadeloupe", "rating": "4.9", "avatar": "hugues-zami.png", "badge": "PRO VÉRIFIÉ", "kycVerified": True },
    { "id": 202, "name": "Murielle Placide", "age": 38, "role": "Ménage & Repassage", "city": "Le Gosier", "locationName": "Guadeloupe (971)", "territoryKey": "guadeloupe", "rating": "5.0", "avatar": "murielle-placide.png", "badge": "VOISINE DE CONFIANCE", "kycVerified": True },
    { "id": 203, "name": "Clotilde Belair", "age": 61, "role": "Aide aux repas & Seniors", "city": "Sainte-Anne", "locationName": "Guadeloupe (971)", "territoryKey": "guadeloupe", "rating": "4.95", "avatar": "clotilde-belair.png", "badge": "AUXILIAIRE VÉRIFIÉE", "kycVerified": True },
    { "id": 204, "name": "Marius Placide", "age": 29, "role": "Bricolage & Montage meuble", "city": "Petit-Bourg", "locationName": "Guadeloupe (971)", "territoryKey": "guadeloupe", "rating": "4.85", "avatar": "marius-placide.png", "badge": "SUPER BRICOLEUR", "kycVerified": True },
    { "id": 212, "name": "Wilfrid Rapon", "age": 37, "role": "Jardinier paysagiste", "city": "Le Gosier", "locationName": "Guadeloupe (971)", "territoryKey": "guadeloupe", "rating": "5.0", "avatar": "wilfrid-rapon.png", "badge": "PAYSAGISTE PRO", "kycVerified": True }
]

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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path == '/v1' or path == '/v1/':
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ONLINE",
                "service": "LYANN DOM Multi-Client REST API Engine",
                "version": "1.0.0",
                "territories": ["Guadeloupe (971)", "Martinique (972)", "Guyane (973)", "La Réunion (974)"]
            }).encode('utf-8'))
        elif path == '/v1/members':
            params = urllib.parse.parse_qs(parsed.query)
            territory = params.get('territory', ['all'])[0]
            query = params.get('query', [''])[0].lower()
            
            filtered = list(MEMBERS_DB)
            if territory != 'all':
                filtered = [m for m in filtered if m['territoryKey'] == territory.lower()]
            if query:
                filtered = [m for m in filtered if query in m['name'].lower() or query in m['role'].lower()]
            
            self._set_headers(200)
            self.wfile.write(json.dumps({"count": len(filtered), "data": filtered}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Route non trouvée"}).encode('utf-8'))

    def do_POST(self):
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
                "user": { "id": 1, "name": "David Jean-Baptiste", "email": email, "role": "provider" }
            }).encode('utf-8'))

        elif path == '/v1/payments/create-intent':
            mission_id = body.get('missionId')
            amount = body.get('amount')
            if not mission_id or not amount:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Mission ID et montant requis."}).encode('utf-8'))
                return
            
            base_price = float(amount)
            commission_fee = base_price * 0.03
            protection_fee = 4.90
            total_amount = base_price + commission_fee + protection_fee

            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "mode": "stripe_live" if os.environ.get('STRIPE_SECRET_KEY') else "stripe_test_mode",
                "architecture": "SEPARATE_CHARGES_AND_TRANSFERS",
                "paymentIntentId": f"pi_test_{int(time.time())}",
                "clientSecret": f"pi_test_secret_{int(time.time())}",
                "breakdown": {
                    "basePrice": round(base_price, 2),
                    "commissionFee": round(commission_fee, 2),
                    "protectionFee": round(protection_fee, 2),
                    "totalAmount": round(total_amount, 2)
                }
            }).encode('utf-8'))

        elif path == '/v1/payments/validate-and-transfer':
            mission_id = body.get('missionId')
            provider_amount = body.get('providerAmount')
            provider_stripe = body.get('providerStripeAccountId', 'acct_test_provider_123')
            
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "mode": "stripe_test_mode",
                "architecture": "SEPARATE_CHARGES_AND_TRANSFERS",
                "transferId": f"tr_test_{int(time.time())}",
                "providerAmount": float(provider_amount) if provider_amount else 100.0,
                "providerStripeAccountId": provider_stripe,
                "status": "PROVIDER_TRANSFERRED"
            }).encode('utf-8'))

        elif path == '/v1/payments/dispute':
            mission_id = body.get('missionId')
            reason = body.get('reason', 'Litige')
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "missionId": mission_id,
                "providerTransferStatus": "DISPUTED",
                "message": "Signalement de litige enregistré. Virement au prestataire gelé."
            }).encode('utf-8'))

        elif path == '/v1/payments/webhook':
            sig = self.headers.get('stripe-signature', '')
            self._set_headers(200)
            self.wfile.write(json.dumps({"received": True, "event": "payment_intent.succeeded", "signature_present": bool(sig)}).encode('utf-8'))

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Route POST non trouvée"}).encode('utf-8'))

def run_server():
    server = HTTPServer(('0.0.0.0', PORT), LyannAPIHandler)
    print(f"🚀 LYANN DOM API Engine en écoute sur http://0.0.0.0:{PORT}/v1")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
