/* Turns a plain-English brief into the email's fields, by calling an AI
   provider straight from the browser with the user's own API key. */
(function (root) {
  "use strict";

  const PROVIDERS = {
    gemini: {
      label: "Google Gemini", defaultModel: "gemini-2.5-flash",
      help: 'Free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com</a> (Create API key). The free tier is enough for drafting.',
      async call(key, model, system, user) {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.7, responseMimeType: "application/json" } })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j.error && j.error.message) || res.statusText || "HTTP " + res.status);
        return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || "").join("");
      }
    },
    anthropic: {
      label: "Anthropic Claude", defaultModel: "claude-sonnet-5-5",
      help: 'Key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Pay as you go; a draft costs a fraction of a penny.',
      async call(key, model, system, user) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: "user", content: user }] })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j.error && j.error.message) || res.statusText || "HTTP " + res.status);
        return (j.content || []).map((c) => c.text || "").join("");
      }
    },
    openai: {
      label: "OpenAI", defaultModel: "gpt-4.1-mini",
      help: 'Key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a>. Pay as you go.',
      async call(key, model, system, user) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify({ model, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j.error && j.error.message) || res.statusText || "HTTP " + res.status);
        return (((j.choices || [])[0] || {}).message || {}).content || "";
      }
    }
  };

  function parseJson(text) {
    let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a > 0 || b < t.length - 1) t = t.slice(a, b + 1);
    return JSON.parse(t);
  }

  /* ctx: { brief, fields:[{key,label,hint}], current:{key:value}, subject, columns:[], company:{}, senderName, previousBrief } */
  function buildPrompt(ctx) {
    const cols = (ctx.columns || []).filter((c) => c);
    const mergeHelp = cols.length
      ? "The sender's spreadsheet has these columns, usable as merge fields exactly like {{Column Name}} (add a fallback with a pipe, e.g. {{First Name|there}}): " + cols.map((c) => "{{" + c + "}}").join(", ") + "."
      : "No spreadsheet is loaded yet; you may use {{First Name|there}} and {{Company|your team}} as merge fields.";
    const co = ctx.company || {};
    const coLines = [co.name && "Company name: " + co.name, co.header && "Tagline: " + co.header, co.website && "Website: " + co.website, co.email && "Email: " + co.email, co.phone && "Phone: " + co.phone, ctx.senderName && "Sender's name: " + ctx.senderName].filter(Boolean).join("\n");
    const schema = (ctx.fields || []).map((f) => `"${f.key}": string  // ${f.label}${f.hint ? ". " + f.hint.replace(/\{\{/g, "{{") : ""}`).join("\n");
    const system = [
      "You write short, warm, specific cold-outreach emails for small businesses. British English unless the brief says otherwise.",
      "Never invent facts, awards, statistics, prices or client names the brief did not give. Keep claims modest and honest.",
      "Personalise with merge fields where it reads naturally (greeting, subject, opening line), never more than a few times.",
      "Headlines may contain one <br> for a line break; everything else is plain text with no HTML or markdown.",
      "Always include a polite one-line opt-out that invites the reader to reply 'no thanks'.",
      "Reply with a single JSON object and nothing else."
    ].join(" ");
    const user = [
      "BRIEF FROM THE SENDER:\n" + ctx.brief,
      ctx.previousBrief && ctx.current ? "They are refining an earlier draft. Keep what works, apply the new notes.\nEARLIER DRAFT (JSON):\n" + JSON.stringify(Object.assign({ subject: ctx.subject }, ctx.current)) : "",
      coLines ? "SENDER'S COMPANY:\n" + coLines : "The sender hasn't filled in company details; refer to them as 'we' and {{COMPANY_NAME}}.",
      mergeHelp,
      "Return JSON with exactly these keys:\n{\n\"subject\": string  // short, specific, no clickbait, may use a merge field\n" + schema + "\n}"
    ].filter(Boolean).join("\n\n");
    return { system, user };
  }

  async function draft(provider, key, model, ctx) {
    const P = PROVIDERS[provider];
    if (!P) throw new Error("Unknown provider");
    if (!key) throw new Error("Add your " + P.label + " API key under AI settings first.");
    const { system, user } = buildPrompt(ctx);
    const text = await P.call(key.trim(), (model || P.defaultModel).trim(), system, user);
    const out = parseJson(text);
    const wanted = new Set(["subject"].concat((ctx.fields || []).map((f) => f.key)));
    const clean = {};
    Object.keys(out).forEach((k) => { if (wanted.has(k) && out[k] != null) clean[k] = String(out[k]).trim(); });
    if (!Object.keys(clean).length) throw new Error("The AI replied in an unexpected format. Try again.");
    return clean;
  }

  root.OutreachAI = { PROVIDERS, draft, buildPrompt, parseJson };
})(typeof window !== "undefined" ? window : globalThis);
