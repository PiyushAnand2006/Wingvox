// speech.js — real-time transcription via the Web Speech API.
// Cluely ships sox + Silero VAD + server ASR (EVIDENCE.md F3); a browser app uses
// the platform recognizer instead. Mic-only: to capture the other party's audio,
// pick a loopback/"stereo mix" device as the mic input, or use demo mode.
(function () {
  const LANGS = [
    ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['fr-FR', 'Français'],
    ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-BR', 'Português (BR)'], ['nl-NL', 'Nederlands'],
    ['sv-SE', 'Svenska'], ['pl-PL', 'Polski'], ['tr-TR', 'Türkçe'], ['ru-RU', 'Русский'],
    ['ar-SA', 'العربية'], ['hi-IN', 'हिन्दी'], ['ja-JP', '日本語'], ['ko-KR', '한국어'],
    ['zh-CN', '中文 (简体)'], ['zh-TW', '中文 (繁體)'], ['id-ID', 'Bahasa Indonesia'], ['vi-VN', 'Tiếng Việt'],
  ]; // 20 locales — covers the marketed "12+ languages" claim

  let rec = null;
  let wantRunning = false;

  function supported() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; }

  function onFinal(text) {
    window.Store.transcript.push({ ts: Date.now(), text, final: true });
    window.App && window.App.onFinalTranscript(text);
  }

  function start(lang) {
    if (!supported()) { alert('This browser has no Web Speech API. Use Chrome or Edge.'); return false; }
    stop();
    wantRunning = true;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new Ctor();
    rec.lang = lang || window.Store.settings.lang || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = r[0].transcript.trim(); if (t) onFinal(t); }
        else interim += r[0].transcript;
      }
      const el = document.getElementById('interim');
      if (el) el.textContent = interim;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') { wantRunning = false; window.App && window.App.setListening(false); alert('Microphone permission denied.'); }
    };
    rec.onend = () => {
      // Chrome ends the session on silence — restart while the user wants listening
      if (wantRunning) { try { rec.start(); } catch { /* restart race */ } }
    };
    try { rec.start(); return true; } catch { return false; }
  }

  function stop() {
    wantRunning = false;
    if (rec) { try { rec.stop(); } catch { } rec = null; }
    const el = document.getElementById('interim');
    if (el) el.textContent = '';
  }

  window.Speech = { LANGS, supported, start, stop };
})();
