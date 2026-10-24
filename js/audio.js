// audio.js — system-audio (loopback) transcription for the desktop shell.
// Cluely ships sox/audiotee + Silero VAD + server ASR (EVIDENCE.md F3); a browser
// app gets loopback via getDisplayMedia audio (Windows: "share audio"), gates
// chunks with an RMS speech detector, and transcribes each speech chunk through
// an OpenAI-compatible /audio/transcriptions endpoint. Requires an API key.
(function () {
  let stream = null, recorder = null, chunks = [], audioCtx = null, analyser = null;
  let chunkTimer = null, vadTimer = null, speechInChunk = false, running = false;
  const CHUNK_MS = 7000;
  const RMS_THRESHOLD = 0.012; // tuned for opus loopback; below ≈ silence

  function sttEndpoint() {
    const s = window.Store.settings;
    return s.endpoint.replace(/\/chat\/completions$/, '/audio/transcriptions');
  }

  function pickMime() {
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  async function transcribe(blob) {
    const s = window.Store.settings;
    const form = new FormData();
    form.append('file', blob, 'chunk.webm');
    form.append('model', s.sttModel || 'whisper-1');
    const res = await fetch(sttEndpoint(), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + s.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error('STT ' + res.status + ': ' + (await res.text()).slice(0, 160));
    const j = await res.json();
    return (j.text || '').trim();
  }

  function startRecorder() {
    chunks = []; speechInChunk = false;
    recorder = new MediaRecorder(stream, pickMime() ? { mimeType: pickMime() } : undefined);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      if (!running) return;
      if (speechInChunk && chunks.length) {
        try {
          const text = await transcribe(new Blob(chunks, { type: chunks[0].type }));
          if (text && window.App) window.App.onFinalTranscript(text);
        } catch (e) {
          if (window.App?.flash) window.App.flash('Loopback STT: ' + (e.message || e));
        }
      }
      if (running) startRecorder(); // next chunk
    };
    recorder.start();
    chunkTimer = setTimeout(() => { try { recorder.state === 'recording' && recorder.stop(); } catch { } }, CHUNK_MS);
  }

  function startVAD() {
    // our stand-in for Cluely's Silero VAD: sample RMS; any speech marks the chunk
    const buf = new Uint8Array(analyser.fftSize);
    vadTimer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      if (rms > RMS_THRESHOLD) speechInChunk = true;
    }, 300);
  }

  async function start() {
    if (running) return true;
    const s = window.Store.settings;
    if (!s.apiKey) throw new Error('System-audio transcription needs an API key (Settings) — or use Microphone mode, which works keyless.');
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    for (const t of stream.getVideoTracks()) t.stop(); // audio-only
    if (!stream.getAudioTracks().length) {
      for (const t of stream.getAudioTracks()) t.stop();
      throw new Error('No system-audio track — pick a source with "Share audio" enabled.');
    }
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    running = true;
    startVAD();
    startRecorder();
    stream.getAudioTracks()[0].addEventListener('ended', () => stop());
    return true;
  }

  function stop() {
    running = false;
    clearTimeout(chunkTimer); clearInterval(vadTimer);
    try { recorder && recorder.state === 'recording' && recorder.stop(); } catch { }
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null; recorder = null;
    if (audioCtx) { try { audioCtx.close(); } catch { } audioCtx = null; }
  }

  window.AudioLoop = { start, stop, running: () => running };
})();
