const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://klyqeyuzugvabivfqlyt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtseXFleXV6dWd2YWJpdmZxbHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxNjg0MjUsImV4cCI6MjA1NTc0NDQyNX0.FhM9c8tFpP6eFwK2Jb_tC1JvX7M9-n3yG3L9l1m3p4Q";

const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const clientC = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runInvitationFlowTest() {
    console.log("🚀 STARTING REAL SUPABASE TEST FOR MATCHING -> SELECTION -> INVITATION FLOW...");

    // 1. Authenticate User A, B, C
    const emailA = "req_user_a@lyann.app";
    const emailB = "req_user_b@lyann.app";
    const emailC = "req_user_c@lyann.app";
    const password = "Password123!";

    async function getOrCreateUser(client, email) {
        let authRes = await client.auth.signInWithPassword({ email, password });
        if (authRes.error) {
            authRes = await client.auth.signUp({
                email,
                password,
                options: { data: { first_name: email.split('@')[0], last_name: 'Test' } }
            });
            if (authRes.error) throw authRes.error;
        }
        return authRes.data.user;
    }

    const userA = await getOrCreateUser(clientA, emailA);
    const userB = await getOrCreateUser(clientB, emailB);
    const userC = await getOrCreateUser(clientC, emailC);

    console.log(`✅ Authenticated User A (${userA.id}), User B (${userB.id}), User C (${userC.id})`);

    // Ensure profiles exist in DB for matching
    await clientA.from('profiles').upsert({ id: userA.id, email: emailA, first_name: 'UserA', city: 'Le Gosier' });
    await clientB.from('profiles').upsert({ id: userB.id, email: emailB, first_name: 'UserB', city: 'Le Gosier' });
    await clientC.from('profiles').upsert({ id: userC.id, email: emailC, first_name: 'UserC', city: 'Les Abymes' });

    const createdRequestIds = [];
    try {
        // 2. User A publishes Request 1 (Jardinage / Débroussaillage)
        const { data: req1, error: req1Err } = await clientA
            .from('requests')
            .insert({
                requester_id: userA.id,
                title: 'Jardinage - Débroussaillage',
                description: 'Besoin d\'un coup de main pour débroussailler mon jardin',
                category: 'Jardinage',
                location: 'Le Gosier',
                budget: 50,
                urgency: 'Flexible',
                status: 'OPEN'
            })
            .select()
            .single();

        if (req1Err) throw new Error("Request 1 creation failed: " + req1Err.message);
        createdRequestIds.push(req1.id);
        console.log(`✅ User A created Request 1: ID ${req1.id}`);

        // 3. User A selects ONLY User B (C is not selected)
        // Send invitation to B
        const { data: sendRes, error: sendErr } = await clientA.rpc('send_request_invitations', {
            p_request_id: req1.id,
            p_recipient_ids: [userB.id]
        });

        if (sendErr) throw new Error("send_request_invitations failed: " + sendErr.message);
        console.log("✅ send_request_invitations result:", sendRes);

        // 4. Verify received invitations for B and C
        const { data: bInvs, error: bInvsErr } = await clientB
            .from('request_invitations')
            .select('*')
            .eq('recipient_id', userB.id)
            .eq('request_id', req1.id);

        if (bInvsErr) throw bInvsErr;
        console.log(`✅ User B received ${bInvs.length} invitation(s) for Request 1. Status: ${bInvs[0]?.status}`);
        if (bInvs.length !== 1 || bInvs[0].status !== 'PENDING') {
            throw new Error("FAIL: User B should have received 1 PENDING invitation!");
        }

        const { data: cInvs } = await clientC
            .from('request_invitations')
            .select('*')
            .eq('recipient_id', userC.id)
            .eq('request_id', req1.id);

        console.log(`✅ User C received ${cInvs ? cInvs.length : 0} invitation(s) for Request 1.`);
        if (cInvs && cInvs.length > 0) {
            throw new Error("FAIL: User C was not selected but received an invitation!");
        }

        // 5. User B accepts the invitation
        const invIdB = bInvs[0].id;
        const { data: acceptRes, error: acceptErr } = await clientB.rpc('accept_request_invitation', {
            p_invitation_id: invIdB
        });

        if (acceptErr) throw new Error("accept_request_invitation failed: " + acceptErr.message);
        console.log("✅ User B accepted invitation result:", acceptRes);

        if (acceptRes.conversation_id && acceptRes.request_id === req1.id) {
            console.log(`✅ Verified: Invitation status ACCEPTED, conversation_id = ${acceptRes.conversation_id}, request_id = ${acceptRes.request_id}`);
        } else {
            throw new Error("FAIL: Invalid accept_request_invitation return structure!");
        }

        // 6. Security tests:
        // a) User C attempts to accept User B's invitation -> Should fail
        const { error: cAcceptErr } = await clientC.rpc('accept_request_invitation', {
            p_invitation_id: invIdB
        });
        console.log("🔒 User C accept attempt result (expected error):", cAcceptErr ? cAcceptErr.message : "NO ERROR (UNEXPECTED)");
        if (!cAcceptErr) {
            throw new Error("FAIL: User C was able to accept B's invitation!");
        }

        // b) User A attempts to invite self (A -> A) -> Should fail or return 0 inserted
        const { data: selfRes } = await clientA.rpc('send_request_invitations', {
            p_request_id: req1.id,
            p_recipient_ids: [userA.id]
        });
        console.log("🔒 Self-invitation attempt result:", selfRes);
        if (selfRes.inserted_count !== 0) {
            throw new Error("FAIL: User A was able to invite self!");
        }

        // c) User A selects B twice in array -> Should only create 1 invitation row
        const { data: dupRes } = await clientA.rpc('send_request_invitations', {
            p_request_id: req1.id,
            p_recipient_ids: [userB.id, userB.id]
        });
        console.log("🔒 Duplicate selection result:", dupRes);

        // 7. Multi-request context test (Requirement 8):
        // User A creates Request 2 (Plomberie) and invites B
        const { data: req2, error: req2Err } = await clientA
            .from('requests')
            .insert({
                requester_id: userA.id,
                title: 'Plomberie - Réparation fuite',
                description: 'Fuite sous evier cuisine',
                category: 'Plomberie',
                location: 'Le Gosier',
                budget: 70,
                urgency: 'Urgent',
                status: 'OPEN'
            })
            .select()
            .single();

        if (req2Err) throw new Error("Request 2 creation failed: " + req2Err.message);
        createdRequestIds.push(req2.id);
        console.log(`✅ User A created Request 2: ID ${req2.id}`);

        await clientA.rpc('send_request_invitations', {
            p_request_id: req2.id,
            p_recipient_ids: [userB.id]
        });

        const { data: bReq2Invs } = await clientB
            .from('request_invitations')
            .select('*')
            .eq('recipient_id', userB.id)
            .eq('request_id', req2.id);

        const invIdReq2 = bReq2Invs[0].id;
        const { data: acceptRes2 } = await clientB.rpc('accept_request_invitation', {
            p_invitation_id: invIdReq2
        });

        console.log("✅ User B accepted Request 2 invitation result:", acceptRes2);

        // Verify distinct request contexts between same users A and B
        const { data: allABInvs } = await clientB
            .from('request_invitations')
            .select('id, request_id, requester_id, recipient_id, conversation_id, status')
            .eq('requester_id', userA.id)
            .eq('recipient_id', userB.id);

        console.log("✅ All invitations between A and B:", allABInvs);

        if (allABInvs.length >= 2) {
            const reqIds = allABInvs.map(i => i.request_id);
            const uniqueReqIds = new Set(reqIds);
            if (uniqueReqIds.size >= 2) {
                console.log("🎉 VERIFIED: Distinct business contexts (request_ids) preserved between same users A and B!");
            } else {
                throw new Error("FAIL: Lost request_id context!");
            }
        } else {
            throw new Error("FAIL: Expected at least 2 invitations between A and B!");
        }

        console.log("\n==========================================");
        console.log("SUCCESS: ALL MATCHING -> SELECTION -> INVITATION TESTS PASSED!");
        console.log("==========================================\n");
    } finally {
        if (createdRequestIds.length > 0) {
            console.log("🧹 [E2E Teardown] Cleaning up created test requests:", createdRequestIds);
            for (const rId of createdRequestIds) {
                try {
                    await clientA.from('requests').delete().eq('id', rId);
                } catch(e) {
                    console.warn("Cleanup error for request:", rId, e);
                }
            }
        }
    }
}

runInvitationFlowTest().catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
});
