// llm.js — the assist engine. Prompts and personas below are the ones shipped in
// Cluely's own bundle (EVIDENCE.md F4/F5) so behavior matches the real product.
(function () {
  const S = () => window.Store.settings;

  // ---- shipped quick-action prompts (F4) ----
  const PROMPTS = {
    assistScreen: 'Based on what\'s on my screen, infer and provide me with the best information to help me at the current moment.',
    assistConv: 'I\'m (the user) in the middle of a conversation, and I\'m asking you for help without specifically prompting you.',
    say: 'What should I say next? Output only the words I should say.',
    followups: 'Suggest two follow-up questions that I can ask to carry forward the conversation. Output as two bullet points.',
    recap: 'Recap the most recent thing that happened in the conversation.',
  };

  // ---- shipped persona templates (F5) ----
  const PERSONAS = {
    general: {
      name: 'General',
      chatPrompt: '',
      summarySections: [
        { title: 'Action Items', prompt: 'All action items that were said I would do after the meeting.' },
        { title: 'Summary', prompt: 'Concise summary of the conversation.' },
        { title: 'Next steps', prompt: 'What happens next, if anything.' },
      ],
    },
    sales: {
      name: 'Sales',
      chatPrompt: 'I am a salesperson selling to prospective buyer. Help me ask quality discovery questions, handle objections, and close the sale.',
      summarySections: [
        { title: 'Action Items', prompt: 'All action items that were said I would do after the meeting.' },
        { title: 'Outcome', prompt: 'Did I close the sale and what was the outcome of the conversation.' },
        { title: 'Prospect background', prompt: 'Background and context on who I was selling to.' },
        { title: 'Discovery', prompt: 'What the prospect said during discovery.' },
        { title: 'Product', prompt: 'How I pitched the product and the prospect\u2019s reaction.' },
        { title: 'Objections', prompt: 'Objections from the prospect if there were any.' },
      ],
    },
    recruiting: {
      name: 'Recruiting',
      chatPrompt: 'I am a recruiter evaluating job candidates for a position. Help me evaluate the candidate.',
      summarySections: [
        { title: 'Action Items', prompt: 'All action items that I have to do after the meeting.' },
        { title: 'Experience and skills', prompt: 'Candidate\u2019s previous work experience and skills discussed.' },
        { title: 'Quality of responses', prompt: 'If there were questions asked, how well and how accurately the candidate answered each question.' },
        { title: 'Interest in company', prompt: 'What the candidate said about their interest in the company.' },
        { title: 'Role expectations', prompt: 'Anything discussed about the position, salary expectations, etc.' },
      ],
    },
    teammeet: {
      name: 'Team Meet',
      chatPrompt: 'I am in a team meeting. Help me understand what\u2019s going on and contribute to the conversation if applicable.',
      summarySections: [
        { title: 'Action Items', prompt: 'All action items that were said I would do after the meeting.' },
        { title: 'Announcements', prompt: 'Any team-wide announcements from the meeting.' },
        { title: 'Team updates', prompt: 'Each team member\u2019s progress, accomplishments, and current focus.' },
        { title: 'Challenges or blockers', prompt: 'Any issues or obstacles raised that may affect progress.' },
        { title: 'Decisions made', prompt: 'Key decisions or agreements reached during the meeting.' },
      ],
    },
    interview: {
      name: 'Looking for work',
      chatPrompt: 'I am a candidate interviewing for a position. Help me answer questions during the interview. If there is code, include line-by-line comments. If a behavioral question involves an example, respond with one specific example story.',
      summarySections: [
        { title: 'Follow-up actions', prompt: 'Next interview steps or additional materials I said I would send if applicable.' },
        { title: 'Overview', prompt: 'Overview of the interview, the company, and general structure.' },
        { title: 'Questions and responses', prompt: 'All questions asked to me during the interview and answers that gave.' },
        { title: 'Areas to improve', prompt: 'What I could have done better during the interview.' },
        { title: 'Role details', prompt: 'Anything discussed about the position, salary expectations, etc.' },
      ],
    },
    lecture: {
      name: 'Lecture',
      chatPrompt: 'I am a student listening to a lecture. Help me understand what\'s happening in the lecture.',
      summarySections: [
        { title: 'Follow-up work', prompt: 'Follow-up reading, assignments, or tasks to complete.' },
        { title: 'Topic', prompt: 'Main subject or theme of the lecture.' },
        { title: 'Key concepts', prompt: 'Core ideas or frameworks covered.' },
        { title: 'Content', prompt: 'All content from the lecture with incredibly detailed bullet notes.' },
      ],
    },
  };

  function persona() { return PERSONAS[S().persona] || PERSONAS.general; }

  function transcriptText(limit = 24) {
    const t = window.Store.transcript.filter(l => l.final).slice(-limit);
    return t.map(l => l.text).join('\n');
  }

  function systemPrompt() {
    const parts = ['You are a real-time conversation copilot. You help "the user" live, mid-conversation.'];
    const p = persona();
    if (p.chatPrompt) parts.push(p.chatPrompt);
    const instr = (S().instructions || '').trim();
    if (instr) parts.push('Additional instructions from the user: ' + instr);
    parts.push('Rules: answers must be short (under 80 words unless asked otherwise), direct, spoken-style, no preamble, no apologies. If unsure, say what to say anyway — hedging is not allowed mid-call.');
    return parts.join('\n');
  }

  function buildUserMessage(actionPrompt, question, withScreen, convo, kb) {
    const bits = [];
    if (withScreen && window.ScreenCtx && window.ScreenCtx.hasFrame()) {
      bits.push('(A screenshot of the user\'s screen is attached.)');
    }
    bits.push(actionPrompt);
    if (convo) bits.push('Recent conversation transcript:\n' + convo);
    if (kb) bits.push('Relevant knowledge base excerpts:\n' + kb);
    if (question) bits.push('User\'s question: ' + question);
    return bits.join('\n\n');
  }

  // ---- real API call (OpenAI-compatible chat completions; key stays in the browser) ----
  // With onDelta: stream the response (SSE) and deliver tokens as they arrive.
  async function callReal(userMsg, imageDataUrl, onDelta) {
    const st = S();
    const content = [{ type: 'text', text: userMsg }];
    if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
    const base = {
      model: st.model,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content },
      ],
    };
    const res = await fetch(st.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.apiKey },
      body: JSON.stringify(onDelta ? { ...base, stream: true } : base),
    });
    if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 200));

    if (!onDelta || !res.body) {
      const j = await res.json();
      return j.choices?.[0]?.message?.content?.trim() || '(empty response)';
    }
    // SSE stream: lines of "data: {json}", terminated by "data: [DONE]"
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* partial frame */ }
      }
    }
    return full.trim() || '(empty response)';
  }

  // ---- mock engine: template answers grounded in transcript + KB so everything works keyless ----
  async function callMock(userMsg, imageDataUrl, kindHint, onDelta, ctx) {
    await new Promise(r => setTimeout(r, 250)); // feel "live"
    const full = mockAnswer(userMsg, imageDataUrl, kindHint, ctx);
    if (!onDelta) return full;
    // simulate streaming: reveal in small chunks
    for (let i = 0; i < full.length; i += 24) {
      onDelta(full.slice(i, i + 24));
      await new Promise(r => setTimeout(r, 18));
    }
    return full;
  }

  function mockAnswer(userMsg, imageDataUrl, kindHint, ctx = {}) {
    // ctx is snapshotted at call time — the mock must not re-read live state
    // mid-answer (a swapped Store or edited KB mid-flight would corrupt it)
    const convo = ctx.convo || '';
    const kb = ctx.kb || '';
    const last = convo.split('\n').filter(Boolean).pop() || 'the conversation so far';
    const screen = imageDataUrl ? ' (screen attached — describe what you see in the Ask box with a real model for vision)' : '';
    const tables = {
      assist: `Quick take on: "${last}"\n\n- Lead with the direct answer; one supporting detail; stop talking.\n- If it's a technical topic, name one concrete example.${kb ? '\n- From your knowledge base: ' + kb.split('\n').slice(0, 4).join(' ') : ''}`,
      say: `Here's a line you can say:\n\n"That's a great question — based on what we've discussed, my take is [your point], and here's why: [one reason]. Happy to go deeper if useful."`,
      followups: '- What\u2019s the biggest risk you see in that approach?\n- How would that change if we did it next quarter instead?',
      recap: `Most recent: "${last}"${screen}\n\nThe thread so far: ${convo ? convo.split('\n').slice(-3).join(' → ') : '(nothing yet)'}.`,
      ask: `On "${last}"${screen}: this is Mock AI — add an API key in Settings for real answers. Meanwhile, from your knowledge base:${kb ? '\n' + kb.split('\n').slice(0, 6).join('\n') : ' (add docs in the 📚 knowledge base for grounded answers)'}`,
      notes: null, brief: null,
    };
    if (kindHint && tables[kindHint]) return tables[kindHint];
    return tables.assist;
  }

  async function run(actionPrompt, { question = '', kind = 'assist', withScreen = false, onDelta } = {}) {
    // snapshot context at call time — stable even if state changes mid-answer
    const convo = transcriptText(10);
    const kb = window.KB.contextBlock(question || actionPrompt + ' ' + convo.slice(-800));
    const userMsg = buildUserMessage(actionPrompt, question, withScreen, convo, kb);
    const img = withScreen && window.ScreenCtx?.hasFrame() ? window.ScreenCtx.frameDataUrl() : null;
    if (S().apiKey && S().endpoint && S().model) {
      return callReal(userMsg, img, onDelta);
    }
    return callMock(userMsg, img, kind, onDelta, { convo, kb });
  }

  // structured meeting notes using the persona's shipped summarySections (F5)
  async function notes() {
    const p = persona();
    const convo = transcriptText(200);
    if (!convo) throw new Error('No transcript yet.');
    if (S().apiKey) {
      const out = [];
      for (const sec of p.summarySections) {
        const ans = await run(
          `Meeting-notes section "${sec.title}": ${sec.prompt} Base it only on the transcript. 1-4 bullets, terse.`,
          { kind: 'notes' }
        );
        out.push({ title: sec.title, body: ans });
      }
      return { persona: p.name, sections: out };
    }
    // mock notes
    const lines = convo.split('\n');
    return {
      persona: p.name,
      sections: p.summarySections.map(sec => ({
        title: sec.title,
        body: `- (Mock) ${sec.prompt}\n- Transcript lines analyzed: ${lines.length}`,
      })),
      mock: true,
    };
  }

  async function brief(text) {
    const p = persona();
    return run(
      `Create a pre-call brief. Input: ${text}\nInclude: who they are, likely agenda, 3 talking points, 2 questions to ask, 1 risk. Keep under 120 words.`,
      { kind: 'brief' }
    );
  }

  window.LLM = {
    PROMPTS, PERSONAS, persona, run, notes, brief,
    isLive: () => !!(S().apiKey && S().endpoint && S().model),
    assist: (q, withScreen, onDelta) => run(PROMPTS.assistConv, { question: q, kind: 'assist', withScreen, onDelta }),
    sayWhat: (onDelta) => run(PROMPTS.say, { kind: 'say', onDelta }),
    followups: (onDelta) => run(PROMPTS.followups, { kind: 'followups', onDelta }),
    recap: (onDelta) => run(PROMPTS.recap, { kind: 'recap', onDelta }),
    ask: (q, withScreen, onDelta) => run('', { question: q, kind: 'ask', withScreen, onDelta }),
  };
})();
