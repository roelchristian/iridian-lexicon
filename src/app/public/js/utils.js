// ── Pure utility helpers ─────────────────────────────────────────────────────

// HTML-escape a value for safe insertion into attribute/text nodes.
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(text, query) {
  const source = String(text ?? '');
  const tokens = [...new Set(
    String(query ?? '')
      .trim()
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
  )];
  if (!tokens.length) return esc(source);

  const regex = new RegExp(
    tokens
      .sort((a, b) => b.length - a.length)
      .map((token) => escapeRegExp(token))
      .join('|'),
    'gi'
  );

  let html = '';
  let lastIndex = 0;
  for (const match of source.matchAll(regex)) {
    const index = match.index ?? 0;
    html += esc(source.slice(lastIndex, index));
    html += `<strong>${esc(match[0])}</strong>`;
    lastIndex = index + match[0].length;
  }
  html += esc(source.slice(lastIndex));
  return html;
}

// ── Toast notification ───────────────────────────────────────────────────────
let toastTimer;
export function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

// ── Lemma → key normalization ────────────────────────────────────────────────
// Replaces háček letters with digraphs, keeps accent marks, lowercases.
export function normalizeLemmaToKey(lemma) {
  return lemma
    .toLowerCase()
    .replace(/š/g, 'sh').replace(/č/g, 'ch').replace(/ž/g, 'zh')
    .replace(/đ/g, 'dj').replace(/ć/g, 'ch').replace(/ř/g, 'rz')
    .replace(/ě/g, 'e') .replace(/ñ/g, 'n')
    // keep a-z, accent marks, digits, hyphens; collapse everything else to hyphen
    .replace(/[^a-záéíóúýàèìòùāēīōūäëïöüãõ0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
