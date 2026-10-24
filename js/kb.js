// kb.js — knowledge base: docs stay local, retrieved into every prompt (RAG-lite).
// Mirrors Cluely's shipped free-tier limits observed in code: 3 files, 20 MB max (EVIDENCE.md F6).
(function () {
  const MAX_DOCS = 3;
  const MAX_BYTES = 20 * 1024 * 1024;
  const OLD_KEY = 'smartcheat.kb.v1';
  const KEY = 'wingvox.kb.v1';
  // one-time migration from the pre-rename key
  try {
    if (!localStorage.getItem(KEY) && localStorage.getItem(OLD_KEY)) {
      localStorage.setItem(KEY, localStorage.getItem(OLD_KEY));
      localStorage.removeItem(OLD_KEY);
    }
  } catch { }

  let docs = [];
  try { docs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { docs = []; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) {
      throw new Error('Storage full — remove a document first.');
    }
  }

  // naive retrieval: score by term overlap between query and doc chunks
  function retrieve(query, topK = 2) {
    if (!docs.length || !query) return [];
    const terms = String(query).toLowerCase().split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/).filter(t => t.length > 2);
    if (!terms.length) return [];
    const scored = docs.map(d => {
      const hay = (d.name + '\n' + d.text).toLowerCase();
      let score = 0;
      for (const t of terms) {
        let i = -1, hits = 0;
        while ((i = hay.indexOf(t, i + 1)) !== -1 && hits < 5) hits++;
        score += hits;
      }
      return { doc: d, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
    return scored.map(s => ({
      name: s.doc.name,
      excerpt: s.doc.text.slice(0, 1500),
    }));
  }

  function contextBlock(query) {
    const hits = retrieve(query);
    if (!hits.length) return '';
    return hits.map(h =>
      `--- knowledge: ${h.name} ---\n${h.excerpt}\n`
    ).join('\n');
  }

  window.KB = {
    get docs() { return docs; },
    limits: { maxDocs: MAX_DOCS, maxBytes: MAX_BYTES },
    add(name, text) {
      const size = new Blob([text]).size;
      if (size > MAX_BYTES) throw new Error(`"${name}" is over the 20 MB limit`);
      if (docs.length >= MAX_DOCS) throw new Error(`You've reached the file limit (${MAX_DOCS} files) — remove one first`);
      docs.push({ id: crypto.randomUUID(), name, text: String(text), size, added: Date.now() });
      persist();
    },
    remove(id) { docs = docs.filter(d => d.id !== id); persist(); },
    retrieve,
    contextBlock,
  };
})();
