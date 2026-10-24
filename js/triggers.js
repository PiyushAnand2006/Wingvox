// triggers.js — Live Insights keyword detection, extracted from app.js so it can
// be unit-tested in Node. Mirrors Cluely's server-side question/objection/term
// detection (EVIDENCE.md F7): kinds are checked objection → question → term.
(function (root) {
  const OBJECTION = /\b(too expensive|too pricey|out of budget|not sure (this|it)|we (already|tried)|competitor|cheaper|budget is|hold off|not interested|think about it|another vendor)\b/i;
  const TERM = /\b(discounted cash flow|dcf|cap ?table| churn|arr|mrr|nrr|ebitda|sla|okr|kpi|latency|throughput|kubernetes|load balanc\w+|microservice\w*|api|oauth|sso|gdpr|soc ?2|rabbitmq|kafka|postgres\w*|redis|index fund|expense ratio)\b/i;
  const QUESTION = /\?$|\b(how (do|does|did|would|can)|what (is|are|was|if)|why (is|do|does|would)|walk me through|tell me about|explain|have you (used|worked|built)|describe|could you|can you|do you)\b/i;

  // returns 'objection' | 'question' | 'term' | null
  function detect(text) {
    const t = String(text || '');
    if (OBJECTION.test(t)) return 'objection';
    if (QUESTION.test(t)) return 'question';
    if (TERM.test(t)) return 'term';
    return null;
  }

  const api = { detect, OBJECTION, TERM, QUESTION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Triggers = api;
})(typeof window !== 'undefined' ? window : globalThis);
