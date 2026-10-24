// Wingvox desktop shell — replicates Cluely's capture-exclusion recipe
// (EVIDENCE.md F9): a transparent frameless always-on-top window whose
// setContentProtection() is driven by an `invisibility` flag, so screen-share
// and recording APIs never see the overlay.
//
//   Windows : setContentProtection(true) → SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
//   macOS   : setContentProtection(true) → NSWindowSharingNone
//
// Run:  cd desktop && npm install && npm start     (app must be served at the URL below)
const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_URL = process.env.WINGVOX_URL || 'http://localhost:8000';

// mirrors Cluely's `isInvisible` opt-in default (F9), but Wingvox defaults it ON
// because capture protection is this app's headline feature.
let state = { isInvisible: true };
let win = null;

function applyProtection() {
  // same semantics as Cluely's ue(e): protection while invisible (or while we
  // ourselves screenshot — not applicable here, noted in EVIDENCE.md F9).
  const protect = state.isInvisible;
  if (win && !win.isDestroyed()) {
    win.setContentProtection(protect);
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send('wingvox:protection-changed', protect);
  }
}

// ---------- pill anchor persistence (so the window reopens where you left it) ----------
const anchorFile = () => path.join(app.getPath('userData'), 'wingvox-anchor.json');
let saveTimer = null;
function saveAnchorSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { if (winAnchor) fs.writeFileSync(anchorFile(), JSON.stringify(winAnchor)); } catch { }
  }, 250);
}
function loadAnchor() {
  try {
    const a = JSON.parse(fs.readFileSync(anchorFile(), 'utf8'));
    if (Number.isFinite(a.centerX) && Number.isFinite(a.y)) return a;
  } catch { }
  return null;
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  // restore the last pill position if we saved one, else default top-center
  const saved = loadAnchor();
  const width = 430, height = 660;
  let x, y;
  if (saved) {
    x = Math.round(saved.centerX - width / 2);
    y = Math.round(saved.y);
  } else {
    x = workArea.x + Math.round(workArea.width / 2 - width / 2);
    y = workArea.y + 14;
  }
  ({ x, y } = clampToWorkArea(x, y, width, height));
  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    hasShadow: false,
    fullscreenable: false,
    minimizable: false,
    resizable: false,
    hiddenInMissionControl: true,
    title: 'Wingvox',
    icon: path.join(__dirname, '..', 'assets', 'logo', 'wingvox-mark-256.png'),
    backgroundColor: '#00000000',
    // on macOS this makes the glass panels genuinely frost the desktop behind the window
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window', visualEffectState: 'active' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Cluely's darwin show fade (F9): opacity 0 → show → 1 after 30ms
  win.setOpacity(0);
  win.show();
  setTimeout(() => { if (win && !win.isDestroyed()) win.setOpacity(1); }, 30);

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(APP_URL);
  applyProtection();
  // the pill renders centered in the window at top — that's the resize anchor
  winAnchor = { centerX: x + width / 2, y };

  win.webContents.on('did-finish-load', () => {
    console.log('[wingvox] loaded', APP_URL);
  });
  win.on('closed', () => { win = null; });
}

// renderer → main: dynamic window sizing so the window hugs its visible content —
// pill-only when collapsed, pill+panel when Ask is open, large when the dashboard
// is open. Without this, the invisible part of the transparent window blocks
// clicks on everything behind it.
// The pill's on-screen anchor is tracked here (not re-derived from getBounds,
// which drifts on scaled displays) so resizes never move the pill.
let winAnchor = null;        // { centerX, y } — where the pill sits on screen
let savedPillAnchor = null;  // pill anchor while the dashboard borrows the window

function clampToWorkArea(x, y, width, height) {
  // clamp against the display that actually contains the window (multi-monitor),
  // falling back to the primary display when nothing matches
  const d = screen.getDisplayMatching({ x, y, width, height });
  const { workArea } = d;
  return {
    x: Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, x)),
    y: Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, y)),
  };
}

ipcMain.on('wingvox:set-size', (_e, opts = {}) => {
  if (!win || win.isDestroyed()) return;
  // dashboard centers on whichever display the window is currently on
  const { workArea } = screen.getDisplayMatching(win.getBounds());

  if (opts.mode === 'dashboard') {
    const width = Math.min(1150, Math.round(workArea.width * 0.88));
    const height = Math.min(780, Math.round(workArea.height * 0.88));
    savedPillAnchor = winAnchor;
    const pos = clampToWorkArea(
      workArea.x + Math.round((workArea.width - width) / 2),
      workArea.y + Math.round((workArea.height - height) / 2),
      width, height,
    );
    winAnchor = { centerX: pos.x + width / 2, y: pos.y };
    win.setBounds({ ...pos, width, height });
    return;
  }

  // returning from the dashboard: restore where the pill was
  if (savedPillAnchor) { winAnchor = savedPillAnchor; savedPillAnchor = null; }
  if (!winAnchor) {
    const b = win.getBounds();
    winAnchor = { centerX: b.x + b.width / 2, y: b.y };
  }
  const width = Math.max(220, Math.round(opts.width || 0));
  const height = Math.max(56, Math.round(opts.height || 0));
  const pos = clampToWorkArea(Math.round(winAnchor.centerX - width / 2), winAnchor.y, width, height);
  win.setBounds({ ...pos, width, height });
  saveAnchorSoon();
});

// renderer → main: drag/nudge moves the OS window (the DOM stays pinned at 0,0 inside it)
ipcMain.on('wingvox:move-window', (_e, { dx = 0, dy = 0 } = {}) => {
  if (!win || win.isDestroyed()) return;
  if (winAnchor) { winAnchor.centerX += dx; winAnchor.y += dy; }
  const b = win.getBounds();
  win.setBounds({ x: b.x + Math.round(dx), y: b.y + Math.round(dy), width: b.width, height: b.height });
  saveAnchorSoon();
});

// renderer → main: stealth — fully remove the window from screen and click path
// (restore via the global Ctrl+Shift+H, since a hidden window can't show the dot)
ipcMain.on('wingvox:set-window-visible', (_e, visible) => {
  if (!win || win.isDestroyed()) return;
  if (visible) {
    win.setOpacity(0);
    win.show();
    setTimeout(() => { if (win && !win.isDestroyed()) win.setOpacity(1); }, 30);
  } else {
    win.hide();
  }
});

// renderer → main: eye-icon toggles capture protection (Cluely's "Make Invisible")
ipcMain.on('wingvox:set-protection', (_e, on) => {
  state.isInvisible = !!on;
  applyProtection();
});

// global hotkeys from Cluely's shipped map (F2), browser-adapted:
//   Ctrl+\        toggle invisibility (capture protection)
//   Ctrl+Shift+\  toggle session (forwarded to the renderer)
//   Ctrl+Shift+H  stealth toggle — global so a hidden window can always come back
ipcMain.on('wingvox:ready', () => {
  globalShortcut.register('CommandOrControl+\\', () => {
    state.isInvisible = !state.isInvisible;
    applyProtection();
  });
  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    if (win && !win.isDestroyed()) win.webContents.send('wingvox:hotkey', 'toggle-session');
  });
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) {
        win.setOpacity(0);
        win.show();
        setTimeout(() => { if (win && !win.isDestroyed()) win.setOpacity(1); }, 30);
        win.webContents.send('wingvox:hotkey', 'stealth-off');
      } else {
        win.webContents.send('wingvox:hotkey', 'stealth-on');
      }
    }
  });
  console.log('[wingvox] capture protection:', state.isInvisible ? 'ON (invisible to screen share)' : 'off');
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.wingvox.desktop'); // taskbar presence + grouping
  createWindow();
});

// Self-verification (WINGVOX_VERIFY=1): capture the screen via desktopCapturer —
// the same screen-capture path conferencing apps use — once with protection ON
// and once with it OFF. The overlay must be absent from the ON frame.
async function verifyCaptureExclusion() {
  await new Promise(r => setTimeout(r, 2500));
  const capture = async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    return sources[0]?.thumbnail.toPNG();
  };
  fs.writeFileSync(path.join(__dirname, 'verify-ON.png'), await capture());
  win.setContentProtection(false);
  await new Promise(r => setTimeout(r, 700));
  fs.writeFileSync(path.join(__dirname, 'verify-OFF.png'), await capture());
  win.setContentProtection(true);
  console.log('[wingvox-verify] saved verify-ON.png and verify-OFF.png');
  app.quit();
}
if (process.env.WINGVOX_VERIFY === '1') {
  app.whenReady().then(() => setTimeout(verifyCaptureExclusion, 1000));
}

// Sizing verification (WINGVOX_VERIFY=2): capture the window area collapsed vs
// expanded (Ask open) vs dashboard, with protection off so the frames show it.
async function verifyWindowSizing() {
  await new Promise(r => setTimeout(r, 2500));
  const shot = async (name) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    fs.writeFileSync(path.join(__dirname, `verify-${name}.png`), sources[0]?.thumbnail.toPNG());
    const b = win.getBounds();
    console.log(`[wingvox-verify] ${name}: window ${b.width}x${b.height} @(${b.x},${b.y})`);
    await new Promise(r => setTimeout(r, 500));
  };
  win.setContentProtection(false);
  await shot('collapsed');
  await win.webContents.executeJavaScript("document.getElementById('btnAskToggle').click()");
  await new Promise(r => setTimeout(r, 800));
  await shot('expanded');
  await win.webContents.executeJavaScript("document.getElementById('btnDash').click()");
  await new Promise(r => setTimeout(r, 800));
  await shot('dashboard');
  app.quit();
}
if (process.env.WINGVOX_VERIFY === '2') {
  app.whenReady().then(() => setTimeout(verifyWindowSizing, 1000));
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { if (winAnchor) fs.writeFileSync(anchorFile(), JSON.stringify(winAnchor)); } catch { } });
app.on('will-quit', () => globalShortcut.unregisterAll());
