const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, content) { fs.writeFileSync(path.join(root, file), content, 'utf8'); }
function replaceRequired(source, regex, replacement, label) {
  if (!regex.test(source)) throw new Error(`V2 migration pattern not found: ${label}`);
  return source.replace(regex, replacement);
}

function migrateApiClient() {
  let src = read('api-client.js');

  src = src
    .replace(' * Includes LocalStorage Mock Backend for DEV/Testing of the Messaging & AI System', ' * Production Supabase client. No local mock business-data fallback is permitted.')
    .replace('    console.warn("⚠️ Supabase JS SDK missing. Running in Mock Mode only.");\n    console.log("⚡ [BOOT 03] Supabase ready (Mock Mode)");', '    console.error("⚠️ Supabase JS SDK missing. Production data features are unavailable.");\n    console.log("⚡ [BOOT 03] Supabase unavailable");');

  src = replaceRequired(
    src,
    /\/\/ ----------------------------------------------------------------------\n\/\/ MOCK LOCAL DATABASE FOR MISSIONS[\s\S]*?(?=function normalizeAuthError)/,
    '// ----------------------------------------------------------------------\n// PRODUCTION DATA POLICY: business data is remote-only (Supabase/RPC).\n// No localStorage mission/message/service fallback is allowed.\n// ----------------------------------------------------------------------\n',
    'remove local mission mock database'
  );

  src = replaceRequired(
    src,
    /    async getActiveMissionBetween\(userId1, userId2\) \{[\s\S]*?\n    async mockCreateNeed\(requesterId, helperId, title\) \{[\s\S]*?\n    \},\n\n    \/\/ --- QUOTES & MILESTONES/,
`    async getActiveMissionBetween(userId1, userId2) {
        if (!isUUID(userId1) || !isUUID(userId2) || !this.supabase) return null;
        try {
            const { data, error } = await this.supabase
                .from('missions')
                .select('*')
                .or(\`and(requester_id.eq.\${userId1},helper_id.eq.\${userId2}),and(requester_id.eq.\${userId2},helper_id.eq.\${userId1})\`)
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error('[MISSIONS] active mission query failed', error);
            return null;
        }
    },

    /** @deprecated Local mock mission creation is disabled in production. */
    async mockCreateNeed() {
        throw new Error('Legacy local mission creation is disabled. Use the request/invitation workflow.');
    },

    // --- QUOTES & MILESTONES`,
    'replace active mission/mock creation'
  );

  src = replaceRequired(
    src,
    /    \/\*\* @deprecated Code legacy fallback\. Préférer createRequestQuote\(\) \*\/[\s\S]*?\n\n    \/\/ --- STATE MACHINE & ROLE-BASED ACTIONS ---/,
`    /** @deprecated Compatibility wrapper. Remote production data only. */
    async mockProposePrice(proposerId, receiverId, amount, description) {
        if (!isUUID(proposerId) || !isUUID(receiverId) || !this.supabase) {
            throw new Error('Proposition impossible sans session Supabase valide.');
        }
        const mission = await this.getActiveMissionBetween(proposerId, receiverId);
        if (!mission || mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
            const { data, error } = await this.supabase.from('missions').insert({
                requester_id: receiverId,
                helper_id: proposerId,
                title: description || 'Service demandé',
                agreed_price: amount,
                status: 'PROPOSED',
                proposed_by: proposerId
            }).select().single();
            if (error) throw error;
            return data;
        }
        const { data, error } = await this.supabase.from('missions').update({
            agreed_price: amount,
            status: 'PROPOSED',
            proposed_by: proposerId,
            title: description || mission.title
        }).eq('id', mission.id).select().single();
        if (error) throw error;
        return data;
    },

    async mockAcceptPrice(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'AGREED' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockPayMission(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'IN_PROGRESS', payment_status: 'PAID_ESCROW' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockMarkMissionDone(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'WORK_MARKED_COMPLETE' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockConfirmMissionCompletion(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'COMPLETED' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockReportProblem(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'DISPUTE' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    // --- STATE MACHINE & ROLE-BASED ACTIONS ---`,
    'remove mission local fallbacks'
  );

  // Stop creating fake services when Supabase is unavailable. Preserve the method
  // contract while failing closed so UI can show a real error instead of phantom state.
  src = src.replace(
    /    async addUserService\(userId, title, price, billing, description\) \{[\s\S]*?\n    \},\n\n    \/\/ --- ENTERPRISE ADMIN BACK-OFFICE METHODS ---/,
`    async addUserService(userId, title, price, billing, description) {
        if (!isUUID(userId) || !this.supabase) {
            throw new Error('Impossible d’ajouter un service sans session Supabase valide.');
        }
        const pricing_model = billing === '/ heure' ? 'HOURLY' :
                              billing === '/ jour' ? 'DAILY' :
                              billing === 'Sur devis' ? 'QUOTE' : 'FLAT_RATE';
        const indicative_price = (price === 'Sur devis' || isNaN(parseFloat(price))) ? null : parseFloat(price);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const { data, error } = await this.supabase
            .from('services')
            .insert({ owner_id: userId, title, slug, description, pricing_model, indicative_price, active: true })
            .select()
            .single();
        if (error) throw error;
        return {
            id: data.id,
            title: data.title,
            price: data.indicative_price ? data.indicative_price.toString() : 'Sur devis',
            billing,
            details: data.description || '',
            status: 'Actif'
        };
    },

    // --- ENTERPRISE ADMIN BACK-OFFICE METHODS ---`,
  );

  write('api-client.js', src);
}

function migrateChatLogic() {
  let src = read('chat-logic.js');

  src = src.replace("const CHAT_MSG_KEY = 'lyann_mock_chat_msgs';\n", '');

  src = replaceRequired(
    src,
    /function getMyId\(\) \{[\s\S]*?\n\}/,
`function getMyId() {
    const authId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId;
    return authId || window.CURRENT_USER_ID || null;
}`,
    'canonical chat user id'
  );

  src = replaceRequired(
    src,
    /\/\/ LYANN CHAT CHILD SURFACE AUTO-SYNC v1[\s\S]*?(?=function getLocalChatMessages)/,
`// Chat child-surface state is owned by messaging-ui.js / LYANN_MESSAGING.
// Legacy MutationObserver synchronization has been retired.

`,
    'remove legacy child surface observer'
  );

  src = replaceRequired(
    src,
    /function getLocalChatMessages\(contactId\) \{[\s\S]*?(?=function renderOptimisticChatMessage)/,
`async function getChatMessages(contactId, options = {}) {
    const userId = getMyId();
    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_MESSAGING_REPOSITORY) return [];
    try {
        return await window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, options);
    } catch (error) {
        console.warn('[MESSAGING] canonical message query failed', error);
        return [];
    }
}

`,
    'remove local chat message storage'
  );

  src = src.replace(
    /    if \(userId === "me" \|\| !isUUID\(contactId\) \|\| !window\.LYANN_API_CLIENT \|\| !window\.LYANN_API_CLIENT\.supabase\) \{[\s\S]*?        return;\n    \}\n\n    try \{/,
`    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_API_CLIENT?.supabase) {
        if (optimisticNode && optimisticNode.isConnected) {
            const status = optimisticNode.querySelector('[data-optimistic-status]');
            if (status) status.textContent = 'Non envoyé · connexion requise';
            optimisticNode.classList.add('chat-message-send-failed');
        }
        return;
    }

    try {`
  );

  src = src.replace(
    /\n    let storedMsgs = \{\};[\s\S]*?localStorage\.setItem\(CHAT_MSG_KEY, JSON\.stringify\(storedMsgs\)\);\n    \}\n/,
    '\n'
  );

  write('chat-logic.js', src);
}

function migrateAppShell() {
  let src = read('app-shell.js');
  src = replaceRequired(
    src,
    /function getPendingActions\(\) \{[\s\S]*?\n\}\n\n\/\/ === APP WELCOME SCREEN/,
`function getPendingActions() {
    // Synthetic localStorage chat alerts were retired. A future notification
    // repository may populate this surface from authoritative backend data.
    return [];
}

// === APP WELCOME SCREEN`,
    'remove mock dashboard chat alerts'
  );
  write('app-shell.js', src);
}

function cleanHtmlSources() {
  const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  for (const file of htmlFiles) {
    let src = read(file);
    src = src
      .replace(/david-34\.png/g, 'lyann-avatar-placeholder.svg')
      .replace(/\s*\(Simulé\)/gi, '')
      .replace(/value="4242 4242 4242 4242"/g, 'placeholder="Numéro de carte"')
      .replace(/value="12\/29"/g, 'placeholder="MM/AA"')
      .replace(/value="123"/g, 'placeholder="CVC"');
    write(file, src);
  }
}

function main() {
  migrateApiClient();
  migrateChatLogic();
  migrateAppShell();
  cleanHtmlSources();
  console.log('LYANN V2 source migration applied successfully.');
}

main();
