// store.js — persisted settings + shared app state (localStorage only, nothing leaves the machine)
(function () {
  const OLD_KEY = 'smartcheat.v1';
  const KEY = 'wingvox.v1';
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
    // session (not persisted)
    transcript: [],   // {ts, text, final}
    insights: [],     // {id, kind: 'question'|'objection'|'term', heard, answer, loading, action}
    listening: false,
    screenAttached: false,
    notesMD: null,
  };

  window.Store = state;
})();
