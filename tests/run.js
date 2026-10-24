// run.js — zero-dependency, in-process test runner. Literal requires only;
// a suite fails by throwing (sync) or rejecting (async). To add a suite,
// copy one of the try/catch blocks with your file's literal path.
const failures = [];
const passes = [];
process.on('unhandledRejection', (e) => {
  failures.push('async: ' + (e && e.message ? e.message : String(e)));
});

try { require('./triggers.test.js'); passes.push('triggers.test.js'); }
catch (e) { failures.push('triggers.test.js: ' + (e && e.message ? e.message : e)); }

try { require('./kb.test.js'); passes.push('kb.test.js'); }
catch (e) { failures.push('kb.test.js: ' + (e && e.message ? e.message : e)); }

try { require('./llm.test.js'); passes.push('llm.test.js'); }
catch (e) { failures.push('llm.test.js: ' + (e && e.message ? e.message : e)); }

try { require('./store.test.js'); passes.push('store.test.js'); }
catch (e) { failures.push('store.test.js: ' + (e && e.message ? e.message : e)); }

// async suites (llm/store) settle via timers/promises — give them a moment
setTimeout(() => {
  for (const p of passes) console.log('PASS ' + p);
  for (const x of failures) console.error('FAIL ' + x);
  console.log(failures.length === 0
    ? `\n${passes.length} test files, all passed`
    : `\n${failures.length} test files FAILED`);
  process.exit(failures.length ? 1 : 0);
}, 2000);
