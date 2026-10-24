// store.test.js — settings persistence, key migration, session snapshot round-trip.
require('./shim');
const ls = globalThis.localStorage;
require('../js/store.js');
const Store = globalThis.window.Store;

function assert(cond, msg) { if (!cond) { console.error('FAIL ' + msg); process.exit(1); } }

// defaults
assert(Store.settings.lang === 'en-US', 'default language');
assert(Store.settings.audioSource === 'mic', 'default audio source is mic');

// settings persist through the storage key
Store.settings.persona = 'sales';
Store.save();
assert(localStorage.getItem('wingvox.v1').includes('"persona":"sales"'), 'settings saved under wingvox.v1');

// migration from the pre-rename key
localStorage.setItem('smartcheat.v1', JSON.stringify({ instructions: 'MIGRATION' }));
localStorage.removeItem('wingvox.v1');
delete require.cache[require.resolve('../js/store.js')];
require('../js/store.js');
const Store2 = globalThis.window.Store;
assert(Store2.settings.instructions === 'MIGRATION', 'old smartcheat.v1 settings migrated');
assert(localStorage.getItem('smartcheat.v1') === null, 'old key removed after migration');

// session snapshot round-trip (debounced — flush by waiting past the timer)
Store2.transcript.push({ ts: 1, text: 'hello', final: true });
Store2.insights.push({ id: 'i1', kind: 'question', heard: 'q?', answer: 'a', loading: false, open: true });
Store2.notesMD = '# notes';
Store2.sessionSave();
setTimeout(() => {
  delete require.cache[require.resolve('../js/store.js')];
  require('../js/store.js');
  const Store3 = globalThis.window.Store;
  assert(Store3.transcript.length === 1 && Store3.transcript[0].text === 'hello', 'transcript restored');
  assert(Store3.insights[0].answer === 'a', 'insight answer restored');
  assert(Store3.notesMD === '# notes', 'notes restored');
  Store3.sessionClear();
  assert(localStorage.getItem('wingvox.session.v1') === null, 'session cleared');
  console.log('store.test.js — passed');
}, 800);
