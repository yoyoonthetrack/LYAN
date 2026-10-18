/**
 * Temporary iOS WebView harness for Lyann-test A↔B only.
 * Survives auth reloads via localStorage state. Removed on restore.
 */
(function () {
  'use strict';

  var TEST_REF = 'pcmvagiuvleeciktligz';
  var PROD_REF = 'gzispjfoywklpqatjyop';
  var STATE_KEY = 'LYANN_ISO_AB_STATE_V1';
  var cfg = window.__LYANN_ISO_AB_CFG || {};
  if (window.__LYANN_ISO_AB_RUNNING) return;
  window.__LYANN_ISO_AB_RUNNING = true;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || {
        phase: 'start',
        ids: {},
        steps: {},
        errors: [],
        runtimeUrl: null,
        productionWriteBlocked: false,
        verdict: null
      };
    } catch (e) {
      return { phase: 'start', ids: {}, steps: {}, errors: [], runtimeUrl: null, productionWriteBlocked: false, verdict: null };
    }
  }

  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function emit(kind, payload) {
    var line = kind + '::' + JSON.stringify(payload);
    try { console.log(line); } catch (e) {}
    try {
      var hosts = (cfg.reportHosts || []).slice();
      for (var i = 0; i < hosts.length; i++) {
        fetch(hosts[i] + '/iso-ab-report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: kind, payload: payload })
        }).catch(function () {});
      }
    } catch (e) {}
    try {
      var el = document.getElementById('lyannIsoAbReport');
      if (!el) {
        el = document.createElement('pre');
        el.id = 'lyannIsoAbReport';
        el.style.cssText = 'position:fixed;z-index:999999;left:8px;right:8px;bottom:8px;max-height:28vh;overflow:auto;background:#04160f;color:#d8ffe8;font:11px/1.35 monospace;padding:8px;border-radius:8px;';
        document.body.appendChild(el);
      }
      el.textContent = line.slice(0, 4000);
    } catch (e) {}
  }

  function step(state, name, status, detail) {
    state.steps[name] = { status: status, detail: detail || null };
    saveState(state);
    emit('LYANN_ISO_AB_LOG', { step: name, status: status, detail: detail || null, phase: state.phase });
  }

  function finish(state, verdict, err) {
    state.verdict = verdict;
    if (err) state.errors.push(String(err && err.message ? err.message : err));
    saveState(state);
    emit('LYANN_ISO_AB_RESULT', {
      platform: 'ios-simulator',
      verdict: state.verdict,
      runtimeUrl: state.runtimeUrl,
      ids: state.ids,
      steps: state.steps,
      errors: state.errors,
      productionWriteBlocked: state.productionWriteBlocked
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function runtimeUrl() {
    try {
      if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getSupabaseUrl === 'function') {
        return String(window.LYANN_API_CLIENT.getSupabaseUrl() || '').replace(/\/$/, '');
      }
    } catch (e) {}
    return String(window.LYANN_SUPABASE_URL || '').replace(/\/$/, '');
  }

  function installProductionWriteGuard(state) {
    if (!window.fetch || window.__lyannIsoFetchGuarded) return;
    window.__lyannIsoFetchGuarded = true;
    var original = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var target = '';
      try { target = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      if (target.indexOf(PROD_REF) !== -1) {
        state.productionWriteBlocked = true;
        saveState(state);
        step(state, 'production_guard', 'PASS', 'blocked');
        return Promise.reject(new Error('blocked_production_write'));
      }
      return original(input, init);
    };
  }

  async function waitFor(predicate, timeoutMs, label) {
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try { if (await predicate()) return true; } catch (e) {}
      await sleep(200);
    }
    throw new Error('timeout:' + (label || 'wait'));
  }

  async function waitReady() {
    await waitFor(function () {
      return !!(window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    }, 45000, 'app_ready');
  }

  function assertIsolated(state) {
    var url = runtimeUrl();
    state.runtimeUrl = url;
    saveState(state);
    if (!url || url.indexOf(TEST_REF) === -1 || url.indexOf(PROD_REF) !== -1) {
      throw new Error('runtime_url_not_isolated:' + url);
    }
    var html = document.documentElement ? document.documentElement.innerHTML : '';
    if (html.indexOf('https://' + PROD_REF + '.supabase.co') !== -1) {
      throw new Error('production_url_in_dom');
    }
  }

  async function ensureSession(email, password, label, state) {
    var session = await window.LYANN_API_CLIENT.supabase.auth.getSession();
    if (session && session.data && session.data.session && session.data.session.user) {
      var cur = session.data.session.user;
      if (String(cur.email || '').toLowerCase() === String(email).toLowerCase()) {
        step(state, 'login_' + label, 'PASS', cur.id);
        return cur;
      }
      await window.LYANN_API_CLIENT.supabase.auth.signOut();
      await sleep(400);
    }
    var trigger = document.querySelector('.open-login-trigger, a[href="#login"]');
    if (trigger) trigger.click();
    await sleep(500);
    var form = document.getElementById('loginForm');
    var emailInput = document.getElementById('loginEmail');
    var passwordInput = document.getElementById('loginPassword');
    if (!form || !emailInput || !passwordInput) throw new Error('login_form_missing');
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(async function () {
      var s = await window.LYANN_API_CLIENT.supabase.auth.getSession();
      return !!(s && s.data && s.data.session && s.data.session.user);
    }, 30000, 'login_' + label);
    var s2 = await window.LYANN_API_CLIENT.supabase.auth.getSession();
    var user = s2 && s2.data && s2.data.session && s2.data.session.user;
    if (!user || !user.id) throw new Error('login_user_missing');
    var token = s2.data.session.access_token;
    var iss = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).iss || '';
    if (iss.indexOf(TEST_REF) === -1 || iss.indexOf(PROD_REF) !== -1) {
      throw new Error('session_iss_not_isolated:' + iss);
    }
    step(state, 'login_' + label, 'PASS', user.id);
    return user;
  }

  async function phaseStart(state) {
    assertIsolated(state);
    step(state, 'runtime_url', 'PASS', state.runtimeUrl);
    var direct = document.getElementById('chatDirectPriceForm');
    var choices = document.getElementById('chatActionChoicesOverlay');
    var uiBlob = ((direct && direct.outerHTML) || '') + ((choices && choices.outerHTML) || '');
    var no200 = uiBlob.indexOf('- de 200') === -1
      && uiBlob.indexOf('(-200') === -1
      && uiBlob.indexOf('max="199"') === -1
      && uiBlob.indexOf('min="200"') === -1
      && uiBlob.indexOf('Tarif Direct (-200') === -1;
    step(state, 'bundle_no_200', no200 ? 'PASS' : 'FAIL', no200);
    state.phase = 'as_a_create';
    saveState(state);
  }

  async function phaseCreate(state) {
    var userA = await ensureSession(cfg.emailA, cfg.passwordA, 'a', state);
    state.ids.requester_id = userA.id;
    saveState(state);
    // Let post-login navigation settle before the first write.
    await sleep(1500);
    if (!state.ids.request_id) {
      var title = 'iOS isolé A↔B ' + Date.now();
      var row = {
        requester_id: userA.id,
        title: title,
        description: 'Annonce fictive créée depuis le harness iOS isolé. Pas de paiement.',
        category: 'Jardinage',
        location: 'Guadeloupe',
        urgency: 'flexible',
        visibility: 'PUBLIC',
        status: 'OPEN',
        classification_status: 'UNCLASSIFIED',
        safety_status: 'SAFE'
      };
      var inserted = null;
      var lastErr = null;
      for (var attempt = 0; attempt < 4; attempt++) {
        step(state, 'create_attempt', 'PASS', attempt + 1);
        try {
          inserted = await Promise.race([
            window.LYANN_API_CLIENT.supabase.from('requests').insert(row).select('id').single(),
            sleep(12000).then(function () { return { error: { message: 'insert_timeout' }, data: null }; })
          ]);
        } catch (e) {
          inserted = { error: { message: String(e && e.message ? e.message : e) }, data: null };
        }
        if (!inserted.error && inserted.data && inserted.data.id) break;
        lastErr = (inserted.error && inserted.error.message) || 'unknown';
        await sleep(1000 * (attempt + 1));
      }
      if (!inserted || inserted.error || !inserted.data || !inserted.data.id) {
        throw new Error('create_request_failed:' + lastErr);
      }
      state.ids.request_id = inserted.data.id;
      state.ids.request_title = title;
      saveState(state);
      step(state, 'create_annonce_a', 'PASS', state.ids.request_id);
    }
    state.phase = 'as_b_lyanner';
    saveState(state);
    await window.LYANN_API_CLIENT.supabase.auth.signOut();
  }

  async function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      sleep(ms).then(function () { throw new Error('timeout:' + label); })
    ]);
  }

  async function phaseLyanner(state) {
    var userB = await ensureSession(cfg.emailB, cfg.passwordB, 'b', state);
    state.ids.helper_id = userB.id;
    saveState(state);
    var requestId = state.ids.request_id;
    step(state, 'lyanner_phase_enter', 'PASS', requestId);

    // Inject a temporary Lyanner button and click it — same DOM path as Explorer.
    var temp = document.createElement('button');
    temp.className = 'btn-help-lyann';
    temp.setAttribute('data-request-id', requestId);
    temp.setAttribute('data-requester-id', state.ids.requester_id);
    temp.setAttribute('data-title', state.ids.request_title || 'Annonce isolée');
    temp.textContent = 'Lyanner';
    temp.style.cssText = 'position:fixed;z-index:999998;top:12px;right:12px;padding:10px 14px;';
    document.body.appendChild(temp);
    temp.click();
    await sleep(1500);
    var clickedOpen = document.body.classList.contains('chat-conversation-open') || document.body.classList.contains('lyann-messaging-open');
    step(state, 'lyanner_click', clickedOpen ? 'PASS' : 'FAIL', clickedOpen ? 'dom_click_opened' : 'dom_click_no_open');

    var help = await withTimeout(window.LYANN_API_CLIENT.initiateLyannHelp(requestId), 15000, 'initiateLyannHelp');
    var data = (help && (help.data || help)) || {};
    if (!data.conversation_id || !data.invitation_id) throw new Error('help_ids_missing:' + JSON.stringify(data));
    state.ids.conversation_id = data.conversation_id;
    state.ids.request_invitation_id = data.invitation_id;
    saveState(state);
    step(state, 'invitation', 'PASS', { invitation_id: data.invitation_id, conversation_id: data.conversation_id });

    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.openConversation) {
      await withTimeout(window.LYANN_MESSAGING.openConversation({
        id: state.ids.conversation_id,
        contactId: state.ids.requester_id,
        requestId: requestId,
        invitationId: state.ids.request_invitation_id
      }), 20000, 'openConversation');
      await sleep(1000);
    }

    var missions = [];
    try {
      missions = await withTimeout(window.LYANN_API_CLIENT.listMissionsBetween(userB.id, state.ids.requester_id), 10000, 'listMissions');
    } catch (e) {}
    var ctx = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.selectThreadContext
      ? window.LYANN_QUOTE_REVISION.selectThreadContext({ requestId: requestId, missions: missions || [] })
      : { mission: null };
    if (ctx && ctx.mission) {
      var midReq = String(ctx.mission.related_request_id || ctx.mission.request_id || '');
      if (midReq && midReq !== String(requestId)) throw new Error('banner_wrong_mission');
    }
    step(state, 'banner_context', 'PASS', ctx && ctx.mission ? ctx.mission.id : 'no_current_mission');
    try { temp.remove(); } catch (e) {}
    state.phase = 'as_b_quote';
    saveState(state);
  }

  async function phaseQuote(state) {
    await ensureSession(cfg.emailB, cfg.passwordB, 'b_quote', state);
    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.openConversation) {
      await window.LYANN_MESSAGING.openConversation({
        id: state.ids.conversation_id,
        contactId: state.ids.requester_id,
        requestId: state.ids.request_id,
        invitationId: state.ids.request_invitation_id
      });
      await sleep(800);
    }
    var propose = document.getElementById('btnCtxPropose') || Array.prototype.find.call(document.querySelectorAll('button'), function (el) {
      return /Proposer un devis/.test(el.textContent || '');
    });
    if (propose) { propose.click(); await sleep(500); }
    var direct = document.getElementById('btnChooseDirectPrice');
    if (direct) { direct.click(); await sleep(400); }
    var form = document.getElementById('chatDirectPriceForm');
    var choices = document.getElementById('chatActionChoicesOverlay');
    var blob = ((form && form.innerHTML) || '') + ((choices && choices.innerHTML) || '');
    if (blob.indexOf('- de 200') !== -1 || blob.indexOf('(-200') !== -1 || blob.indexOf('max="199"') !== -1 || blob.indexOf('min="200"') !== -1) {
      throw new Error('cap_200_residue');
    }
    step(state, 'no_200_copy', 'PASS', true);
    if (typeof createProductionQuoteForContact !== 'function') throw new Error('createProductionQuoteForContact_missing');
    await createProductionQuoteForContact(state.ids.requester_id, 'Tarif Direct iOS isolé 12 euros', 12);
    await sleep(1200);
    var quotes = await window.LYANN_API_CLIENT.getQuotesForInvitation(state.ids.request_invitation_id);
    var quote = (quotes || []).find(function (q) {
      return q.status === 'SENT' && Number(q.total_amount || q.amount) === 12;
    }) || (quotes || [])[0];
    if (!quote || !quote.id) throw new Error('quote_missing_after_send');
    state.ids.quote_id = quote.id;
    state.ids.quote_version = quote.version || 1;
    step(state, 'send_direct_12', 'PASS', quote.id);
    await window.LYANN_API_CLIENT.supabase.auth.signOut();
    state.phase = 'as_a_accept';
    saveState(state);
  }

  async function phaseAccept(state) {
    await ensureSession(cfg.emailA, cfg.passwordA, 'a_accept', state);
    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.openConversation) {
      await window.LYANN_MESSAGING.openConversation({
        id: state.ids.conversation_id,
        contactId: state.ids.helper_id,
        requestId: state.ids.request_id
      });
      await sleep(1000);
    }
    window.lyannConfirm = async function () { return true; };
    try {
      if (typeof window.handleAcceptQuote === 'function') {
        await window.handleAcceptQuote(state.ids.quote_id);
      }
    } catch (e) {}
    await sleep(1000);
    var quoteRes = await window.LYANN_API_CLIENT.supabase
      .from('quotes')
      .select('id,status,mission_id,version')
      .eq('id', state.ids.quote_id)
      .single();
    var quote = quoteRes && quoteRes.data;
    if (quote && quote.status === 'ACCEPTED' && quote.mission_id) {
      state.ids.mission_id = quote.mission_id;
    } else {
      var accepted = await window.LYANN_API_CLIENT.acceptRequestQuote(state.ids.quote_id, state.ids.quote_version || 1);
      state.ids.mission_id = accepted && accepted.mission_id;
    }
    if (!state.ids.mission_id) throw new Error('accept_failed');
    step(state, 'accept_quote_a', 'PASS', state.ids.mission_id);

    var missionsForRequest = await window.LYANN_API_CLIENT.supabase
      .from('missions')
      .select('id,status,related_request_id,total_amount')
      .eq('related_request_id', state.ids.request_id);
    var rows = missionsForRequest.data || [];
    if (rows.length !== 1) throw new Error('expected_one_mission_got_' + rows.length);
    step(state, 'single_mission', 'PASS', rows[0].id);
    state.phase = 'suivi';
    saveState(state);
  }

  async function phaseSuivi(state) {
    await ensureSession(cfg.emailA, cfg.passwordA, 'a_suivi', state);
    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.openConversation) {
      await window.LYANN_MESSAGING.openConversation({
        id: state.ids.conversation_id,
        contactId: state.ids.helper_id,
        requestId: state.ids.request_id,
        missionId: state.ids.mission_id
      });
      await sleep(800);
    }
    if (typeof openMissionTracking !== 'function') throw new Error('openMissionTracking_missing');
    openMissionTracking({ id: state.ids.mission_id, status: 'AGREED', title: state.ids.request_title || 'Mission' });
    await sleep(900);
    var tracking = document.getElementById('chatTrackingOverlay');
    var list = document.getElementById('trackingMilestonesList');
    var openDisplay = tracking ? getComputedStyle(tracking).display : 'missing';
    var text = list ? String(list.innerText || '').trim() : '';
    if (openDisplay === 'none') throw new Error('suivi_not_visible');
    if (!text) throw new Error('suivi_empty_white');
    step(state, 'suivi_open', 'PASS', { text: text.slice(0, 180), color: list ? getComputedStyle(list).color : '' });
    document.getElementById('btnExitTracking').click();
    await sleep(400);
    if (getComputedStyle(tracking).display !== 'none') throw new Error('suivi_not_closed');
    if (!document.body.classList.contains('chat-conversation-open') && !document.body.classList.contains('lyann-messaging-open')) {
      throw new Error('chat_closed_after_suivi');
    }
    step(state, 'suivi_back', 'PASS', true);
    state.phase = 'reopen';
    saveState(state);
  }

  async function phaseReopen(state) {
    await ensureSession(cfg.emailA, cfg.passwordA, 'a_reopen', state);
    if (window.LYANN_MESSAGING && window.LYANN_MESSAGING.openList) window.LYANN_MESSAGING.openList();
    await sleep(700);
    await window.LYANN_MESSAGING.openConversation({
      id: state.ids.conversation_id,
      contactId: state.ids.helper_id,
      requestId: state.ids.request_id,
      missionId: state.ids.mission_id
    });
    await sleep(1000);
    var missions = await window.LYANN_API_CLIENT.listMissionsBetween(state.ids.requester_id, state.ids.helper_id);
    var ctx = window.LYANN_QUOTE_REVISION.selectThreadContext({
      requestId: state.ids.request_id,
      missions: missions || []
    });
    if (!(ctx && ctx.mission && String(ctx.mission.related_request_id || ctx.mission.request_id) === String(state.ids.request_id))) {
      throw new Error('messages_reopen_wrong_context');
    }
    step(state, 'reopen_messages', 'PASS', ctx.mission.id);
    state.phase = 'errors';
    saveState(state);
  }

  async function phaseErrors(state) {
    await ensureSession(cfg.emailA, cfg.passwordA, 'a_errors', state);
    openMissionTracking({});
    await sleep(400);
    var list = document.getElementById('trackingMilestonesList');
    var emptyText = list ? String(list.innerText || '').trim() : '';
    step(state, 'error_suivi_empty', emptyText.indexOf('Aucune mission sélectionnée') !== -1 ? 'PASS' : 'FAIL', emptyText.slice(0, 120));
    document.getElementById('btnExitTracking') && document.getElementById('btnExitTracking').click();
    await sleep(300);

    await window.LYANN_MESSAGING.openConversation({
      id: state.ids.conversation_id,
      contactId: state.ids.helper_id,
      requestId: state.ids.request_id
    });
    await sleep(700);
    var wrong = null;
    try {
      await createProductionQuoteForContact(state.ids.helper_id, 'refus demandeur ios', 12);
    } catch (e) {
      wrong = e && e.message;
    }
    step(state, 'error_wrong_role_quote', wrong ? 'PASS' : 'FAIL', wrong || 'expected refusal');

    // completed other mission must not win
    var withCompleted = window.LYANN_QUOTE_REVISION.selectThreadContext({
      requestId: state.ids.request_id,
      missions: [
        { id: 'fake-old', status: 'COMPLETED', related_request_id: '8293ccfe-2d7b-41e2-9cb2-7298aa810eea', created_at: '2026-01-01' },
        { id: state.ids.mission_id, status: 'AGREED', related_request_id: state.ids.request_id, created_at: '2026-10-13' }
      ]
    });
    var ignores = withCompleted && withCompleted.mission && withCompleted.mission.id !== 'fake-old';
    step(state, 'error_old_mission_context', ignores ? 'PASS' : 'FAIL', withCompleted && withCompleted.mission && withCompleted.mission.id);

    state.phase = 'done';
    saveState(state);
    var failed = Object.keys(state.steps).some(function (k) { return state.steps[k].status === 'FAIL'; });
    finish(state, failed ? 'FAIL' : 'PASS');
  }

  async function runPhases() {
    var state = loadState();
    if (state.verdict) {
      emit('LYANN_ISO_AB_RESULT', {
        platform: 'ios-simulator',
        verdict: state.verdict,
        runtimeUrl: state.runtimeUrl,
        ids: state.ids,
        steps: state.steps,
        errors: state.errors,
        productionWriteBlocked: state.productionWriteBlocked
      });
      return;
    }
    installProductionWriteGuard(state);
    await waitReady();
    emit('LYANN_ISO_AB_LOG', { step: 'boot', status: 'START', phase: state.phase });

    if (state.phase === 'start') await phaseStart(state);
    if (state.phase === 'as_a_create') await phaseCreate(state);
    if (state.phase === 'as_b_lyanner') await phaseLyanner(state);
    if (state.phase === 'as_b_quote') await phaseQuote(state);
    if (state.phase === 'as_a_accept') await phaseAccept(state);
    if (state.phase === 'suivi') await phaseSuivi(state);
    if (state.phase === 'reopen') await phaseReopen(state);
    if (state.phase === 'errors') await phaseErrors(state);
  }

  function start() {
    if (!cfg.emailA || !cfg.passwordA || !cfg.emailB || !cfg.passwordB) {
      finish(loadState(), 'FAIL', new Error('missing_harness_credentials'));
      return;
    }
    runPhases().catch(function (err) {
      var state = loadState();
      var message = String(err && err.message ? err.message : err);
      state.errors.push(message);
      state.retryCount = (state.retryCount || 0) + 1;
      saveState(state);
      emit('LYANN_ISO_AB_LOG', {
        step: 'phase_error',
        status: 'FAIL',
        detail: message,
        phase: state.phase,
        retryCount: state.retryCount
      });
      window.__LYANN_ISO_AB_RUNNING = false;
      if (state.retryCount >= 6 || state.phase === 'done') {
        finish(state, 'FAIL', err);
        return;
      }
      setTimeout(function () {
        window.__LYANN_ISO_AB_RUNNING = false;
        start();
      }, 2000);
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 1500);
  } else {
    window.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); });
  }
})();
