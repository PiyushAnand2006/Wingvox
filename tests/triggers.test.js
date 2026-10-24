// triggers.test.js — Live Insights detection: objection → question → term → null.
require('./shim');
const { detect } = require('../js/triggers.js');

const cases = [
  ['How do you handle SSO for enterprise customers?', 'question'],
  ['Walk me through what your SLA looks like?', 'question'],
  ['the pricing feels a little steep, we are evaluating another vendor', 'objection'],
  ['It is too expensive for this quarter', 'objection'],
  ['We talked about ARR growth and EBITDA yesterday', 'term'],
  ['Kubernetes with a load balancer in front', 'term'],
  ['Alright, thanks for joining everyone, let us kick off', null],
  ['', null],
  [null, null],
];

let failed = 0;
for (const [text, expected] of cases) {
  const got = detect(text);
  const ok = got === expected;
  if (!ok) { failed++; console.error(`FAIL detect(${JSON.stringify(text)}) = ${got}, expected ${expected}`); }
}
if (failed) process.exit(1);
console.log(`triggers.test.js — ${cases.length} cases passed`);
