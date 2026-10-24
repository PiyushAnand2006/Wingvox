// screen.js — "Ask about your screen" (Cluely's screen awareness).
// getDisplayMedia → hidden <video> → still frames kept as data URLs for the vision model.
// The share is granted to THIS page only; frames never leave the browser unless a
// real API key is configured and you attach the frame to a question.
(function () {
  let stream = null;
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  const canvas = document.createElement('canvas');
  let frame = null; // last captured data URL

  async function share() {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      video.srcObject = stream;
      await video.play();
      stream.getVideoTracks()[0].addEventListener('ended', () => { release(); window.App && window.App.onScreenEnded(); });
      capture();
      return true;
    } catch { return false; } // user cancelled the picker
  }

  function capture() {
    if (!stream || video.videoWidth === 0) return null;
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    try { frame = canvas.toDataURL('image/jpeg', 0.72); } catch { frame = null; }
    return frame;
  }

  function release() {
    if (stream) { for (const t of stream.getTracks()) t.stop(); }
    stream = null; frame = null; video.srcObject = null;
  }

  window.ScreenCtx = {
    share, capture, release,
    sharing: () => !!stream,
    hasFrame: () => !!frame,
    frameDataUrl: () => { capture(); return frame; },
  };
})();
