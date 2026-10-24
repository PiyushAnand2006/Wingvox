# Evidence: How Cluely's features work

All quotes captured on **2026-10-24** by fetching the live pages / searching public reviews. Sources listed at the bottom.

## 0. Reverse-engineering the shipped app (REA pass)

Following the **reverse-engineer-anything** skill, the shipped Windows build was analyzed statically:

- Downloaded the official installer (`https://api.v2.cluely.com/desktop-download/win/latest.exe` → `Cluely Setup 2.0.198.exe`, 228 MB).
- `rea extract-artifact` doesn't read PE installers (`unsupported_target: pe`), so it was unpacked with 7-Zip (NSIS → `app-64.7z` → Electron tree) and the resulting `app.asar` was analyzed with `rea analyze-javascript-application` (3,174 JS files) plus direct static inspection of the main-process bundle (`dist-electron/main.js`) and renderer chunks (`dist/assets/*`).

### Findings ledger — observations from shipped code (v2.0.198)

Every item below is a **direct observation** (verbatim code strings from the bundles) unless marked *inference*.

**F1 — Undetectability is `setContentProtection`.** The main process calls `n.setContentProtection(ue(e))` on **every** window it manages — the Control window, the Chat window, the Dashboard, and the meeting-notification window (`main.js` @485733, @488131, @489932, @491313). Electron's `setContentProtection(true)` maps to `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Windows and `NSWindowSharingNone` on macOS. *Inference:* this is exactly the "same technology that Zoom uses" claim — conferencing apps exclude their own windows from capture the same way, which is why other screen shares don't show the overlay. It also explains why proctoring tools (HackerRank/CoderPad) that watch processes rather than screen share still detect it.

**F2 — The shipped default hotkey map** (zod schema in `main.js` @306120):

| Action | Default |
|---|---|
| toggleVisibility | `CommandOrControl+\` |
| ask | `CommandOrControl+Enter` |
| clear | `CommandOrControl+R` |
| toggleSession | `CommandOrControl+Shift+\` |
| moveUp / moveDown / moveLeft / moveRight | `CommandOrControl+↑/↓/←/→` |
| scrollUp / scrollDown | `CommandOrControl+Shift+↑/↓` |

`CommandOrControl+Enter` for "ask" matches the marketed "Cmd/Ctrl + Enter" exactly.

**F3 — Audio pipeline.** `extra-resources/` ships `sox-14.4.1-win32/sox.exe`, `sox-14.4.2-macosx`, `audiotee-0.0.7/audiotee` (a native binary that taps **system audio**; its bundled source says "AudioTee currently only supports macOS"), and `vad/npm/@ricky0123/vad-web` with **Silero VAD** ONNX models. The renderer transcription module (`transcription-tUnQk6kP.js`) configures VAD over `getUserMedia({audio:{channelCount:1, echoCancellation:true, autoGainControl:true, noiseSuppression:true}})` with `onSpeechStart`/`onSpeechEnd`/`onSpeechRealStart` callbacks — speech is segmented client-side, then segments are sent for transcription. *Inference:* transcription itself is server-side (only VAD runs locally; endpoints `api.v2.cluely.com` / `renderer.v2.cluely.com` are the only backends in the bundle).

**F4 — The shipped Assist prompts** (renderer `chat-CPovVDzB.js` @6316):

- Assist (screen mode): `"Based on what's on my screen, infer and provide me with the best information to help me at the current moment."`
- Assist (conversation mode): `"I'm (the user) in the middle of a conversation, and I'm asking you for help without specifically prompting you."`
- What should I say? → `"What should I say next? Output only the words I should say."`
- Follow-up questions → `"Suggest two follow-up questions that I can ask to carry forward the conversation. Output as two bullet points."`
- Recap → `"Recap the most recent thing that happened in the conversation."`

**F5 — Modes (personas) with per-mode notes templates** (`route-B02P2Cxv.js` @156914): `General` plus **Sales** ("Help me ask quality discovery questions, handle objections, and close the sale"), **Recruiting** ("evaluate the candidate"), **Team Meet** ("understand what's going on and contribute"), **Looking for work** (interview help — "If there is code, include line-by-line comments. If a behavioral question involves an example, respond with one specific example story."), **Lecture**. Each persona defines `summarySections` — e.g. Sales notes extract *Action Items, Outcome, Prospect background, Discovery, Product, Objections*; Team Meet extracts *Announcements, Team updates, Challenges or blockers, Decisions made*.

**F6 — Free-tier limits in code**: file upload max `20 MB` (`20*1024*1024`), `3` files on free (`vu=3`), with toast `"You've reached the file limit (3 files)" / "Upgrade to Pro for more"` — matches the pricing page.

**F7 — Architecture**: Electron + Vite React renderer, zod-validated settings persisted locally, windows: Control + Chat + Dashboard + meeting notification; global hotkeys via `globalShortcut`; `desktopCapturer` imported in main. Live-insight trigger logic (keyword detection of questions/objections) is **not** in the client bundle — consistent with the docs statement that detection happens on their backend.

**F8 — UI design system (from `dist/assets/index-BdVit3OX.css` + `control-DraBDQEm.js`)** — these are the literal tokens Wingvox's CSS now uses:

- **Dark overlay theme** (`.dark`): background `oklch(14.1% .005 285.823)`, card `oklch(21% .006 285.885)`, muted `oklch(27.4% .006 286.033)`, muted-foreground `oklch(70.5% .015 286.067)`, border `white/10`, foreground `oklch(98.5% 0 0)`, radius `.625rem`.
- **Light dashboard theme** (`:root`): background white, sidebar `oklch(98.5% 0 0)`, primary `oklch(59% .14 242)` (blue), border `oklch(92% .004 286.32)`.
- **Font**: `Geist Variable, sans-serif` (body), `Inter Variable` in places; dashboard headings `text-[30px] tracking-tight font-medium`.
- **Control pill**: background `hsla(252,10%,10%,0.8)`, ring `0 0 0 1px rgba(207,226,255,0.24), 0 -0.5px 0 0 rgba(255,255,255,0.8)`, white 26px logo at `left:12px`; **Ask button** `h-8 w-[66px] rounded-full font-semibold text-white text-xs` with idle gradient `linear-gradient(#0544a9,#022c70)` + inset highlight `#81b6ff`, hover `scale-105 brightness-125`, label "Ask" ⇄ "Hide" and dark gradient `linear-gradient(#2e3039,#272a31)` when chat is open, with a `shimmer` label animation while a response runs; **session button** `size-8 rounded-full` same dark gradient, spinner while ending.
- **Shared shadow stack** for pill/panels: `0 85px 34px #00000005, 0 48px 29px #00000014, 0 21px 21px #00000021, 0 5px 12px #00000029` + `inset 0 -1px #16171a, inset 0 0.5px #afb3c4`.
- **Insight chips** ("static-insight"): `inline-flex items-center gap-1.5 rounded-full py-2 pr-2 pl-1.5`, icon `size-3.5`, label `truncate text-xs text-white/70`, hover `border-white/30 bg-[#EDEEF2]/10`; answer text `text-[#F2F2F5]/80 text-sm leading-[1.35]`.
- **Persona icon colors**: Sales `pink`, Recruiting `amber`, Team Meet `emerald`, Looking for work `blue`, Lecture `purple` (their stroke-700/300 pairs).
- **Flow**: control pill is draggable ("Drag control window"); Ask toggles the chat window; double-click on the pill opens the Dashboard (`onDoubleClick → showDashboard`); the pill and chat window are positioned together (`ControlAndChatWindowPosition`).

**F9 — The capture-exclusion feature, fully specified** (static extraction around the `setContentProtection` call sites):

- **The flag function**: `function ue(e) { return e.isInvisible || e.isCapturingScreenshot; }` — every window's `setContentProtection(ue(e))` is ON when the **`isInvisible` setting** is on (the opt-in from their docs/settings page: "Make Invisible"), and additionally forced ON while Cluely itself takes a screenshot (`isCapturingScreenshot`), so its own capture never shows its UI. Protection is otherwise **off by default**: `isInvisible: q.boolean().default(!1)` in the zod settings schema.
- **Settings**: `isInvisible` plus `noFocusWhenInvisible: q.boolean().default(!1)` — when invisible, windows get `setFocusable(false)` and `setSkipTaskbar(true)` so the hidden overlay can't be alt-tabbed into view.
- **Window recipe** (Control window, verbatim flags): `focusable: false, frame: false, fullscreenable: false, hasShadow: false, hiddenInMissionControl: true, height: 50, minimizable: false, resizable: false, skipTaskbar: true, show: false, transparent: true, type: "panel", width: 163` — a 163×50 transparent frameless panel (the pill itself).
- **Show animation** (darwin branch): `setOpacity(0)` → `show()` → `setOpacity(1)` after 30ms.
- On Windows, `setContentProtection(true)` maps to `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`; on macOS to `NSWindowSharingNone`. That is the entire "undetectable" feature: an OS window flag that makes every screen-capture API skip the window.

### Unknowns / limitations

- The transcript→AI request/response format is server-side; exact payloads unobserved (no runtime observation was performed, static analysis only).
- Whether the paid "invisible" tier flips additional flags beyond `setContentProtection` is not distinguishable statically.

## 1. Positioning

From the landing page ([cluely.com](https://cluely.com/)):

- "**#1 Undetectable AI for Meetings**"
- "Cluely takes perfect meeting notes and gives real-time answers, all while completely undetectable"
- "Meeting AI that helps during the call, not after."
- "Invisible to others, Visible to you"

From the [manifesto](https://cluely.com/manifesto):

- "**It sees your screen. Hears your audio.**"
- "**Feeds you answers in real time.**" / "While others guess — you're already right."
- "We built Cluely so you never have to think alone again."
- Framing: calculators/spellcheck/Google were once "cheating" too; "The future won't reward effort. It'll reward leverage."

## 2. Real-time assistance (the core loop)

Landing page evidence:

- "Cluely listens in to the conversation" — the assistant ingests meeting context live.
- "Instant help via Cmd/Ctrl + Enter" — a hotkey triggers the **Assist** action.
- Inline actions shown in the demo UI: **"Assist", "What should I say?", "Follow-up questions", "Recap"**.
- "Ask about your screen or conversation" — the ask box accepts questions about **screen context** (vision) or **conversation context** (transcript).
- Example output shown on the page: an interview answer about discounted cash flow models, and code-review advice (missing `userId` check, handling `data.name` safely).

Official docs ([docs.cluely.com](https://docs.cluely.com/)) — the feature is called **Live Insights**:

> "Live Insights – 'Answers during calls'; **listens for keywords to detect questions, objections, and technical terms**, then surfaces answers using prompts, knowledge base, and enterprise AI models."

So the detection mechanism is keyword/trigger based on the live transcript, and answers are grounded in a **knowledge base** plus a system prompt.

## 3. Real-time transcription

Landing page claims:

- "Real-time transcription"
- "**12+ Languages**" — "over 12 different languages, including English, Chinese, Spanish, and more"
- "**300ms Response time** — the fastest live transcription available"
- "**95% Transcription accuracy**"

## 4. Undetectability (the overlay)

Landing page ("Undetectable in every way — Suite of features to use Cluely without a trace"):

- "Cluely **never joins your meetings**, so there are no bots and no extra people on the guest list" (screenshot shows "No bots detected")
- "Cluely never shows up in **shared screens, recordings, or external meeting tools**"
- "Cluely window is fully moveable so you can position it exactly where you're looking"

Official docs ([docs.cluely.com/feature/undetectability](https://docs.cluely.com/feature/undetectability)) — the technical mechanism:

> Cluely "uses the **same technology that Zoom does to ensure screen share does not show infinite overlays**" — i.e. a native OS window flagged the way conferencing apps filter overlay windows, and it works "as long as the software respects the Windows and MacOS default for privacy & infinite overlays."

- Toggle: "You can toggle invisibility by **hitting the Eye Icon on the command bar**" or profile icon > Settings > Make Invisible.
- "Invisibility is now an **opt-in** feature."

Third-party verification ([finalroundai.com testing, Sep 2026](https://www.finalroundai.com/blog/can-cluely-be-detected)):

- ✅ Not captured by screen share on Zoom / Meet / Teams (tldv.io's review confirms this works on the Pro+ tier).
- ❌ **Detectable** on coding/proctoring platforms (HackerRank, CoderPad, CodeSignal) — the invisibility only covers standard screen-share feeds.

## 5. Meeting notes / post-call

- Landing page: "**Instant meeting notes** — The easiest way to get beautiful, shareable meeting notes" + "No-bot meeting note taking".
- Docs: "**Instant Follow Up Actions** – Post-meeting summary, action items, and a **one-click follow-up email** drafted in your mailbox."
- Docs: "Call Coaching & Analytics – Interactive notes with a section for **missed opportunities**."

## 6. Pre-call + knowledge

Docs ([docs.cluely.com](https://docs.cluely.com/)):

- "**Pre Call Briefs** – Includes 'Meeting Alerts' via calendar connection plus 'AI Meeting Briefs' that research who you're meeting with."
- "**Knowledge Base** – Sync company docs, sales scripts, and process docs; '**RAG (retrieval-augmented generation)**' pulls relevant content during calls."
- Compatibility: Zoom, Slack, Webex, Microsoft Teams, Google Meet — "Compatible with every tool."

## 7. Pricing & gating

From [cluely.com/pricing](https://cluely.com/pricing):

| Tier | Price | Includes |
|---|---|---|
| Starter | Free | "Limited AI responses", "Limited meeting notetaking", "Customize instructions & upload files" (**up to 3 files**) |
| Pro | $19.99/mo (from $11.99 annual) | Unlimited AI responses/notes, "Unlimited access to latest AI models", **Custom Keybinds** |
| Pro + Undetectability | $149.99/mo | "Completely hidden to meeting screen sharing software" |

## 8. Feature → implementation map (this repo)

| Cluely feature (evidence above) | Where in Wingvox | Status |
|---|---|---|
| Live Insights: keyword detection of questions/objections/terms | `js/app.js` → `detectTrigger()`, auto-generates cards | ✅ working |
| Assist / What should I say / Follow-ups / Recap — **shipped prompts F4 reused verbatim** | `js/llm.js` → `assist()`, `sayWhat()`, `followups()`, `recap()` | ✅ working (real LLM w/ key, mock otherwise) |
| Modes/personas with per-mode note sections (F5) | `js/llm.js` `PERSONAS` + Notes tab persona picker | ✅ working |
| Ctrl+Enter instant help (F2) | global hotkey + ask box, `js/app.js` | ✅ working |
| Real-time transcription, 12+ languages | `js/speech.js` (Web Speech API, language selector) | ✅ working (Chrome/Edge) |
| "Ask about your screen or conversation" | `js/screen.js` (getDisplayMedia → frames → vision model) | ✅ working (Chrome/Edge) |
| Audio gating by VAD (F3) | Web Speech API has its own endpointing; demo mode substitutes | ✅ equivalent |
| Moveable overlay (F2 Ctrl+arrows) | drag with mouse + arrow-key nudge (Alt+arrows) | ✅ working |
| Eye-icon invisibility toggle | stealth toggle hides overlay to a dot (Ctrl+Shift+H) | ⚠️ browser can't set capture exclusion; see F1 |
| Always-on-top positioning | Document Picture-in-Picture mode (`btnPip`) | ✅ working (Chrome 116+) |
| Never joins the meeting / no bots | app is local-only, never touches the call | ✅ by design |
| Knowledge base + RAG during calls | `js/kb.js` (client-side retrieval into prompts) | ✅ working |
| Free tier: 3 files, 20MB (F6) | mirrored in `js/kb.js` limits | ✅ working |
| Meeting notes + per-persona summary sections + follow-up email | Notes tab → structured sections → Markdown export | ✅ working |
| Pre-call briefs | Notes tab "Pre-call brief" generator | ✅ working |
| Undetectable to OS screen capture | — | ⚠️ **not possible in a browser**; needs `setContentProtection` (Electron). PiP floats above other apps but is visible to screen share. |
| Hears the other party's audio (system audio, F3 audiotee/sox) | — | ⚠️ Web Speech API is mic-only; enable "stereo mix"/loopback as mic input, or use demo mode. |

## Sources

- [cluely.com](https://cluely.com/) — landing page (features, claims, transcription stats)
- [cluely.com/manifesto](https://cluely.com/manifesto) — "sees your screen, hears your audio"
- [cluely.com/pricing](https://cluely.com/pricing) — tiers and gating
- [docs.cluely.com](https://docs.cluely.com/) — Live Insights, Knowledge Base, Follow-ups, Briefs
- [docs.cluely.com/feature/undetectability](https://docs.cluely.com/feature/undetectability) — overlay/screen-share mechanism
- [finalroundai.com/blog/can-cluely-be-detected](https://www.finalroundai.com/blog/can-cluely-be-detected) — independent detectability testing (Sep 2026)
- [tldv.io/blog/cluely-review](https://tldv.io/blog/cluely-review) — third-party review confirming screen-share invisibility on Pro+
