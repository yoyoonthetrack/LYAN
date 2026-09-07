#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3OiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A"
SUPABASE_URL="https://gzispjfoywklpqatjyop.supabase.co"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
REQ_ID="49a2a9e2-2f3b-4819-a115-5b4d008e70a9"

echo "=== 1. FETCHING WITH ANON KEY (GUEST / UNAUTHENTICATED) ==="
curl -s -v -X GET "${SUPABASE_URL}/rest/v1/requests?id=eq.${REQ_ID}" \
  -H "apikey: ${ANON_KEY}" \
  -H "User-Agent: ${UA}" 2>&1 | grep -E "< HTTP/|< content-type:|\[\{"

echo ""
echo "=== 2. FETCHING WITH USER B TOKEN (AUTHENTICATED NON-AUTHOR USER C/B) ==="
RESP_B=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "User-Agent: ${UA}" \
  -H "Content-Type: application/json" \
  -d '{"email":"req_user_b@lyann.app","password":"Password123!"}')

TOKEN_B=$(echo "$RESP_B" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token',''))")
ID_B=$(echo "$RESP_B" | python3 -c "import sys, json; print(json.load(sys.stdin).get('user',{}).get('id',''))")

echo "User B ID: $ID_B"
echo "Token B length: ${#TOKEN_B}"

if [ -n "$TOKEN_B" ]; then
    echo "REST Call as User B:"
    curl -s -i -X GET "${SUPABASE_URL}/rest/v1/requests?id=eq.${REQ_ID}" \
      -H "apikey: ${ANON_KEY}" \
      -H "Authorization: Bearer ${TOKEN_B}" \
      -H "User-Agent: ${UA}"
fi

echo ""
echo "=== 3. CHECKING TABLE SCHEMA FOR APPLICATIONS / INTERESTS / PROPOSALS ==="
for tbl in "applications" "request_applications" "interests" "proposals" "quotes" "conversations" "messages"; do
    echo "--- Table: $tbl ---"
    curl -s -X GET "${SUPABASE_URL}/rest/v1/${tbl}?select=*&limit=1" \
      -H "apikey: ${ANON_KEY}" \
      -H "Authorization: Bearer ${ANON_KEY}" \
      -H "User-Agent: ${UA}"
    echo ""
done

