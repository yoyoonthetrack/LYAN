#!/usr/bin/env python3
import os, sys, re

print("======================================================================")
print("🧪 LYANN DOM & COMPONENT INTEGRITY SUITE (UNIT / DOM AUDIT)")
print("======================================================================\n")

passes = 0
fails = 0

def log_test(success, name, details=""):
    global passes, fails
    if success:
        passes += 1
        print(f"  [PASS] {name} {f'({details})' if details else ''}")
    else:
        fails += 1
        print(f"  [FAIL] {name} {f'({details})' if details else ''}")

pages = ['index.html', 'feed.html', 'results.html', 'how-it-works.html', 'about.html', 'pricing.html', 'payment-portal.html', 'admin.html']
modals = ['modal-request-help', 'loginModal', 'onboardingModal', 'bookingModal', 'userAccountModal', 'quickProfileModal', 'chatModal']
handled_classes = ['open-login-trigger', 'open-signup-trigger', 'open-chat-trigger', 'open-account-modal-trigger', 'forgot-link', 'speed-dial-item', 'category-card-trigger', 'btn-sheet-', 'view-member-profile-btn', 'switchToSignupBtn', 'admin-nav-item']

for p in pages:
    if not os.path.exists(p):
        log_test(False, f"File {p} exists")
        continue
    with open(p, 'r', encoding='utf-8') as fp:
        html = fp.read()
    
    # Verify required modals
    for m in modals:
        log_test(f'id="{m}"' in html, f"{p} has modal #{m}")
    
    # Verify unhandled href="#" links
    links = re.findall(r'<a\s+[^>]*href="#"[^>]*>', html)
    unhandled = []
    for link in links:
        is_handled = any(cls in link for cls in handled_classes) or 'id="' in link or 'onclick=' in link
        if not is_handled:
            unhandled.append(link)
            
    log_test(len(unhandled) == 0, f"{p} clean of unhandled href='#' links", f"{len(unhandled)} unhandled")

print("\n======================================================================")
print(f"📊 DOM INTEGRITY RESULTS: {passes} PASSED, {fails} FAILED")
print("======================================================================\n")

if fails > 0:
    sys.exit(1)
else:
    sys.exit(0)
EOF
