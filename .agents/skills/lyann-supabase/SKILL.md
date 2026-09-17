---
name: lyann-supabase
description: >
  Supabase, authentication, PostgreSQL, RLS and persistence
  methodology for LYANN V1. Use when working with auth,
  profiles, requests, conversations, messages, proposals,
  missions, storage, database access, migrations, RPC,
  Supabase errors or row-level security.
---

# LYANN Supabase

## Source of truth

Supabase/PostgreSQL is authoritative for persistent application data.

Frontend state must not pretend persistence occurred before the
backend confirms success.

## Real identities only

Authenticated identity must come from the real authentication session.

Database IDs must come from the database.

Never invent runtime identifiers such as:

user-current
user-1
conv-1
req-1

Never replace an invalid ID with a valid-looking invented UUID.

## Authentication

Protected functionality must distinguish:

AUTH LOADING
UNAUTHENTICATED
AUTHENTICATED
ONBOARDING REQUIRED
READY

Never fabricate an authenticated user when the session is missing.

## RLS

Never bypass Row Level Security to make functionality work.

For private resources, verify at least:

A — legitimate owner/requester

B — legitimate participant/Lyanneur

C — unrelated authenticated user

C must not gain access merely by knowing a UUID.

## Server authority

Sensitive actor identity and authorization should be derived
server-side from authenticated context whenever possible.

Do not trust privileged client fields such as:

user_id
owner_id
sender_id
role
payment status
authorization flags

when they can be derived securely.

## Messaging

Messages must use:
- real conversation;
- real participants;
- authenticated sender;
- persisted message;
- correct RLS.

Verify:

SEND
→ BACKEND SUCCESS
→ MESSAGE DISPLAYED
→ RELOAD
→ MESSAGE STILL PRESENT

An unrelated user must not access the conversation.

## Business entities

Do not confuse:

Request
Conversation
Proposal
Mission

Invitation is not Proposal.

Important status transitions must preserve business history.

Accepted contractual information must not be silently overwritten.

## Migrations

Schema changes must use versioned migrations.

Keep repository migrations and deployed schema synchronized.

Do not make undocumented production schema edits.

Before creating a migration:
- inspect current schema;
- inspect existing migrations;
- confirm the change is actually required.

## Errors

Never convert Supabase/backend failure into UI success.

Handle:
- loading;
- empty;
- validation;
- auth failure;
- permission failure;
- network failure;
- backend failure.

Technical details belong in logs, not user-facing messages.

## Testing

Persistence validation:

ACTION
→ DATABASE SUCCESS
→ UI UPDATE
→ RELOAD
→ DATA STILL PRESENT

Security validation:

USER A
USER B
USER C

Do not report Supabase functionality as verified if the SDK,
environment, authentication or backend required for the test
was unavailable.
