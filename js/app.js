// app.js — Cluely flow: control pill → Ask opens chat panel → session start/stop →
// double-click opens the dashboard. All feature logic (triggers, actions, notes,
// KB, screen, stealth, PiP, hotkeys) carried over from the verified v1.
(function () {
  const $ = (id) => document.getElementById(id);
  const Store = window.Store, LLM = window.LLM, KB = window.KB, Speech = window.Speech;

  // ---------- Live Insights trigger detection (mirrors their server-side keyword detection) ----------
  const OBJECTION = /\b(too expensive|too pricey|out of budget|not sure (this|it)|we (already|tried)|competitor|cheaper|budget is|hold off|not interested|think about it|another vendor)\b/i;
  const TERM = /\b(discounted cash flow|dcf|cap ?table| churn|arr|mrr|nrr|ebitda|sla|okr|kpi|latency|throughput|kubernetes|load balanc\w+|microservice\w*|api|oauth|sso|gdpr|soc ?2|rabbitmq|kafka|postgres\w*|redis|index fund|expense ratio)\b/i;
  const QUESTION = /\?$|\b(how (do|does|did|would|can)|what (is|are|was|if)|why (is|do|does|would)|walk me through|tell me about|explain|have you (used|worked|built)|describe|could you|can you|do you)\b/i;
  let lastTriggerAt = 0;

  function detectTrigger(text) {
    const now = Date.now();
    if (now - lastTriggerAt < 4000) return;
    let kind = null;
    if (OBJECTION.test(text)) kind = 'objection';
    else if (QUESTION.test(text)) kind = 'question';
    else if (TERM.test(text)) kind = 'term';
    if (!kind) return;
    lastTriggerAt = now;
    addInsight(kind, text, Store.settings.autoInsights);
  }

  // ---------- insights (chips that expand into answers, like their static-insight pills) ----------
  let uid = 0;
  const KIND = {
    question: { label: 'Question', icon: '?', cls: 'q' },
    objection: { label: 'Objection', icon: '!', cls: 'o' },
    term: { label: 'Key term', icon: '#', cls: 't' },
  };

  function addInsight(kind, heard, autoAnswer) {
    const card = { id: 'i' + (++uid), kind, heard, answer: '', loading: false, open: false };
    Store.insights.unshift(card);
    renderInsights();
    if (autoAnswer) { card.open = true; answerInsight(card); }
    return card;
  }

  async function answerInsight(card) {
    card.loading = true; card.open = true; renderInsights();
    try {
      const withScreen = Store.settings.autoScreenCtx && window.ScreenCtx?.hasFrame();
      card.answer = await LLM.assist(card.heard, withScreen);
    } catch (e) {
      card.answer = '⚠ ' + (e.message || e);
    } finally {
      card.loading = false; renderInsights();
    }
  }

  function renderInsights() {
    const host = $('insightList');
    host.innerHTML = '';
    if (!Store.insights.length) {
      host.innerHTML = '<div class="empty">Live Insights appear here when a question, objection, or key term is detected. Start a session with the mic button, or double-click the pill for the Dashboard.</div>';
      return;
    }
    for (const c of Store.insights.slice(0, 30)) {
      const k = KIND[c.kind];
      const wrap = document.createElement('div');
      wrap.className = 'insight';
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.innerHTML = `<span class="chip-ic ${k.cls}">${k.icon}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>`;
      chip.lastChild.textContent = c.heard;
      chip.title = k.label + ' — ' + c.heard;
      chip.onclick = () => { c.open = !c.open; renderInsights(); };
      wrap.appendChild(chip);
      if (c.open) {
        const body = document.createElement('div');
        body.className = 'answer' + (c.loading ? ' loading' : '');
        body.textContent = c.loading ? 'thinking…' : c.answer;
        wrap.appendChild(body);
      }
      host.appendChild(wrap);
    }
  }

  // push a manually-triggered result (quick actions / ask) as an opened chip
  function pushResult(kind, heard, promise) {
    const card = { id: 'i' + (++uid), kind, heard, answer: '', loading: true, open: true };
    Store.insights.unshift(card);
    renderInsights();
    promise
      .then(a => { card.answer = a; })
      .catch(e => { card.answer = '⚠ ' + (e.message || e); })
      .finally(() => { card.loading = false; renderInsights(); });
  }

  // ---------- transcript / session ----------
  function setSession(on) {
    Store.listening = on;
    $('pillDot').classList.toggle('on', on);
    $('btnSession').classList.toggle('running', on);
    $('btnSession').title = on ? 'Stop session' : 'Start session (Ctrl+Shift+L)';
    $('stateDot').classList.toggle('live', on);
    $('stateText').textContent = on ? 'Listening' : 'Idle';
    const sl = $('sideListen');
    sl.textContent = on ? 'Stop session' : 'Start session';
    sl.classList.toggle('stop', on);
    const label = $('askLabel');
    if (on) { label.textContent = 'Ask'; label.classList.add('shimmer'); setTimeout(() => label.classList.remove('shimmer'), 3000); }
    if (on) Speech.start(Store.settings.lang); else Speech.stop();
    if (on) updateDashSession();
  }

  function onFinalTranscript(text) {
    detectTrigger(text);
    updateDashSession();
  }

  function updateDashSession() {
    const lines = Store.transcript.filter(l => l.final);
    if (!lines.length) return;
    $('dashSession').classList.remove('dim');
    $('dashSession').textContent = lines.length + ' lines captured · last: ' + lines[lines.length - 1].text.slice(0, 90);
  }

  // ---------- demo ----------
  const DEMO = [
    "Alright, thanks for joining everyone — let's kick off.",
    "So we looked at your proposal, and honestly the pricing feels a little steep for us this quarter.",
    "The integration story is interesting though. How do you handle SSO for enterprise customers?",
    "We're also evaluating another vendor that quoted us about thirty percent less.",
    "Walk me through what your SLA looks like when there's an outage.",
    "And what's your ARR growth been like over the past year, if you can share that?",
  ];
  let demoIdx = 0, demoTimer = null;
  function runDemo() {
    stopDemo(); demoIdx = 0;
    demoTimer = setInterval(() => {
      if (demoIdx >= DEMO.length) { stopDemo(); return; }
      const t = DEMO[demoIdx++];
      Store.transcript.push({ ts: Date.now(), text: t, final: true });
      onFinalTranscript(t);
    }, 2600);
  }
  function stopDemo() { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } }

  // ---------- quick actions / ask ----------
  function lastQuestionLine() {
    for (let i = Store.transcript.length - 1; i >= 0 && i >= Store.transcript.length - 8; i--) {
      if (QUESTION.test(Store.transcript[i].text) || OBJECTION.test(Store.transcript[i].text)) return Store.transcript[i].text;
    }
    return null;
  }

  function doAssist() {
    const q = $('askInput').value.trim();
    const target = q || lastQuestionLine() || (Store.transcript.at(-1)?.text ?? '');
    if (!target) { flash('Nothing to assist on yet.'); return; }
    $('askInput').value = '';
    const withScreen = $('screenAttach').checked && window.ScreenCtx?.hasFrame();
    pushResult('question', q || target, LLM.assist(target, withScreen));
  }
  function doAsk() {
    const q = $('askInput').value.trim();
    if (!q) { doAssist(); return; }
    $('askInput').value = '';
    const withScreen = $('screenAttach').checked && window.ScreenCtx?.hasFrame();
    pushResult('question', q, LLM.ask(q, withScreen));
  }

  function setThinking(on) {
    const label = $('askLabel');
    label.classList.toggle('shimmer', on);
  }

  function bindQuickActions() {
    $('quickRow').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const action = chip.dataset.action;
      if (action === 'assist') doAssist();
      if (action === 'say') pushResult('term', 'What should I say?', LLM.sayWhat());
      if (action === 'follow') pushResult('term', 'Follow-up questions', LLM.followups());
      if (action === 'recap') pushResult('term', 'Recap', LLM.recap());
      setThinking(true);
      setTimeout(() => setThinking(false), 2500);
    });
  }

  let flashTimer = null;
  function flash(msg) {
    const el = $('interim'); el.textContent = msg; el.style.color = 'var(--destructive)';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 2400);
  }

  // ---------- pill: ask toggle / eye / dashboard ----------
  function toggleChat(force) {
    const p = $('chatPanel');
    const show = force !== undefined ? force : p.classList.contains('hidden');
    p.classList.toggle('hidden', !show);
    $('btnAskToggle').classList.toggle('open', show);
    $('askLabel').textContent = show ? 'Hide' : 'Ask';
    if (show) $('askInput').focus();
    syncWindowSize();
  }

  let stealth = false;
  function setStealth(on) {
    stealth = on;
    $('overlay').classList.toggle('hidden', on);
    $('stealthDot').classList.toggle('hidden', !on);
  }

  function toggleDashboard(force) {
    const d = $('dashboard');
    const show = force !== undefined ? force : d.classList.contains('hidden');
    d.classList.toggle('hidden', !show);
    if (show) { renderModeGrids(); renderKB(); updateDashSession(); }
    syncWindowSize();
  }

  function switchDash(view) {
    document.querySelectorAll('.side-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.dash-view').forEach(v => v.classList.toggle('active', v.id === 'dash-' + view));
  }

  // ---------- drag (pill = drag handle; chat panel follows, like ControlAndChatWindowPosition) ----------
  function makeDraggable() {
    const ov = $('overlay'), pill = $('pill');
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
    pill.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      const r = ov.getBoundingClientRect(); ox = r.left; oy = r.top;
      pill.setPointerCapture(e.pointerId);
    });
    pill.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      // in the desktop shell the OS window must move — the DOM stays pinned at 0,0 inside it
      if (window.wingvoxDesktop) {
        window.wingvoxDesktop.moveWindow(e.movementX, e.movementY);
        return;
      }
      const x = Math.max(0, Math.min(innerWidth - 120, ox + dx));
      const y = Math.max(0, Math.min(innerHeight - 40, oy + dy));
      ov.style.left = x + 'px'; ov.style.top = y + 'px'; ov.style.right = 'auto'; ov.style.transform = 'none';
    });
    pill.addEventListener('pointerup', () => { dragging = false; });
    pill.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleDashboard(); }); // their onDoubleClick → dashboard
  }

  function nudge(dx, dy) {
    if (window.wingvoxDesktop) { window.wingvoxDesktop.moveWindow(dx, dy); return; }
    const ov = $('overlay'); const r = ov.getBoundingClientRect();
    ov.style.transform = 'none';
    ov.style.left = Math.max(0, Math.min(innerWidth - 120, r.left + dx)) + 'px';
    ov.style.top = Math.max(0, Math.min(innerHeight - 40, r.top + dy)) + 'px';
  }

  // ---------- PiP ----------
  async function enterPip() {
    if (!('documentPictureInPicture' in window)) { flash('Picture-in-Picture needs Chrome/Edge 116+.'); return; }
    const w = await documentPictureInPicture.requestWindow({ width: 430, height: 300 });
    [...document.styleSheets].forEach(sheet => {
      try { w.document.head.appendChild(sheet.ownerNode.cloneNode(true)); } catch { }
    });
    w.document.body.style.margin = '0';
    w.document.body.style.background = '#131316';
    w.document.body.appendChild($('overlay'));
    setStealth(false);
    w.addEventListener('pagehide', () => { document.body.appendChild($('overlay')); });
  }

  // ---------- modes (personas with their shipped colors) ----------
  const MODE_ICONS = {
    general: ['⌂', 'ic-general'],
    sales: ['◆', 'ic-pink'],
    recruiting: ['◈', 'ic-amber'],
    teammeet: ['◉', 'ic-emerald'],
    interview: ['★', 'ic-blue'],
    lecture: ['✦', 'ic-purple'],
  };
  function syncModeCards() {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.toggle('active', c.dataset.mode === Store.settings.persona));
  }
  function renderModeGrids() {
    for (const gridId of ['modeGrid', 'modeGrid2']) {
      const grid = $(gridId);
      if (!grid || grid.children.length) continue;
      for (const [key, p] of Object.entries(LLM.PERSONAS)) {
        const [icon, cls] = MODE_ICONS[key] || ['●', 'ic-general'];
        const b = document.createElement('button');
        b.className = 'mode-card';
        b.dataset.mode = key;
        b.innerHTML = `<span class="m-ic ${cls}">${icon}</span><div class="m-name"></div><div class="m-desc"></div>`;
        b.querySelector('.m-name').textContent = p.name;
        b.querySelector('.m-desc').textContent = (p.chatPrompt || 'Balanced, all-purpose assistance.').slice(0, 92) + '…';
        b.onclick = () => {
          Store.settings.persona = key; Store.save();
          $('modeChip').textContent = p.name;
          $('sideMode').textContent = 'Mode: ' + p.name;
          $('personaSel').value = key;
          syncModeCards();
          flash('Mode set to ' + p.name);
        };
        grid.appendChild(b);
      }
    }
    syncModeCards();
    const p = LLM.PERSONAS[Store.settings.persona];
    if (p) { $('modeChip').textContent = p.name; $('sideMode').textContent = 'Mode: ' + p.name; }
  }

  // ---------- notes ----------
  async function genNotes() {
    const btn = $('btnNotes'); btn.disabled = true; btn.textContent = 'Working…';
    $('notesOut').innerHTML = '<div class="empty dim">Generating…</div>';
    try {
      const notes = await LLM.notes();
      const md = renderNotesMD(notes);
      Store.notesMD = md;
      $('notesOut').innerHTML = mdHtml(md);
      $('btnExport').disabled = false;
    } catch (e) {
      $('notesOut').innerHTML = '<div class="empty dim">⚠ ' + escapeHtml(e.message) + '</div>';
    } finally {
      btn.disabled = false; btn.textContent = 'Generate meeting notes';
    }
  }
  function renderNotesMD(notes) {
    const parts = [`# Meeting notes — ${new Date().toLocaleString()}`, '', `Mode: **${notes.persona}**${notes.mock ? ' (Mock AI)' : ''}`, ''];
    for (const s of notes.sections) parts.push('## ' + s.title, s.body, '');
    parts.push('---', '', '## Transcript', '');
    for (const l of Store.transcript.filter(l => l.final)) parts.push('- ' + l.text);
    return parts.join('\n');
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function mdHtml(md) {
    let h = escapeHtml(md);
    h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h3>$1</h3>')
      .replace(/^# (.*)$/gm, '<h3>$1</h3>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^\- (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\n{2,}/g, '<br><br>');
    return h;
  }
  function exportNotes() {
    if (!Store.notesMD) return;
    const blob = new Blob([Store.notesMD], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meeting-notes-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.md';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function genBrief() {
    const text = $('briefIn').value.trim();
    if (!text) { flash('Paste a bio or company blurb first.'); return; }
    $('notesOut').innerHTML = '<div class="empty dim">Researching…</div>';
    try {
      const out = await LLM.brief(text);
      Store.notesMD = '# Pre-call brief\n\n' + out;
      $('notesOut').innerHTML = '<h3>Pre-call brief</h3>' + mdHtml(out);
      $('btnExport').disabled = false;
    } catch (e) {
      $('notesOut').innerHTML = '<div class="empty dim">⚠ ' + escapeHtml(e.message) + '</div>';
    }
  }

  // ---------- settings & KB ----------
  function bindSettings() {
    const st = Store.settings;
    $('setEndpoint').value = st.endpoint; $('setKey').value = st.apiKey;
    $('setModel').value = st.model; $('setInstr').value = st.instructions;
    $('setAuto').checked = st.autoInsights; $('setScreenCtx').checked = st.autoScreenCtx;
    $('setOpacity').value = st.opacity; $('opVal').textContent = st.opacity;
    $('overlay').style.opacity = st.opacity / 100;

    const save = () => {
      st.endpoint = $('setEndpoint').value.trim() || st.endpoint;
      st.apiKey = $('setKey').value.trim();
      st.model = $('setModel').value.trim() || st.model;
      st.instructions = $('setInstr').value;
      st.autoInsights = $('setAuto').checked;
      st.autoScreenCtx = $('setScreenCtx').checked;
      Store.save();
    };
    for (const id of ['setEndpoint', 'setKey', 'setModel', 'setInstr', 'setAuto', 'setScreenCtx'])
      $(id).addEventListener('change', save);
    $('setOpacity').addEventListener('input', () => {
      st.opacity = +$('setOpacity').value; $('opVal').textContent = st.opacity;
      $('overlay').style.opacity = st.opacity / 100; Store.save();
    });
    $('personaSel').value = st.persona;
    $('personaSel').addEventListener('change', () => {
      st.persona = $('personaSel').value; Store.save();
      renderModeGrids();
      const p = LLM.PERSONAS[st.persona];
      $('modeChip').textContent = p.name; $('sideMode').textContent = 'Mode: ' + p.name;
    });
  }

  function renderKB() {
    const host = $('kbList'); host.innerHTML = '';
    if (!KB.docs.length) { host.innerHTML = '<div class="empty dim">No documents yet.</div>'; return; }
    for (const d of KB.docs) {
      const el = document.createElement('div');
      el.className = 'kbdoc';
      el.innerHTML = `<span class="nm"></span><span class="sz"></span>`;
      el.querySelector('.nm').textContent = d.name;
      el.querySelector('.sz').textContent = (d.size / 1024).toFixed(1) + ' KB';
      const rm = document.createElement('button');
      rm.className = 'btn'; rm.textContent = 'Remove';
      rm.onclick = () => { KB.remove(d.id); renderKB(); };
      el.appendChild(rm);
      host.appendChild(el);
    }
  }
  function bindKB() {
    $('kbFiles').addEventListener('change', async (e) => {
      for (const f of e.target.files) {
        try { KB.add(f.name, await f.text()); }
        catch (err) { flash(err.message); break; }
      }
      e.target.value = ''; renderKB();
    });
    $('kbAddPaste').onclick = () => {
      const t = $('kbPaste').value.trim();
      if (!t) return;
      try { KB.add('pasted-' + new Date().toISOString().slice(11, 19), t); $('kbPaste').value = ''; }
      catch (err) { flash(err.message); }
      renderKB();
    };
  }

  // ---------- hotkeys (Cluely's shipped map, browser-adapted) ----------
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') { e.preventDefault(); toggleChat(true); doAssist(); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setStealth(!stealth); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); enterPip(); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setSession(!Store.listening); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleDashboard(true); switchDash('knowledge'); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); toggleChat(true); pushResult('term', 'What should I say?', LLM.sayWhat()); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleChat(true); pushResult('term', 'Follow-up questions', LLM.followups()); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); toggleChat(true); pushResult('term', 'Recap', LLM.recap()); }
    else if (e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = 24;
      if (e.key === 'ArrowUp') nudge(0, -step);
      if (e.key === 'ArrowDown') nudge(0, step);
      if (e.key === 'ArrowLeft') nudge(-step, 0);
      if (e.key === 'ArrowRight') nudge(step, 0);
    }
    else if (e.key === 'Escape') { toggleDashboard(false); }
  });

  // ---------- desktop mode (Electron shell with OS capture protection, F9) ----------
  // The transparent window must hug its visible content: pill-only when collapsed,
  // pill+panel when Ask is open, large when the dashboard is open. Otherwise the
  // invisible part of the window blocks clicks on everything behind it.
  function syncWindowSize() {
    const d = window.wingvoxDesktop;
    if (!d) return;
    if (!$('dashboard').classList.contains('hidden')) {
      d.setSize({ mode: 'dashboard' });
      return;
    }
    const pillR = $('pill').getBoundingClientRect();
    const panel = $('chatPanel');
    if (panel.classList.contains('hidden')) {
      d.setSize({ width: pillR.width + 6, height: 10 + pillR.height + 6 });
    } else {
      const panelR = panel.getBoundingClientRect();
      d.setSize({
        width: Math.max(panelR.width, pillR.width) + 6,
        height: 10 + pillR.height + 10 + panelR.height + 6,
      });
    }
  }

  function initDesktop() {
    const d = window.wingvoxDesktop;
    if (!d) return;
    document.body.classList.add('desktop-mode');
    const badge = $('protectBadge');
    const eye = $('btnEye');
    const paint = (on) => {
      badge.classList.remove('hidden');
      badge.classList.toggle('off', !on);
      badge.textContent = on ? '\u{1F6E1} Invisible to screen share' : '\u26A0 Visible in screen share';
      eye.classList.toggle('active', on);
      eye.title = on
        ? 'Capture protection ON \u2014 screen share can\u2019t see this window. Click to disable (Ctrl+\\)'
        : 'Capture protection OFF \u2014 visible in screen share. Click to enable (Ctrl+\\)';
    };
    paint(d.captureProtected);
    eye.onclick = () => d.setProtection(!eye.classList.contains('active'));
    d.onProtectionChanged(paint);
    d.onHotkey((action) => { if (action === 'toggle-session') setSession(!Store.listening); });
    d.ready();
    syncWindowSize();
    // panel content (insight cards) changes height as it fills — keep the window hugging it
    new ResizeObserver(syncWindowSize).observe($('chatPanel'));
    new ResizeObserver(syncWindowSize).observe($('pill'));
  }

  // ---------- boot ----------
  function boot() {
    const sel = $('personaSel');
    for (const [k, v] of Object.entries(LLM.PERSONAS)) {
      const o = document.createElement('option'); o.value = k; o.textContent = v.name; sel.appendChild(o);
    }

    $('btnAskToggle').onclick = () => toggleChat();
    $('btnSession').onclick = () => setSession(!Store.listening);
    $('sideListen').onclick = () => setSession(!Store.listening);
    $('btnEye').onclick = () => setStealth(true);
    $('stealthDot').onclick = () => setStealth(false);
    $('btnDash').onclick = () => toggleDashboard();
    $('dashClose').onclick = () => toggleDashboard(false);
    $('btnPip').onclick = enterPip;
    initDesktop(); // overrides the eye binding when running in the capture-protected shell

    document.querySelectorAll('.side-item').forEach(b => b.onclick = () => switchDash(b.dataset.view));

    $('btnAsk').onclick = doAsk;
    $('askInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); } });
    bindQuickActions();

    $('btnNotes').onclick = genNotes;
    $('btnExport').onclick = exportNotes;
    $('btnBrief').onclick = genBrief;

    // screen share chip — enables "ask about your screen"
    const screenChip = document.createElement('button');
    screenChip.className = 'chip';
    screenChip.innerHTML = '<span class="chip-ic t">&#128421;</span>Share screen';
    screenChip.onclick = async () => {
      const ok = await window.ScreenCtx.share();
      if (ok) { screenChip.querySelector('.chip-ic').textContent = '✓'; $('screenAttach').disabled = false; flash('Screen shared — frames captured locally.'); }
    };
    $('quickRow').appendChild(screenChip);

    // demo conversation (keyless way to see the whole live flow)
    const demoChip = document.createElement('button');
    demoChip.className = 'btn';
    demoChip.textContent = 'Play demo conversation';
    demoChip.onclick = () => { flash('Demo conversation playing…'); runDemo(); };
    $('dashSession').appendChild(document.createElement('br'));
    $('dashSession').appendChild(demoChip);
    demoChip.style.marginTop = '8px';

    makeDraggable();
    bindSettings();
    bindKB();
    renderModeGrids();
    renderInsights();
    renderKB();
    if (!Speech.supported()) flash('No Web Speech API here — use demo mode or Chrome/Edge.');
  }

  window.App = { boot, onFinalTranscript, setSession, onScreenEnded() { $('screenAttach').disabled = true; } };
  document.addEventListener('DOMContentLoaded', boot);
})();
