# 🚀 LYANN — PRODUCTION DEPLOYMENT & HARDENING CHECKLIST

Ce document récapitule la checklist obligatoire à valider avant tout déploiement officiel en production de la plateforme **LYANN**.

---

## 1. 🔐 SECRETS & VARIABLES D'ENVIRONNEMENT
- [x] **`STRIPE_SECRET_KEY`** : Clé secrète Stripe (`sk_live_...` / `sk_test_...`) configurée exclusivement dans les variables d'environnement du serveur backend.
- [x] **`STRIPE_WEBHOOK_SECRET`** : Clé de signature du webhook Stripe (`whsec_...`) configurée côté serveur.
- [x] **`SUPABASE_SERVICE_ROLE_KEY`** : Clé d'administration Supabase stockée hors du code client.
- [x] **`.gitignore`** : `.env`, `.env.local`, `.env.production` présents dans `.gitignore`. Aucun secret commité dans le dépôt Git.
- [x] **Garde-fou Production** : Le serveur backend (`api/server.js`) et le client (`payment-script.js`) échouent immédiatement si `NODE_ENV=production` et que la clé Stripe est absente.

---

## 2. 🗄️ SUPABASE, BASE DE DONNÉES & RLS
- [x] **Source de vérité unique** : PostgreSQL Supabase est l'unique source de vérité backend (`schema.sql`).
- [x] **Machine à états financiers** : Statuts explicites (`REQUIRES_PAYMENT`, `PROCESSING`, `PAID`, `HELD`, `RELEASE_PENDING`, `RELEASED`, `REFUNDED`, `CANCELLED`).
- [x] **Politiques RLS** : Politiques de sécurité au niveau des lignes activées (`ALTER TABLE missions ENABLE ROW LEVEL SECURITY;`). Seuls les participants à la mission peuvent accéder à leurs transactions.

---

## 3. 💳 STRIPE PAYMENTS & ARCHITECTURE CONNECT
- [x] **Calcul des montants côté serveur** :
  - Sous-total : Prix du devis convenu.
  - Commission LYANN : 3% (ajouté au sous-total, prélevé côté serveur).
  - Protection LYANN : 4,90 € (ajouté au sous-total, prélevé côté serveur).
  - Formule : `Total = Devis + (Devis * 0.03) + 4.90`.
- [x] **Protection Idempotence** : Headers `idempotencyKey` obligatoires sur toutes les requêtes de création de PaymentIntent.
- [x] **Stripe Connect Destination Charges** : Transferts automatiques avec `application_fee_amount = (3% commission) + 4.90€`.
- [x] **Mentions juridiques conformes** : Formulations juridiques conformes : **"Paiement Sécurisé & Protection LYANN"** (aucun terme séquestre/escrow abusif).

---

## 4. 🌐 DÉPLOIEMENT SERVEUR BACKEND & CORS
- [x] **CORS Sécurisé** : En-têtes CORS configurés sur `/v1/payments/create-intent` et `/v1/payments/webhook`.
- [x] **Webhook Endpoint** : `/v1/payments/webhook` prêt à recevoir les événements `payment_intent.succeeded` et `payment_intent.payment_failed`.

---

## 5. 📱 BUILDS ET COMPILATION NATIVE
- [x] **iOS Native** : Xcode project `ios/App/App.xcodeproj` → `** BUILD SUCCEEDED **` sur simulateur iPhone 17.
- [ ] **Android Native** : Nécessite l'installation du SDK Java (JDK 17) sur le serveur de build CI/CD pour exécuter `./gradlew assembleDebug` & `./gradlew bundleRelease`.

---

## 6. 📄 CONFORMITÉ LÉGALE ET SUPPORT
- [x] Mentions Légales & Politiques de Confidentialité accessibles.
- [x] Option de suppression du compte et RGPD.
- [x] Contact Support & Aide Intégrée.
