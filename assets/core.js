/* Pure helpers (no DOM, no network) so they can be unit-tested in Node. */
(function (root) {
  "use strict";

  const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

  function normKey(k) {
    return String(k == null ? "" : k).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function isEmail(v) {
    return EMAIL_RE.test(String(v || "").trim());
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // First address found in a cell like "Jane <jane@x.com>; other@y.com"
  function extractEmail(v) {
    const m = String(v || "").match(/[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}/);
    return m ? m[0].toLowerCase() : "";
  }

  /* Guess the email column: header contains "email"/"e-mail", else the
     column where most values look like emails. */
  function detectEmailColumn(headers, rows) {
    const byName = headers.find((h) => /e-?mail/i.test(h));
    if (byName) return byName;
    let best = null, bestScore = 0;
    headers.forEach((h) => {
      const sample = rows.slice(0, 50);
      const score = sample.filter((r) => isEmail(r[h])).length;
      if (score > bestScore) { best = h; bestScore = score; }
    });
    return best;
  }

  /* Template rendering.
     {{Key}}  {{Key|fallback}}  {{Key:url}}  {{Key:raw}}
     Lookup order: row column (normalised name) -> campaign variable -> built-in -> fallback.
     In HTML mode spreadsheet values are HTML-escaped; campaign variables are
     trusted HTML written by the sender. Variables may themselves contain
     merge fields (one nesting level). */
  const TAG_RE = /\{\{\s*([^{}|:]+?)\s*(?::\s*(url|raw|upper|lower)\s*)?(?:\|([^{}]*))?\}\}/g;

  function buildLookup(row, variables, builtins) {
    const rowMap = {}, varMap = {}, builtMap = {};
    Object.keys(row || {}).forEach((k) => { rowMap[normKey(k)] = row[k]; });
    Object.keys(variables || {}).forEach((k) => { varMap[normKey(k)] = variables[k]; });
    Object.keys(builtins || {}).forEach((k) => { builtMap[normKey(k)] = builtins[k]; });
    return { rowMap, varMap, builtMap };
  }

  function render(template, ctx, opts) {
    opts = opts || {};
    const html = !!opts.html;
    const missing = opts.missing || new Set();
    const depth = opts.depth || 0;
    const L = ctx._lookup || (ctx._lookup = buildLookup(ctx.row, ctx.variables, ctx.builtins));

    const out = String(template || "").replace(TAG_RE, (all, key, mod, fallback) => {
      const nk = normKey(key);
      let val, source;
      if (L.rowMap[nk] != null && String(L.rowMap[nk]).trim() !== "") { val = String(L.rowMap[nk]); source = "row"; }
      else if (L.varMap[nk] != null && String(L.varMap[nk]).trim() !== "") { val = String(L.varMap[nk]); source = "var"; }
      else if (L.builtMap[nk] != null && String(L.builtMap[nk]).trim() !== "") { val = String(L.builtMap[nk]); source = "builtin"; }
      else if (fallback != null) { val = fallback; source = "fallback"; }
      else { missing.add(key.trim()); return ""; }

      if (source === "var" && depth < 2 && val.indexOf("{{") !== -1) {
        val = render(val, ctx, { html, missing, depth: depth + 1, nested: true });
        source = "rendered";
      }

      if (mod === "url") return encodeURIComponent(stripTags(val));
      if (mod === "upper") val = val.toUpperCase();
      if (mod === "lower") val = val.toLowerCase();
      if (!html) return source === "var" || source === "rendered" ? stripTags(val) : val;
      if (mod === "raw" || source === "var" || source === "rendered") return val;
      return escapeHtml(val);
    });
    return out;
  }

  function listTags(template) {
    const keys = new Set();
    String(template || "").replace(TAG_RE, (a, k) => { keys.add(k.trim()); return a; });
    return Array.from(keys);
  }

  function stripTags(s) {
    return String(s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
      .replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–").replace(/&middot;/g, "·").replace(/&rarr;/g, "→");
  }

  /* Rough HTML -> plain text for the text/plain alternative. */
  function htmlToText(html) {
    let s = String(html || "")
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => {
        const t = txt.replace(/<[^>]+>/g, "").trim();
        return t && t !== href ? t + " (" + href + ")" : href;
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ");
    s = stripTags(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------- MIME ---------- */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function wrap76(b64) { return b64.replace(/.{1,76}/g, "$&\r\n").trim(); }
  function cleanHeader(v) { return String(v || "").replace(/[\r\n]+/g, " ").trim(); }
  function encodeWord(v) {
    v = cleanHeader(v);
    return /^[\x20-\x7e]*$/.test(v) ? v : "=?UTF-8?B?" + utf8ToBase64(v) + "?=";
  }
  function addressHeader(name, email) {
    email = cleanHeader(email);
    if (!name) return email;
    const n = cleanHeader(name);
    const quoted = /^[\x20-\x7e]*$/.test(n) ? '"' + n.replace(/["\\]/g, "") + '"' : encodeWord(n);
    return quoted + " <" + email + ">";
  }

  function buildMime(m) {
    const boundary = "b_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const h = [];
    h.push("From: " + addressHeader(m.fromName, m.fromEmail));
    h.push("To: " + addressHeader(m.toName, m.to));
    if (m.replyTo) h.push("Reply-To: " + cleanHeader(m.replyTo));
    h.push("Subject: " + encodeWord(m.subject));
    if (m.unsubscribeMailto) {
      h.push("List-Unsubscribe: <mailto:" + cleanHeader(m.unsubscribeMailto) + "?subject=unsubscribe>");
    }
    h.push("MIME-Version: 1.0");
    if (m.html) {
      h.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
      const body = [
        "--" + boundary,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64", "",
        wrap76(utf8ToBase64(m.text || htmlToText(m.html))),
        "--" + boundary,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64", "",
        wrap76(utf8ToBase64(m.html)),
        "--" + boundary + "--", ""
      ].join("\r\n");
      return h.join("\r\n") + "\r\n\r\n" + body;
    }
    h.push("Content-Type: text/plain; charset=UTF-8");
    h.push("Content-Transfer-Encoding: base64");
    return h.join("\r\n") + "\r\n\r\n" + wrap76(utf8ToBase64(m.text || "")) + "\r\n";
  }

  function toBase64Url(str) {
    return utf8ToBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const api = { normKey, isEmail, extractEmail, escapeHtml, detectEmailColumn, render, listTags,
    htmlToText, stripTags, buildMime, toBase64Url, utf8ToBase64, encodeWord, addressHeader };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OutreachCore = api;
})(typeof window !== "undefined" ? window : globalThis);
