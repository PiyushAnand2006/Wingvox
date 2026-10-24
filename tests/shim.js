// shim.js — minimal browser globals so the app's IIFE modules load under Node.
// Load this first: require('./shim') before requiring any ../js/*.js module.
(function () {
  if (typeof globalThis.window === 'undefined' || !globalThis.window.__isShim) {
    const mem = {};
    const ls = {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
      clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
    };
    globalThis.localStorage = ls;
    globalThis.window = {
      __isShim: true,
      localStorage: ls,
      // app modules attach their exports here; tests read them off window.
    };
  }
  module.exports = globalThis.window;
})();
