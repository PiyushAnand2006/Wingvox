// store.js — persisted settings + shared app state (localStorage only, nothing leaves the machine)
(function () {
  const OLD_KEY = 'smartcheat.v1';
  const KEY = 'wingvox.v1';
  const SESSION_KEY = 'wingvox.session.v1';
  // one-time migration from the pre-rename key
  try {
    if (!localStorage.getItem(KEY) && localStorage.getItem(OLD_KEY)) {
      localStorage.setItem(KEY, localStorage.getItem(OLD_KEY));
      localStorage.removeItem(OLD_KEY);
    }
  } catch { }

  const DEFAULTS = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-4o-mini',
    instructions: '',
    persona: 'general',
    autoInsights: true,
    autoScreenCtx: false,
    opacity: 100,
    lang: 'en-US',
    audioSource: 'mic',     // 'mic' (Web Speech, keyless) | 'system' (loopback STT, needs key)
    sttModel: 'whisper-1',
  };

  function load() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) };
    } catch { return { ...DEFAULTS }; }
  }

  const state = {
    settings: load(),
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
    },
    // session (persisted so a reload doesn't lose the meeting)
    transcript: [],   // {ts, text, final}
    insights: [],     // {id, kind, heard, answer, loading, open}
    listening: false,
    screenAttached: false,
    notesMD: null,
    __sessionTimer: null,
    sessionSave() {
      clearTimeout(this.__sessionTimer);
      this.__sessionTimer = setTimeout(() => {
        try {
          const snap = {
            savedAt: Date.now(),
            transcript: this.transcript.filter(l => l.final).slice(-400),
            insights: this.insights.slice(0, 30).map(c => ({
              id: c.id, kind: c.kind, heard: c.heard, answer: c.answer, open: false,
            })),
            notesMD: this.notesMD,
          };
          localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
        } catch { /* storage full */ }
      }, 600);
    },
    sessionClear() {
      clearTimeout(this.__sessionTimer);
      try { localStorage.removeItem(SESSION_KEY); } catch { }
    },
    sessionLoad() {
      try {
        const snap = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (!snap) return;
        this.transcript = Array.isArray(snap.transcript) ? snap.transcript : [];
        this.insights = Array.isArray(snap.insights) ? snap.insights : [];
        this.notesMD = snap.notesMD || null;
      } catch { }
    },
  };
  state.sessionLoad();
  window.Store = state;
})();
