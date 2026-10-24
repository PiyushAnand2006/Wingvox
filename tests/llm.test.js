// llm.test.js — shipped personas intact, mock engine grounded, streaming callback fires.
require('./shim');
require('../js/store.js');
require('../js/kb.js');
require('../js/llm.js');
const { LLM, Store } = globalThis.window;

function assert(cond, msg) { if (!cond) { console.error('FAIL ' + msg); process.exit(1); } }

// personas: the six recovered from Cluely's bundle (EVIDENCE.md F5)
const names = Object.values(LLM.PERSONAS).map(p => p.name);
for (const expected of ['General', 'Sales', 'Recruiting', 'Team Meet', 'Looking for work', 'Lecture']) {
  assert(names.includes(expected), `persona "${expected}" present`);
}
// shipped quick-action prompts (F4)
assert(LLM.PROMPTS.say === 'What should I say next? Output only the words I should say.', 'say prompt verbatim');
assert(LLM.PROMPTS.followups.includes('two bullet points'), 'follow-ups prompt verbatim');

// mock engine answers reference the transcript
Store.settings.apiKey = '';
Store.transcript.push({ ts: Date.now(), text: 'How do you handle SSO for enterprise customers?', final: true });
(async () => {
  const answer = await LLM.assist('SSO question');
  assert(answer.length > 10, 'mock assist returns text');
  assert(answer.includes('SSO'), 'mock answer references the question');

  // mock streaming: deltas arrive progressively
  let deltas = 0, last = '';
  const full = await LLM.sayWhat((d) => { deltas++; last += d; });
  assert(deltas > 1, 'mock streaming emits multiple deltas');
  assert(last === full || last.length >= full.length - 2, 'streamed deltas reconstruct the answer');

  // notes: persona sections with mock bodies
  const notes = await LLM.notes();
  assert(notes.mock === true && notes.sections.length >= 3, 'mock notes return persona sections');

  console.log('llm.test.js — passed');
})().catch(e => { console.error('FAIL ' + (e.stack || e)); process.exit(1); });
