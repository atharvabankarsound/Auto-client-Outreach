/* Auto Client Outreach. Everything runs in the browser: the spreadsheet is read
   locally and each email goes straight from this page to the Gmail API. */
(function () {
  "use strict";
  const C = window.OutreachCore;
  const CFG = window.OUTREACH_CONFIG || {};
  const BUILTIN_TEMPLATES = window.OUTREACH_TEMPLATES || [];
  const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
  const COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
  const BASE_SCOPES = "openid email profile " + SEND_SCOPE;
  const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
  const $ = (s) => document.querySelector(s);
  const esc = C.escapeHtml;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const validEmail = (v) => C.isEmail(v);

  /* ---------------- storage ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("aco." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("aco." + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("aco." + k); } catch (e) {} }
  };
  const settings = Object.assign({
    senderName: "", fromAlias: "", replyTo: "", suppression: "", clientId: "", style: "design",
    delayMin: (CFG.defaultDelaySeconds || [25, 45])[0], delayMax: (CFG.defaultDelaySeconds || [25, 45])[1],
    dailyLimit: CFG.defaultDailyLimit || 100, listUnsub: true,
    company: { name: "", email: "", phone: "", website: "", header: "", footer: "", accent: "#0071E3" },
    logo: null, logoHeight: 56
  }, store.get("settings", {}));
  settings.company = Object.assign({ name: "", email: "", phone: "", website: "", header: "", footer: "", accent: "#0071E3" }, settings.company || {});
  const saveSettings = () => store.set("settings", settings);

  /* ---------------- state ---------------- */
  const S = {
    token: null, tokenExp: 0, scopes: new Set(), email: "", googleName: "", tokenClient: null,
    pending: null, authWaiters: [], waitingAuth: false,
    workbook: null, fileName: "", sheet: "", headers: [], recs: [],
    emailCol: "", titleCol: "", nameCol: "",
    sel: new Set(), cur: null, busy: new Set(), sending: new Set(), err: new Map(),
    running: false, runKind: null, stop: false, lastFocus: null, memo: null
  };

  /* ---------------- campaign log (sent / drafted / edited addresses) ---------------- */
  function campaignName() { return $("#campaignName").value.trim() || S.fileName.replace(/\.[^.]+$/, "") || "default"; }
  function campKey() { return "camp." + campaignName(); }
  function camp() { const c = store.get(campKey(), null) || {}; c.sent = c.sent || {}; c.drafted = c.drafted || {}; c.to = c.to || {}; return c; }
  function saveCamp(c) { store.set(campKey(), c); }
  function dailyKey() { return "daily." + (S.email || "anon") + "." + new Date().toISOString().slice(0, 10); }
  const dailyCount = () => store.get(dailyKey(), 0);
  const bumpDaily = () => store.set(dailyKey(), dailyCount() + 1);
  const suppressed = () => new Set(String(settings.suppression || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const senderEmail = () => (settings.fromAlias || S.email || "").trim();
  const clientId = () => (settings.clientId || CFG.googleClientId || "").trim();

  function setStatus(html) { $("#status").innerHTML = html; }

  /* =========================================================
     GMAIL CONNECTION (Google Identity Services, token model)
     ========================================================= */
  function gisReady() { return !!(window.google && google.accounts && google.accounts.oauth2); }
  const tokenValid = (margin) => !!S.token && Date.now() < S.tokenExp - (margin || 0);
  const hasScope = (sc) => tokenValid(60000) && S.scopes.has(sc);

  /* Must be called directly inside a click handler (Google opens a popup). */
  function requestToken(extraScope) {
    return new Promise((resolve, reject) => {
      if (!clientId()) { setStatus('<span class="err">This site has no Google client ID yet. Open Settings → Advanced and paste one (see the README).</span>'); openSettings(true); return reject(new Error("no client id")); }
      if (!gisReady()) { setStatus('<span class="err">Google sign-in is still loading (or blocked by an ad-blocker). Try again in a moment.</span>'); return reject(new Error("gis not ready")); }
      if (!S.tokenClient || S.tokenClient._cid !== clientId()) {
        S.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId(), scope: BASE_SCOPES, callback: onToken,
          error_callback: (e) => { const p = S.pending; S.pending = null; setStatus('<span class="err">Google sign-in was closed or blocked' + (e && e.type ? " (" + esc(e.type) + ")" : "") + ".</span>"); if (p) p.reject(new Error("popup")); }
        });
        S.tokenClient._cid = clientId();
      }
      S.pending = { resolve, reject, need: extraScope || SEND_SCOPE };
      const scope = BASE_SCOPES + (extraScope && extraScope !== SEND_SCOPE ? " " + extraScope : "") + (S.scopes.has(COMPOSE_SCOPE) && extraScope !== COMPOSE_SCOPE ? " " + COMPOSE_SCOPE : "");
      S.tokenClient.requestAccessToken({ scope, include_granted_scopes: true, prompt: S.email ? "" : "consent", login_hint: S.email || undefined });
    });
  }

  async function onToken(resp) {
    const p = S.pending; S.pending = null;
    if (!resp || resp.error) { setStatus('<span class="err">Couldn’t connect to Gmail: ' + esc((resp && (resp.error_description || resp.error)) || "unknown error") + "</span>"); if (p) p.reject(new Error("auth")); return; }
    S.token = resp.access_token;
    S.tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
    S.scopes = new Set(String(resp.scope || "").split(/\s+/));
    if (!S.email) {
      try {
        const u = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + S.token } })).json();
        S.email = (u.email || "").toLowerCase(); S.googleName = u.name || "";
      } catch (e) {}
    }
    renderAccount();
    const need = p ? p.need : SEND_SCOPE;
    if (!S.scopes.has(need)) {
      const what = need === COMPOSE_SCOPE ? "“Manage drafts and send emails”" : "“Send email on your behalf”";
      setStatus('<span class="err">Google didn’t grant ' + what + '. Click again and tick that box on the Google screen.</span>');
      if (p) p.reject(new Error("scope"));
      return;
    }
    if (S.waitingAuth) { S.waitingAuth = false; S.authWaiters.splice(0).forEach((f) => f()); }
    if (p) p.resolve();
    if (!S.running) setStatus('<span class="ok">Connected as ' + esc(S.email || "your Gmail account") + ".</span>");
    refresh();
  }

  function ensureScope(scope) {
    if (hasScope(scope)) return Promise.resolve();
    return requestToken(scope);
  }

  function waitForAuth() {
    S.waitingAuth = true; renderAccount();
    setStatus('<span class="warn">Your Google session ran out (they last an hour). Click <b>Reconnect Gmail</b> at the top to carry on. Nothing has been lost.</span>');
    return new Promise((res) => S.authWaiters.push(res));
  }

  function renderAccount() {
    const on = tokenValid(0);
    $("#accountPill").textContent = on ? "✓ " + (settings.fromAlias || S.email) : S.email ? "Session expired" : "Gmail not connected";
    $("#accountPill").className = "pill " + (on ? "done" : S.waitingAuth ? "busy" : "");
    $("#connectBtn").hidden = on && !S.waitingAuth;
    $("#connectBtn").textContent = S.email ? "Reconnect Gmail" : "Connect Gmail";
    $("#disconnectBtn").hidden = !S.email;
    $("#gmailSentLink").href = "https://mail.google.com/mail/" + (S.email ? "?authuser=" + encodeURIComponent(S.email) : "") + "#sent";
  }
  setInterval(renderAccount, 30000);

  /* =========================================================
     SPREADSHEET
     ========================================================= */
  function readFile(file) {
    if (S.running) return;
    if (!window.XLSX) { setStatus('<span class="err">The spreadsheet reader didn’t load. Refresh the page and try again.</span>'); return; }
    const fr = new FileReader();
    fr.onload = (e) => {
      try {
        S.workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        S.fileName = file.name;
        if (!$("#campaignName").value.trim()) { $("#campaignName").value = file.name.replace(/\.[^.]+$/, ""); saveDraft(); }
        const tab = $("#tab");
        tab.disabled = false;
        tab.innerHTML = S.workbook.SheetNames.map((n) => {
          const count = Math.max(0, XLSX.utils.sheet_to_json(S.workbook.Sheets[n], { header: 1, blankrows: false }).length - 1);
          return `<option value="${esc(n)}">${esc(n)} (${count})</option>`;
        }).join("");
        $("#fileNote").innerHTML = `<span class="ok">Loaded ${esc(file.name)}.</span> Upload another file to replace it.`;
        loadSheet(S.workbook.SheetNames[0]);
        setStatus("Pick a name to preview its email. Tick the ones you want, then create drafts or send.");
      } catch (err) { console.error(err); setStatus('<span class="err">Couldn’t read that file. Is it a valid Excel or CSV file?</span>'); }
    };
    fr.readAsArrayBuffer(file);
  }

  function loadSheet(name) {
    S.sheet = name;
    const aoa = XLSX.utils.sheet_to_json(S.workbook.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false });
    const seen = {};
    const headers = (aoa[0] || []).map((h, i) => {
      let n = String(h || "").trim() || "Column " + (i + 1);
      if (seen[n]) { seen[n]++; n += " (" + seen[n] + ")"; } else seen[n] = 1;
      return n;
    });
    const rows = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => {
      const o = {}; headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]).trim(); }); return o;
    });
    S.headers = headers;
    S.recs = rows.map((row, i) => ({ key: name + "#" + (i + 2), i, row }));
    S.emailCol = C.detectEmailColumn(headers, rows) || headers[0] || "";
    S.nameCol = headers.find((h) => /^(first\s*_?names?|name|full\s*name|contact(\s*name)?|hosts?)$/i.test(h.trim())) || "";
    S.titleCol = headers.find((h) => /^(show|podcast|channel|company|business|organi[sz]ation|brand|studio|title|client)$/i.test(h.trim())) || S.nameCol || S.emailCol;
    const opts = (none) => (none ? '<option value="">— none —</option>' : "") + headers.map((h) => `<option>${esc(h)}</option>`).join("");
    $("#emailColSelect").innerHTML = opts(false); $("#emailColSelect").value = S.emailCol;
    $("#titleColSelect").innerHTML = opts(false); $("#titleColSelect").value = S.titleCol;
    $("#nameColSelect").innerHTML = opts(true); $("#nameColSelect").value = S.nameCol;
    S.sel.clear(); S.err.clear();
    S.cur = S.recs[0] ? S.recs[0].key : null;
    refresh();
  }

  const recByKey = (k) => S.recs.find((r) => r.key === k);
  function toOf(r, c) { c = c || camp(); return (c.to[r.key] != null ? c.to[r.key] : C.extractEmail(r.row[S.emailCol])) || ""; }
  const nameOf = (r) => (S.nameCol ? r.row[S.nameCol] : "") || "";
  const titleOf = (r) => r.row[S.titleCol] || nameOf(r) || toOf(r) || "Row " + (r.i + 2);
  function secondaryOf(r) { const n = nameOf(r); return n && n !== titleOf(r) ? n : "Row " + (r.i + 2); }

  /* =========================================================
     TEMPLATE & COMPOSE
     ========================================================= */
  function currentVars() {
    const v = {};
    document.querySelectorAll("#varsList .var-row").forEach((row) => {
      const k = row.querySelector("input").value.trim();
      if (k) v[k] = row.querySelector("textarea").value;
    });
    return v;
  }

  /* Company details, logo and sender become merge fields every template can use. */
  function companyBuiltins() {
    const co = settings.company, e = esc;
    const senderName = settings.senderName || S.googleName || (S.email ? S.email.split("@")[0] : "[your name]");
    const coEmail = co.email || senderEmail() || "[your email]";
    const site = co.website ? (/^https?:\/\//i.test(co.website) ? co.website : "https://" + co.website) : "";
    const siteLabel = site.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    const bits = [];
    if (coEmail && !/^\[/.test(coEmail)) bits.push({ h: `<a href="mailto:${e(coEmail)}" style="color:inherit;text-decoration:none;">${e(coEmail)}</a>`, t: coEmail });
    if (co.phone) bits.push({ h: e(co.phone), t: co.phone });
    if (site) bits.push({ h: `<a href="${e(site)}" style="color:${e(co.accent || "#0071E3")};text-decoration:none;">${e(siteLabel)}</a>`, t: site });
    const logoHtml = settings.logo ? `<img src="cid:companylogo" alt="${e(co.name || "Logo")}" height="${settings.logoHeight || 56}" style="display:block;height:${settings.logoHeight || 56}px;width:auto;max-width:260px;border:0;">` : "";
    return {
      SENDER_NAME: senderName, SENDER_EMAIL: senderEmail() || "[your Gmail address]",
      COMPANY_NAME: co.name || senderName, COMPANY_EMAIL: coEmail, COMPANY_PHONE: co.phone || "",
      WEBSITE: site || "https://example.com", WEBSITE_LABEL: siteLabel || "example.com",
      HEADER_TEXT: co.header || "", FOOTER_TEXT: co.footer || "", ACCENT: co.accent || "#0071E3",
      LOGO: logoHtml, COMPANY_CONTACT: bits.map((b) => b.h).join(" &middot; "), COMPANY_CONTACT_TEXT: bits.map((b) => b.t).join(" | ")
    };
  }
  const forPreview = (html) => settings.logo ? html.split("cid:companylogo").join(settings.logo.dataUrl) : html;
  const inlineImages = () => settings.logo ? [{ cid: "companylogo", mime: settings.logo.mime, base64: settings.logo.dataUrl.split(",")[1], name: "logo." + (settings.logo.mime.split("/")[1] || "png").replace("+xml", "") }] : [];

  function compose(r) {
    const missing = new Set();
    const ctx = {
      row: r ? r.row : {}, variables: currentVars(),
      builtins: Object.assign({ EMAIL: r ? toOf(r) : "", NAME: r ? nameOf(r) : "" }, companyBuiltins())
    };
    const subject = C.render($("#subject").value, ctx, { html: false, missing }).replace(/\s+/g, " ").trim();
    const designed = settings.style !== "plain";
    const htmlRendered = C.render($("#htmlBody").value, ctx, { html: true, missing: designed ? missing : new Set() });
    const textSrc = $("#textBody").value.trim();
    const text = textSrc ? C.render(textSrc, ctx, { html: false, missing }) : C.htmlToText(htmlRendered);
    if (!subject) missing.add("subject");
    return { subject, html: designed ? htmlRendered : "", text, missing: Array.from(missing) };
  }
  function missingFor(r) {
    if (!S.memo) S.memo = new Map();
    if (!S.memo.has(r.key)) S.memo.set(r.key, compose(r).missing);
    return S.memo.get(r.key);
  }

  function allTemplates() {
    return BUILTIN_TEMPLATES.concat(store.get("templates", []).map((t) => Object.assign({}, t, { mine: true })));
  }
  function renderTemplateSelect(id) {
    const mine = allTemplates().filter((t) => t.mine);
    $("#templateSelect").innerHTML =
      `<optgroup label="Built-in">${BUILTIN_TEMPLATES.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>` +
      (mine.length ? `<optgroup label="My templates">${mine.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>` : "");
    if (id && allTemplates().some((t) => t.id === id)) $("#templateSelect").value = id;
    const cur = allTemplates().find((t) => t.id === $("#templateSelect").value);
    $("#deleteTemplateBtn").disabled = !(cur && cur.mine);
  }
  function applyTemplate(t) {
    $("#subject").value = t.subject || ""; $("#htmlBody").value = t.html || ""; $("#textBody").value = t.text || "";
    $("#varsList").innerHTML = ""; Object.keys(t.variables || {}).forEach((k) => addVarRow(k, t.variables[k]));
    renderDescribe(t);
    saveDraft(); refresh();
  }

  /* "Describe the email": labelled fields over the template's variables. */
  function renderDescribe(t) {
    const base = allTemplates().find((x) => x.id === (t.baseId || t.id)) || t;
    const fields = base.fields || t.fields || [];
    const box = $("#describeFields");
    if (!fields.length) {
      box.innerHTML = '<p class="note" style="grid-column:1/-1">This style has no guided fields. Write the email under “Advanced” below; the logo and company details are still available as merge fields.</p>';
      return;
    }
    box.innerHTML = fields.map((f) => `<label class="field ${f.multiline ? "wide" : ""}"><span>${esc(f.label)}</span>${f.multiline ? `<textarea class="in" rows="2" data-var="${esc(f.key)}"></textarea>` : `<input class="in" type="text" data-var="${esc(f.key)}">`}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</label>`).join("");
    syncDescribeFromVars();
  }
  function syncDescribeFromVars() {
    const v = currentVars();
    document.querySelectorAll("#describeFields [data-var]").forEach((el) => { if (document.activeElement !== el) el.value = v[el.dataset.var] != null ? v[el.dataset.var] : ""; });
  }
  function setVar(key, value) {
    let row = Array.from(document.querySelectorAll("#varsList .var-row")).find((r) => r.querySelector("input").value.trim() === key);
    if (!row) { addVarRow(key, value); return; }
    row.querySelector("textarea").value = value;
  }
  function addVarRow(k, v) {
    const d = document.createElement("div");
    d.className = "var-row";
    d.innerHTML = '<input class="in" type="text" placeholder="NAME" aria-label="Variable name"><textarea class="in" rows="1" aria-label="Variable value"></textarea><button type="button" aria-label="Remove variable">×</button>';
    d.querySelector("input").value = k || ""; d.querySelector("textarea").value = v || "";
    d.querySelector("button").onclick = () => { d.remove(); saveDraft(); refresh(); };
    d.addEventListener("input", () => { saveDraft(); refreshSoon(); });
    $("#varsList").appendChild(d);
  }
  function saveDraft() {
    store.set("draft", { templateId: $("#templateSelect").value, campaign: $("#campaignName").value, subject: $("#subject").value, html: $("#htmlBody").value, text: $("#textBody").value, variables: currentVars() });
  }
  function renderTagBar() {
    const vars = Object.keys(currentVars());
    let h = "";
    if (S.headers.length) h += '<span class="label">Columns</span>' + S.headers.map((c) => `<button type="button" class="tag" data-tag="${esc(c)}">${esc(c)}</button>`).join("");
    if (vars.length) h += '<span class="label">Variables</span>' + vars.map((c) => `<button type="button" class="tag var" data-tag="${esc(c)}">${esc(c)}</button>`).join("");
    h += '<span class="label">Built-in</span>' + ["EMAIL", "NAME", "SENDER_NAME", "SENDER_EMAIL"].map((c) => `<button type="button" class="tag var" data-tag="${c}">${c}</button>`).join("");
    $("#tagBar").innerHTML = h;
  }
  function insertTag(tag) {
    const el = S.lastFocus || $("#htmlBody");
    const ins = "{{" + tag + "}}";
    const s = el.selectionStart != null ? el.selectionStart : el.value.length, e = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    el.value = el.value.slice(0, s) + ins + el.value.slice(e);
    el.focus(); el.selectionStart = el.selectionEnd = s + ins.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* =========================================================
     LIST
     ========================================================= */
  function stateOf(r, c) {
    const to = toOf(r, c).toLowerCase();
    if (S.sending.has(r.key)) return ["busy", "Sending"];
    if (to && c.sent[to]) { const n = c.sent[to].count || 1; return ["done", n > 1 ? "Sent ×" + n : "Sent"]; }
    if (S.busy.has(r.key)) return ["busy", "Drafting"];
    if (to && c.drafted[to]) { const n = c.drafted[to].count || 1; return ["done", n > 1 ? "Drafted ×" + n : "Drafted"]; }
    if (S.err.has(r.key)) return ["err", "Failed"];
    if (to && suppressed().has(to)) return ["err", "Do not email"];
    if (to && !validEmail(to)) return ["err", "Bad address"];
    if (missingFor(r).length) return ["busy", "Missing info"];
    return ["", "Ready"];
  }

  function renderRows() {
    if (!S.recs.length) { counts(); renderSent(); return; }
    const c = camp();
    const q = $("#q").value.trim().toLowerCase();
    const list = S.recs.filter((r) => !q || Object.values(r.row).some((v) => String(v).toLowerCase().includes(q)));
    $("#rows").innerHTML = list.map((r) => {
      const [cls, label] = stateOf(r, c); const to = toOf(r, c);
      return `<div class="row" data-k="${esc(r.key)}" aria-current="${S.cur === r.key}"><input type="checkbox" aria-label="Select ${esc(titleOf(r))}" ${S.sel.has(r.key) ? "checked" : ""}><span style="min-width:0"><b>${esc(titleOf(r))}</b><small>${to ? "✉ " + esc(to) : "No address yet"} · ${esc(secondaryOf(r))}</small></span><span class="pill ${cls}">${esc(label)}</span></div>`;
    }).join("") || '<p class="note" style="padding:10px">No rows match your search.</p>';
    counts(); renderSent();
  }

  function counts() {
    const c = camp();
    const tos = S.recs.map((r) => toOf(r, c).toLowerCase());
    $("#sTotal").textContent = S.recs.length;
    $("#sSent").textContent = tos.filter((t) => t && c.sent[t]).length;
    $("#sDone").textContent = tos.filter((t) => t && c.drafted[t]).length;
    $("#sSel").textContent = S.sel.size;
    const n = S.sel.size, sendingRun = S.running && S.runKind === "send";
    $("#make").disabled = S.running || !n;
    $("#sendSel").disabled = !sendingRun && (S.running || !n);
    $("#make").textContent = n ? `Create ${n} draft${n === 1 ? "" : "s"} in Gmail` : "Create drafts in Gmail";
    $("#sendSel").textContent = sendingRun ? "Stop sending" : n ? `Send ${n} now` : "Send selected";
    $("#sendSel").classList.toggle("primary", !sendingRun);
  }

  function frameDoc(m) {
    return settings.style === "plain"
      ? `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff;color:#202124;font:14px/1.6 Arial,sans-serif;padding:24px 28px;white-space:pre-wrap">${esc(m.text)}</body></html>`
      : `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0;background:#E4E2DD">${forPreview(m.html)}</body></html>`;
  }

  function show(k) {
    const r = recByKey(k);
    if (!r) { renderEmpty(); return; }
    S.cur = k;
    const c = camp(); const to = toOf(r, c); const toL = to.toLowerCase();
    const m = compose(r);
    $("#subj").textContent = m.subject || "(no subject)";
    if (document.activeElement !== $("#to")) $("#to").value = to;
    $("#to").disabled = false;
    const d = toL && c.drafted[toL], s = toL && c.sent[toL];
    let note;
    if (S.err.has(k)) note = `<span class="err">${esc(S.err.get(k))}</span>`;
    else if (m.missing.length) note = `<span class="warn">Missing: ${esc(m.missing.join(", "))}. Add the column, a campaign variable or a fallback like {{Field|default}}.</span>`;
    else if (s) note = `<span class="ok">Sent ${new Date(s.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${s.count > 1 ? " (" + s.count + " times)" : ""}${s.manual ? ", marked by hand" : ""}.</span>`;
    else if (d) note = `<span class="ok">Drafted in Gmail${d.count > 1 ? " " + d.count + " times" : ""}.</span> ${d.viewUrl ? `<a href="${esc(d.viewUrl)}" target="_blank" rel="noopener">Open the draft</a>` : ""}`;
    else note = esc(secondaryOf(r)) + " · sheet row " + (r.i + 2);
    $("#pnote").innerHTML = note;
    ["#one", "#sendOne", "#cpTo", "#cpSubj", "#cpBody", "#markSent"].forEach((id) => { $(id).disabled = S.running && (id === "#one" || id === "#sendOne"); });
    $("#one").textContent = d ? "Draft again" : "Draft this one";
    $("#sendOne").textContent = s ? "Send again" : "Send now";
    $("#frame").srcdoc = frameDoc(m);
    document.querySelectorAll("#rows .row").forEach((el) => el.setAttribute("aria-current", String(el.dataset.k === k)));
  }

  function renderEmpty() {
    const m = compose(null);
    $("#subj").textContent = m.subject || "—";
    $("#to").value = ""; $("#to").disabled = true;
    ["#one", "#sendOne", "#cpTo", "#cpSubj", "#cpBody", "#markSent"].forEach((id) => { $(id).disabled = true; });
    $("#pnote").textContent = "Template preview with no client data. Upload a sheet to see each personalised email.";
    $("#frame").srcdoc = frameDoc(m);
  }

  function renderSent() {
    const c = camp();
    const items = Object.keys(c.sent).map((e) => Object.assign({ email: e }, c.sent[e])).sort((a, b) => b.at - a.at);
    $("#sentCount").textContent = items.length;
    $("#sentList").innerHTML = items.length ? items.map((x) => `<div class="row"><span style="min-width:0"><b>${esc(x.title || x.email)}</b><small>${esc(x.email)} · ${new Date(x.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${x.manual ? " · marked by hand" : ""}</small></span><span class="pill done">${x.count > 1 ? "Sent ×" + x.count : "Sent"}</span></div>`).join("")
      : '<p class="note" style="padding:8px">Nothing has been sent in this campaign yet.</p>';
  }

  let raf = false, soonT;
  function refresh() {
    if (raf) return; raf = true;
    requestAnimationFrame(() => {
      raf = false; S.memo = null;
      renderTagBar(); renderRows(); renderAccount();
      if (S.cur && recByKey(S.cur)) show(S.cur); else renderEmpty();
    });
  }
  function refreshSoon() { clearTimeout(soonT); soonT = setTimeout(refresh, 250); }

  /* =========================================================
     GMAIL API
     ========================================================= */
  async function gmailPost(path, payload) {
    const res = await fetch(GMAIL + path, { method: "POST", headers: { Authorization: "Bearer " + S.token, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    let body = null; try { body = await res.json(); } catch (e) {}
    if (res.ok) return body || {};
    const e = new Error((body && body.error && body.error.message) || res.statusText || "HTTP " + res.status);
    e.status = res.status;
    const reason = body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
    e.retryable = res.status >= 500 || res.status === 429 || /rateLimitExceeded|backendError/i.test(reason || "");
    e.daily = /dailyLimitExceeded|quotaExceeded/i.test(reason || "") || /daily.*limit|sending limit/i.test(e.message);
    throw e;
  }

  function rawFor(r, m) {
    return C.toBase64Url(C.buildMime({
      fromName: settings.senderName || S.googleName || "", fromEmail: senderEmail(),
      to: toOf(r), toName: nameOf(r), replyTo: settings.replyTo || "",
      subject: m.subject, html: m.html, text: m.text, inlineImages: m.html ? inlineImages() : [],
      unsubscribeMailto: settings.listUnsub ? (settings.replyTo || senderEmail()) : ""
    }));
  }

  /* Retries server errors and rate limits; waits for reconnect on expired sessions. */
  async function withRetry(label, fn) {
    for (let i = 0; ; i++) {
      if (!tokenValid(60000)) await waitForAuth();
      try { return await fn(); }
      catch (e) {
        if (e.status === 401) { S.token = null; await waitForAuth(); continue; }
        if (!e.retryable || e.daily || i >= 3) throw e;
        for (let s = 30 * (i + 1); s > 0 && !S.stop; s--) { setStatus(`<span class="warn">Gmail is busy (${esc(e.message)}). Retrying ${esc(label)} in ${s}s… (attempt ${i + 2} of 4)</span>`); await sleep(1000); }
        if (S.stop) throw e;
      }
    }
  }

  function checkSendable(r, needAddress) {
    const to = toOf(r).toLowerCase();
    if (needAddress && !validEmail(to)) return "Add a valid email address first.";
    if (to && !validEmail(to)) return "That address doesn’t look right. Fix it or clear it.";
    if (to && suppressed().has(to)) return "This address is on your do-not-email list (Settings).";
    const miss = compose(r).missing;
    if (miss.length) return "Missing: " + miss.join(", ") + ".";
    return "";
  }

  async function draftOne(r) {
    const m = compose(r);
    const res = await withRetry(titleOf(r), () => gmailPost("/drafts", { message: { raw: rawFor(r, m) } }));
    const c = camp(); const to = toOf(r, c).toLowerCase();
    if (!to) return;
    const msgId = res.message && res.message.id;
    const prev = c.drafted[to];
    c.drafted[to] = { at: Date.now(), title: titleOf(r), draftId: res.id || "", count: ((prev && prev.count) || 0) + 1,
      viewUrl: "https://mail.google.com/mail/?authuser=" + encodeURIComponent(S.email) + "#drafts" + (msgId ? "?compose=" + msgId : "") };
    saveCamp(c);
  }

  async function sendOne(r) {
    const m = compose(r);
    const res = await withRetry(titleOf(r), () => gmailPost("/messages/send", { raw: rawFor(r, m) }));
    const c = camp(); const to = toOf(r, c).toLowerCase();
    const prev = c.sent[to];
    c.sent[to] = { at: Date.now(), title: titleOf(r), id: res.id || "", count: ((prev && prev.count) || 0) + 1 };
    saveCamp(c); bumpDaily();
  }

  async function runDrafts(keys) {
    if (S.running) return;
    S.running = true; S.runKind = "draft"; S.stop = false; counts();
    let ok = 0, fail = 0;
    for (const k of keys) {
      const r = recByKey(k); if (!r) continue;
      const bad = checkSendable(r, false);
      if (bad) { S.err.set(k, bad); fail++; continue; }
      S.busy.add(k); renderRows(); setStatus(`Creating draft ${ok + fail + 1} of ${keys.length}: ${esc(titleOf(r))}…`);
      try { await draftOne(r); ok++; S.sel.delete(k); S.err.delete(k); }
      catch (e) { fail++; S.err.set(k, "Gmail didn’t accept this draft: " + e.message); if (e.status === 403) { S.busy.delete(k); break; } }
      S.busy.delete(k); renderRows(); if (S.cur === k) show(k);
      await sleep(300);
    }
    S.running = false; S.runKind = null; counts();
    setStatus(`${ok ? `<span class="ok">${ok} draft${ok === 1 ? "" : "s"} created in Gmail.</span> ` : ""}${fail ? `<span class="err">${fail} not drafted (see the red notes).</span> ` : ""}Nothing has been sent. Open Gmail → Drafts to review and send.`);
    refresh();
  }

  async function runSend(keys) {
    if (S.running) return;
    S.running = true; S.runKind = "send"; S.stop = false; counts();
    $("#progressWrap").hidden = false; $("#progressBar").style.width = "0%";
    let ok = 0, fail = 0, done = 0, lastErr = "";
    for (const k of keys) {
      if (S.stop) break;
      const r = recByKey(k); if (!r) continue;
      if (dailyCount() >= settings.dailyLimit) { lastErr = `daily limit of ${settings.dailyLimit} reached (change it in Settings)`; break; }
      const bad = checkSendable(r, true);
      if (bad) { S.err.set(k, bad); fail++; done++; continue; }
      S.sending.add(k); renderRows(); if (S.cur === k) show(k);
      setStatus(`Sending ${done + 1} of ${keys.length}: ${esc(titleOf(r))}…`);
      try { await sendOne(r); ok++; S.sel.delete(k); S.err.delete(k); }
      catch (e) {
        fail++; lastErr = e.message; S.err.set(k, "Gmail didn’t send this email: " + e.message);
        if (e.daily || e.status === 403) { S.sending.delete(k); done++; break; }
      }
      S.sending.delete(k); done++;
      $("#progressBar").style.width = (100 * done / keys.length).toFixed(1) + "%";
      renderRows(); if (S.cur === k) show(k);
      if (done < keys.length && !S.stop) {
        const wait = Number(settings.delayMin) + Math.random() * Math.max(0, settings.delayMax - settings.delayMin);
        const end = Date.now() + wait * 1000;
        while (Date.now() < end && !S.stop) { setStatus(`${ok} sent${fail ? ", " + fail + " failed" : ""} · next email in ${Math.ceil((end - Date.now()) / 1000)}s · keep this page open`); await sleep(250); }
      }
    }
    const stopped = S.stop;
    S.running = false; S.runKind = null; S.stop = false; counts();
    $("#progressWrap").hidden = true;
    setStatus(`${ok ? `<span class="ok">${ok} email${ok === 1 ? "" : "s"} sent from ${esc(senderEmail())}.</span> ` : ""}${fail ? `<span class="err">${fail} not sent.</span> ` : ""}${lastErr ? `<span class="err">Last error: ${esc(lastErr)}.</span> ` : ""}${stopped ? "Stopped by you." : ""}`);
    refresh();
  }

  /* ---------------- confirm bar ---------------- */
  function askConfirm(msg, yesLabel, fn) {
    const box = $("#confirm");
    $("#confirmMsg").textContent = msg; $("#confirmYes").textContent = yesLabel || "Yes, send now";
    box.hidden = false; box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    $("#confirmYes").onclick = () => { box.hidden = true; fn(); };
    $("#confirmNo").onclick = () => { box.hidden = true; };
  }

  /* =========================================================
     COPY / MARK SENT
     ========================================================= */
  async function copyText(txt, html) {
    try {
      if (html && window.ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([txt], { type: "text/plain" }) })]);
        return "Copied with the design. Paste into a new Gmail message.";
      }
      await navigator.clipboard.writeText(txt); return "Copied.";
    } catch (e) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (_) {} ta.remove();
      return ok ? "Copied (plain text)." : "Your browser blocked copying. Select the text in the preview instead.";
    }
  }

  /* =========================================================
     SETTINGS
     ========================================================= */
  function openSettings(advanced) {
    $("#senderName").value = settings.senderName; $("#fromAlias").value = settings.fromAlias; $("#replyTo").value = settings.replyTo;
    $("#delayMin").value = settings.delayMin; $("#delayMax").value = settings.delayMax; $("#dailyLimit").value = settings.dailyLimit;
    $("#listUnsub").checked = !!settings.listUnsub; $("#suppression").value = settings.suppression;
    $("#clientIdInput").value = settings.clientId; $("#originHint").textContent = location.origin;
    $("#sentTodayNote").textContent = S.email ? dailyCount() + " sent today from " + S.email + "." : "Gmail’s own cap is about 500/day (personal) or 2,000 (Workspace). For cold outreach stay far below.";
    const d = $("#settingsDialog"); d.returnValue = ""; d.showModal();
    if (advanced) { $("#clientIdInput").closest("details").open = true; $("#clientIdInput").focus(); }
  }
  $("#settingsDialog").addEventListener("close", () => {
    if ($("#settingsDialog").returnValue !== "save") return;
    settings.senderName = $("#senderName").value.trim(); settings.fromAlias = $("#fromAlias").value.trim(); settings.replyTo = $("#replyTo").value.trim();
    settings.delayMin = Math.max(5, Math.round(+$("#delayMin").value || 25));
    settings.delayMax = Math.max(settings.delayMin, Math.round(+$("#delayMax").value || settings.delayMin));
    settings.dailyLimit = Math.max(1, Math.round(+$("#dailyLimit").value || 100));
    settings.listUnsub = $("#listUnsub").checked; settings.suppression = $("#suppression").value;
    const cid = $("#clientIdInput").value.trim(); if (cid !== settings.clientId) { settings.clientId = cid; S.tokenClient = null; }
    saveSettings(); refresh(); setStatus('<span class="ok">Settings saved.</span>');
  });

  /* =========================================================
     WIRING
     ========================================================= */
  $("#connectBtn").onclick = () => { requestToken(SEND_SCOPE).catch(() => {}); };
  $("#disconnectBtn").onclick = () => {
    if (S.running) { setStatus('<span class="err">Stop sending first.</span>'); return; }
    if (S.token && gisReady()) google.accounts.oauth2.revoke(S.token, () => {});
    S.token = null; S.tokenExp = 0; S.email = ""; S.googleName = ""; S.scopes = new Set();
    setStatus("Disconnected from Gmail."); refresh();
  };
  $("#settingsBtn").onclick = () => openSettings(false);

  $("#fileInput").onchange = (e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ""; };
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { if (hasFiles(e)) { e.preventDefault(); $(".list").classList.add("over"); } }));
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) $(".list").classList.remove("over"); });
  document.addEventListener("drop", (e) => { $(".list").classList.remove("over"); if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });

  $("#tab").onchange = (e) => loadSheet(e.target.value);
  $("#emailColSelect").onchange = (e) => { S.emailCol = e.target.value; refresh(); };
  $("#titleColSelect").onchange = (e) => { S.titleCol = e.target.value; refresh(); };
  $("#nameColSelect").onchange = (e) => { S.nameCol = e.target.value; refresh(); };
  $("#q").oninput = renderRows;
  $("#style").value = settings.style;
  $("#style").onchange = (e) => { settings.style = e.target.value; saveSettings(); refresh(); };

  $("#rows").addEventListener("click", (e) => {
    const el = e.target.closest(".row[data-k]"); if (!el) return;
    const k = el.dataset.k;
    if (e.target.matches("input[type=checkbox]")) { e.target.checked ? S.sel.add(k) : S.sel.delete(k); counts(); return; }
    show(k);
  });
  $("#selAll").onclick = () => {
    const c = camp(), sup = suppressed(), seen = new Set();
    S.recs.forEach((r) => {
      const to = toOf(r, c).toLowerCase();
      if (validEmail(to) && !c.sent[to] && !sup.has(to) && !seen.has(to)) S.sel.add(r.key);
      if (to) seen.add(to);
    });
    renderRows();
  };
  $("#selNone").onclick = () => { S.sel.clear(); renderRows(); };

  $("#to").oninput = (e) => { const r = recByKey(S.cur); if (!r) return; const c = camp(); c.to[r.key] = e.target.value.trim(); saveCamp(c); };
  $("#to").onchange = () => { S.err.delete(S.cur); refresh(); };

  $("#pasteGo").onclick = () => {
    let n = 0; const miss = []; const c = camp();
    $("#paste").value.split(/\n+/).forEach((line) => {
      const m = line.match(/^(.*?)[,\t;|]\s*([^\s,;|]+@[^\s,;|]+)\s*$/); if (!m) return;
      const name = m[1].trim().toLowerCase();
      const labels = (r) => [titleOf(r), nameOf(r)].map((x) => String(x || "").toLowerCase());
      const r = S.recs.find((x) => labels(x).includes(name)) || S.recs.find((x) => labels(x).some((l) => l && (l.includes(name) || name.includes(l))));
      if (r && validEmail(m[2])) { c.to[r.key] = m[2].trim(); n++; } else miss.push(m[1].trim());
    });
    saveCamp(c);
    $("#pasteNote").textContent = `${n} address${n === 1 ? "" : "es"} added.` + (miss.length ? ` Couldn’t match: ${miss.join(", ")}.` : "");
    refresh();
  };

  // Drafts need the extra "manage drafts" permission, asked for only when first used.
  function startDrafts(keys) { ensureScope(COMPOSE_SCOPE).then(() => runDrafts(keys)).catch(() => {}); }
  $("#make").onclick = () => { if (S.sel.size) startDrafts(S.recs.filter((r) => S.sel.has(r.key)).map((r) => r.key)); };
  $("#one").onclick = () => { if (S.cur) startDrafts([S.cur]); };

  $("#sendOne").onclick = () => {
    const r = recByKey(S.cur); if (!r) return;
    const bad = checkSendable(r, true);
    if (bad) { $("#pnote").innerHTML = `<span class="err">${esc(bad)}</span>`; return; }
    askConfirm(`Send the ${titleOf(r)} email to ${toOf(r)} now${senderEmail() ? " from " + senderEmail() : ""}?`, "Yes, send now",
      () => ensureScope(SEND_SCOPE).then(() => runSend([r.key])).catch(() => {}));
  };
  $("#sendSel").onclick = () => {
    if (S.running && S.runKind === "send") { S.stop = true; setStatus("Stopping…"); return; }
    const keys = S.recs.filter((r) => S.sel.has(r.key)).map((r) => r.key);
    const problems = keys.filter((k) => checkSendable(recByKey(k), true));
    if (problems.length) {
      problems.forEach((k) => S.err.set(k, checkSendable(recByKey(k), true)));
      setStatus(`<span class="err">${problems.length} selected ${problems.length === 1 ? "has" : "have"} no valid address or missing details (marked Failed). Fix ${problems.length === 1 ? "it" : "them"} or untick ${problems.length === 1 ? "it" : "them"}.</span>`);
      renderRows(); return;
    }
    const left = settings.dailyLimit - dailyCount();
    const avg = (settings.delayMin + settings.delayMax) / 2;
    const n = Math.min(keys.length, Math.max(0, left));
    if (!n) { setStatus(`<span class="err">You’ve reached today’s limit of ${settings.dailyLimit} for this account. Change it in Settings if you’re sure.</span>`); return; }
    askConfirm(`Send ${keys.length} email${keys.length === 1 ? "" : "s"} now${senderEmail() ? " from " + senderEmail() : ""}? They go out one every ${settings.delayMin}–${settings.delayMax} seconds (about ${Math.max(1, Math.ceil(n * avg / 60))} min), so keep this page open until it finishes.${n < keys.length ? ` Only ${n} fit in today’s limit; the rest stay selected for tomorrow.` : ""}`,
      "Yes, send now", () => ensureScope(SEND_SCOPE).then(() => runSend(keys)).catch(() => {}));
  };

  const curRec = () => recByKey(S.cur);
  $("#cpTo").onclick = async () => { const r = curRec(); if (r) $("#cpNote").textContent = await copyText(toOf(r)); };
  $("#cpSubj").onclick = async () => { const r = curRec(); if (r) $("#cpNote").textContent = await copyText(compose(r).subject); };
  $("#cpBody").onclick = async () => { const r = curRec(); if (!r) return; const m = compose(r); $("#cpNote").textContent = await copyText(m.text, settings.style === "plain" ? null : forPreview(m.html)); };
  $("#markSent").onclick = () => {
    const r = curRec(); if (!r) return; const c = camp(); const to = toOf(r, c).toLowerCase();
    if (!to) { $("#cpNote").textContent = "Add the address first."; return; }
    const prev = c.sent[to]; c.sent[to] = { at: Date.now(), title: titleOf(r), count: ((prev && prev.count) || 0) + 1, manual: true };
    saveCamp(c); $("#cpNote").textContent = "Marked as sent."; refresh();
  };

  function exportLog(kind) {
    const c = camp(); const rows = [];
    Object.keys(c.sent).forEach((e) => rows.push({ email: e, name: c.sent[e].title || "", status: c.sent[e].manual ? "sent (marked)" : "sent", times: c.sent[e].count || 1, at: new Date(c.sent[e].at).toISOString() }));
    Object.keys(c.drafted).forEach((e) => rows.push({ email: e, name: c.drafted[e].title || "", status: "drafted", times: c.drafted[e].count || 1, at: new Date(c.drafted[e].at).toISOString() }));
    if (!rows.length) { setStatus("Nothing in this campaign’s log yet."); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Log");
    XLSX.writeFile(wb, "outreach-log-" + campaignName().replace(/[^\w-]+/g, "_") + (kind === "csv" ? ".csv" : ".xlsx"), kind === "csv" ? { bookType: "csv" } : {});
  }
  $("#exportXlsx").onclick = () => exportLog("xlsx");
  $("#exportCsv").onclick = () => exportLog("csv");

  // template editor
  $("#templateSelect").onchange = (e) => { const t = allTemplates().find((x) => x.id === e.target.value); if (t) applyTemplate(t); renderTemplateSelect(e.target.value); };
  $("#saveTemplateBtn").onclick = () => {
    const cur = allTemplates().find((t) => t.id === $("#templateSelect").value);
    const name = (window.prompt("Name this template", cur && cur.mine ? cur.name : (cur ? "My " + cur.name : "My template")) || "").trim();
    if (!name) return;
    const mine = store.get("templates", []);
    let t = mine.find((x) => x.name === name);
    if (!t) { t = { id: "mine-" + Date.now().toString(36), name }; mine.push(t); }
    const curBase = allTemplates().find((x) => x.id === $("#templateSelect").value);
    Object.assign(t, { subject: $("#subject").value, html: $("#htmlBody").value, text: $("#textBody").value, variables: currentVars(), baseId: (curBase && (curBase.baseId || curBase.id)) || t.baseId, fields: (curBase && curBase.fields) || t.fields || [] });
    store.set("templates", mine); renderTemplateSelect(t.id); saveDraft(); setStatus(`<span class="ok">Saved “${esc(name)}” in this browser.</span>`);
  };
  $("#deleteTemplateBtn").onclick = () => {
    const id = $("#templateSelect").value; const mine = store.get("templates", []); const t = mine.find((x) => x.id === id); if (!t) return;
    askConfirm(`Delete your template “${t.name}”?`, "Delete", () => {
      store.set("templates", mine.filter((x) => x.id !== id));
      renderTemplateSelect(BUILTIN_TEMPLATES[0].id); applyTemplate(BUILTIN_TEMPLATES[0]);
    });
  };
  $("#importHtml").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => { const m = txt.match(/<body[^>]*>([\s\S]*)<\/body>/i); $("#htmlBody").value = m ? m[1].trim() : txt; saveDraft(); refresh(); setStatus("Imported " + esc(f.name) + "."); });
    e.target.value = "";
  };
  ["#subject", "#htmlBody", "#textBody"].forEach((id) => {
    $(id).addEventListener("focus", () => { S.lastFocus = $(id); });
    $(id).addEventListener("input", () => { saveDraft(); refreshSoon(); });
  });
  $("#campaignName").addEventListener("input", () => { saveDraft(); refreshSoon(); });
  $("#tagBar").addEventListener("click", (e) => { const b = e.target.closest("[data-tag]"); if (b) insertTag(b.dataset.tag); });
  $("#addVarBtn").onclick = () => { addVarRow("", ""); $("#varsList").lastChild.querySelector("input").focus(); };
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tabpanel").forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
    };
  });

  $("#clearLogBtn").onclick = () => { $("#settingsDialog").close(); askConfirm(`Clear the sent and drafted log for “${campaignName()}”? Everyone could be emailed again.`, "Clear log", () => { store.del(campKey()); refresh(); }); };
  $("#clearAllBtn").onclick = () => { $("#settingsDialog").close(); askConfirm("Erase settings, templates, logs and added addresses from this browser?", "Erase everything", () => { Object.keys(localStorage).filter((k) => k.startsWith("aco.")).forEach((k) => localStorage.removeItem(k)); location.reload(); }); };

  $("#describeFields").addEventListener("input", (e) => {
    const el = e.target.closest("[data-var]"); if (!el) return;
    setVar(el.dataset.var, el.value); saveDraft(); refreshSoon();
  });
  $("#varsList").addEventListener("input", syncDescribeFromVars);

  /* ---- company logo ---- */
  function setLogo(file) {
    if (!file || !/^image\//.test(file.type)) { setStatus('<span class="err">Please choose a PNG, JPG, GIF, WebP or SVG image.</span>'); return; }
    const finish = (dataUrl, mime) => {
      if (dataUrl.length > 1.5e6) { setStatus('<span class="err">That image is too large after resizing (max about 1 MB). Try a smaller or simpler file.</span>'); return; }
      settings.logo = { dataUrl, mime, name: file.name }; saveSettings(); renderLogo(); refresh();
      setStatus('<span class="ok">Logo added. It appears in the email header and is sent inside each email.</span>');
    };
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result);
      if (file.type === "image/svg+xml" || file.type === "image/gif") return finish(src, file.type);
      const img = new Image();
      img.onload = () => {
        const maxW = 600, maxH = 300, scale = Math.min(1, maxW / img.width, maxH / img.height);
        if (scale === 1 && file.size < 300000) return finish(src, file.type);
        const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const png = file.type === "image/jpeg"; finish(c.toDataURL(png ? "image/jpeg" : "image/png", 0.9), png ? "image/jpeg" : "image/png");
      };
      img.onerror = () => setStatus('<span class="err">Couldn’t read that image.</span>');
      img.src = src;
    };
    fr.readAsDataURL(file);
  }
  function renderLogo() {
    const has = !!settings.logo;
    $("#logoPreview").hidden = !has; if (has) $("#logoPreview").src = settings.logo.dataUrl;
    $("#logoText").hidden = has; $("#logoRemove").hidden = !has; $("#logoHeight").value = String(settings.logoHeight || 56);
  }
  $("#logoInput").onchange = (e) => { if (e.target.files[0]) setLogo(e.target.files[0]); e.target.value = ""; };
  $("#logoRemove").onclick = () => { settings.logo = null; saveSettings(); renderLogo(); refresh(); };
  $("#logoHeight").onchange = (e) => { settings.logoHeight = Number(e.target.value) || 56; saveSettings(); refresh(); };
  const logoDrop = $("#logoDrop");
  ["dragenter", "dragover"].forEach((ev) => logoDrop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); logoDrop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => logoDrop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); logoDrop.classList.remove("over"); $(".list").classList.remove("over"); }));
  logoDrop.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) setLogo(e.dataTransfer.files[0]); });

  /* ---- company details ---- */
  const coFields = { coName: "name", coEmail: "email", coPhone: "phone", coWebsite: "website", coHeader: "header", coFooter: "footer" };
  function renderCompany() {
    Object.keys(coFields).forEach((id) => { $("#" + id).value = settings.company[coFields[id]] || ""; });
    $("#coAccent").value = /^#[0-9a-f]{6}$/i.test(settings.company.accent) ? settings.company.accent : "#0071E3";
    $("#coAccentText").value = settings.company.accent || "#0071E3";
  }
  Object.keys(coFields).forEach((id) => { $("#" + id).addEventListener("input", (e) => { settings.company[coFields[id]] = e.target.value.trim(); saveSettings(); refreshSoon(); }); });
  $("#coAccent").oninput = (e) => { settings.company.accent = e.target.value; $("#coAccentText").value = e.target.value; saveSettings(); refreshSoon(); };
  $("#coAccentText").addEventListener("input", (e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { settings.company.accent = v; $("#coAccent").value = v; saveSettings(); refreshSoon(); } });

  window.addEventListener("beforeunload", (e) => { if (S.running) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------------- init ---------------- */
  const draft = store.get("draft", null);
  renderTemplateSelect(draft && draft.templateId);
  if (draft) { $("#campaignName").value = draft.campaign || ""; applyTemplate(Object.assign({ baseId: draft.templateId }, draft)); renderTemplateSelect(draft.templateId); }
  else applyTemplate(BUILTIN_TEMPLATES[0]);
  renderLogo(); renderCompany();
  if (!clientId()) setStatus('Start with step 1: upload your client sheet. <span class="warn">This site has no Google client ID yet, so Gmail can’t connect until one is added (Settings → Advanced, or config.js).</span>');
  refresh();
})();
