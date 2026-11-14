/* Auto Client Outreach: all logic runs in the browser.
   Contacts never leave the page except as the emails you send through Gmail. */
(function () {
  "use strict";
  const C = window.OutreachCore;
  const CFG = window.OUTREACH_CONFIG || {};
  const BUILTIN_TEMPLATES = window.OUTREACH_TEMPLATES || [];
  const SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.send";
  const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
  const $ = (id) => document.getElementById(id);
  const esc = C.escapeHtml;

  /* ---------------- storage ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("aco." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("aco." + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem("aco." + k); } catch (e) {} }
  };

  /* ---------------- state ---------------- */
  const S = {
    token: null, tokenExp: 0, email: "", googleName: "", tokenClient: null,
    workbook: null, fileName: "", headers: [], recs: [], emailCol: "", nameCol: "",
    selected: new Set(), previewPos: 0, filter: "",
    sending: false, paused: false, stop: false, waitingAuth: false,
    results: [], lastFocus: null
  };

  const settings = Object.assign({
    senderName: "", fromAlias: "", replyTo: "", suppression: "", clientId: "",
    delayMin: (CFG.defaultDelaySeconds || [25, 45])[0], delayMax: (CFG.defaultDelaySeconds || [25, 45])[1],
    dailyLimit: CFG.defaultDailyLimit || 100
  }, store.get("settings", {}));
  const saveSettings = () => store.set("settings", settings);

  let draft = store.get("draft", null);

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg, bad) {
    const t = $("toast");
    t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = "toast"; }, bad ? 6000 : 3200);
  }

  /* ---------------- helpers ---------------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const senderEmail = () => (settings.fromAlias || S.email || "").trim();
  const suppressionSet = () => new Set(String(settings.suppression || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const campaignKey = () => (S.email || "anon") + "::" + ($("campaignName").value.trim() || "default");
  function sentLog() { const all = store.get("sent", {}); return all[campaignKey()] || {}; }
  function markSent(email, info) {
    const all = store.get("sent", {}); const k = campaignKey();
    all[k] = all[k] || {}; all[k][email] = info; store.set("sent", all);
  }
  function dailyCount() { return (store.get("daily", {})[(S.email || "anon") + "|" + today()]) || 0; }
  function bumpDaily() {
    const d = store.get("daily", {}); const k = (S.email || "anon") + "|" + today();
    // prune old days
    Object.keys(d).forEach((key) => { if (!key.endsWith(today())) delete d[key]; });
    d[k] = (d[k] || 0) + 1; store.set("daily", d);
  }
  function clientId() { return (settings.clientId || CFG.googleClientId || "").trim(); }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function fmtDur(sec) {
    sec = Math.round(sec); if (sec < 60) return sec + "s";
    const m = Math.round(sec / 60); if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  /* =========================================================
     1. GMAIL CONNECTION (Google Identity Services token model)
     ========================================================= */
  function waitForGis(timeoutMs) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function check() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - t0 > timeoutMs) return reject(new Error("Google sign-in didn't load. Check your connection or ad-blocker."));
        setTimeout(check, 150);
      })();
    });
  }

  async function connect() {
    if (!clientId()) { $("clientIdWarning").classList.remove("hidden"); openSettings(true); return; }
    try { await waitForGis(8000); } catch (e) { toast(e.message, true); return; }
    if (!S.tokenClient || S.tokenClient._cid !== clientId()) {
      S.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPES,
        callback: onToken,
        error_callback: (err) => { toast("Google sign-in was cancelled or blocked" + (err && err.type ? " (" + err.type + ")" : "") + ".", true); }
      });
      S.tokenClient._cid = clientId();
    }
    S.tokenClient.requestAccessToken({ prompt: S.email ? "" : "consent", login_hint: S.email || undefined });
  }

  async function onToken(resp) {
    if (!resp || resp.error) { toast("Couldn't connect: " + ((resp && (resp.error_description || resp.error)) || "unknown error"), true); return; }
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, "https://www.googleapis.com/auth/gmail.send")) {
      toast("Please tick “Send email on your behalf” when Google asks, otherwise nothing can be sent.", true);
      return;
    }
    S.token = resp.access_token;
    S.tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
    try {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + S.token } });
      const u = await r.json();
      S.email = (u.email || "").toLowerCase(); S.googleName = u.name || "";
    } catch (e) { /* keep going: sending still works */ }
    renderAccount();
    toast("Connected as " + (S.email || "your Gmail account"));
    if (S.waitingAuth) { S.waitingAuth = false; S.paused = false; updateSendButtons(); toast("Reconnected. Sending resumes."); }
    refreshAll();
  }

  function disconnect() {
    if (S.sending) { toast("Stop sending first.", true); return; }
    if (S.token && window.google && google.accounts) google.accounts.oauth2.revoke(S.token, () => {});
    S.token = null; S.tokenExp = 0; S.email = ""; S.googleName = "";
    renderAccount(); refreshAll();
  }

  function tokenValid(marginMs) { return !!S.token && Date.now() < S.tokenExp - (marginMs || 0); }

  function renderAccount() {
    const on = tokenValid(0);
    $("accountPill").textContent = on ? S.email || "Connected" : (S.email ? "Session expired" : "Gmail not connected");
    $("accountPill").className = "pill " + (on ? "pill-on" : "pill-off");
    $("connectBtn").textContent = on ? "Connected ✓" : S.waitingAuth ? "Reconnect to continue sending" : (S.email ? "Reconnect Gmail" : "Connect Gmail");
    $("connectBtn").disabled = on && !S.waitingAuth;
    $("disconnectBtn").classList.toggle("hidden", !S.email);
    $("s1status").textContent = on ? "Connected" : "Not connected";
    $("s1status").className = "status " + (on ? "ok" : "");
    $("clientIdWarning").classList.toggle("hidden", !!clientId());
  }
  setInterval(renderAccount, 30000);

  /* =========================================================
     2. CONTACTS
     ========================================================= */
  function readFile(file) {
    if (!window.XLSX) { toast("The spreadsheet reader didn't load. Refresh the page and try again.", true); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        S.workbook = wb; S.fileName = file.name;
        $("sheetSelect").innerHTML = wb.SheetNames.map((n) => `<option>${esc(n)}</option>`).join("");
        loadSheet(wb.SheetNames[0]);
        $("sheetControls").classList.remove("hidden");
        toast("Loaded " + file.name);
      } catch (err) { console.error(err); toast("Couldn't read that file. Is it a valid Excel or CSV file?", true); }
    };
    reader.readAsArrayBuffer(file);
  }

  function loadSheet(name) {
    const ws = S.workbook.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    if (!aoa.length) { S.headers = []; S.recs = []; renderContacts(); return; }
    const seen = {};
    const headers = aoa[0].map((h, i) => {
      let n = String(h || "").trim() || "Column " + (i + 1);
      if (seen[n]) { seen[n]++; n = n + " (" + seen[n] + ")"; } else seen[n] = 1;
      return n;
    });
    const rows = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => {
      const o = {}; headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]).trim(); }); return o;
    });
    S.headers = headers;
    S.emailCol = C.detectEmailColumn(headers, rows) || headers[0];
    S.nameCol = headers.find((h) => /^(first\s*_?names?|name|full\s*name|contact(\s*name)?)$/i.test(h.trim())) || "";
    const opts = (withNone) => (withNone ? `<option value="">— none —</option>` : "") + headers.map((h) => `<option>${esc(h)}</option>`).join("");
    $("emailColSelect").innerHTML = opts(false); $("emailColSelect").value = S.emailCol;
    $("nameColSelect").innerHTML = opts(true); $("nameColSelect").value = S.nameCol;
    S.recs = rows.map((row, i) => ({ i, row }));
    rebuildRecs(true);
  }

  function rebuildRecs(resetSelection) {
    const seen = new Set();
    S.recs.forEach((r) => {
      r.email = C.extractEmail(r.row[S.emailCol]);
      r.valid = !!r.email;
      r.dup = r.valid && seen.has(r.email);
      if (r.valid) seen.add(r.email);
      r.name = S.nameCol ? r.row[S.nameCol] : "";
    });
    if (resetSelection) {
      const sup = suppressionSet();
      S.selected = new Set(S.recs.filter((r) => r.valid && !r.dup && !sup.has(r.email)).map((r) => r.i));
      S.previewPos = 0;
    }
    refreshAll();
  }

  function missingFor(r) {
    if (!S.memo) S.memo = new Map();
    if (!S.memo.has(r.i)) S.memo.set(r.i, compose(r).missing);
    return S.memo.get(r.i);
  }

  function recStatus(r) {
    if (!r.valid) return ["invalid", "No valid email", "b-bad"];
    if (r.dup) return ["dup", "Duplicate", "b-mute"];
    if (suppressionSet().has(r.email)) return ["suppressed", "Do not email", "b-mute"];
    if (sentLog()[r.email]) return ["sent", "Already sent", "b-ok"];
    const m = missingFor(r);
    if (m.length) return ["missing", "Missing: " + m.join(", "), "b-warn"];
    return ["ready", "Ready", "b-ok"];
  }

  function renderContacts() {
    const tbl = $("contactTable");
    if (!S.headers.length) { tbl.innerHTML = ""; $("contactStats").innerHTML = ""; $("s2status").textContent = ""; return; }
    const f = S.filter.toLowerCase();
    const visible = S.recs.filter((r) => !f || Object.values(r.row).some((v) => String(v).toLowerCase().includes(f)));
    const limit = 500;
    const cols = S.headers;
    const curI = previewRecs()[S.previewPos] && previewRecs()[S.previewPos].i;
    let html = "<thead><tr><th></th><th>#</th><th>Status</th>" + cols.map((h) => `<th>${esc(h)}</th>`).join("") + "</tr></thead><tbody>";
    visible.slice(0, limit).forEach((r) => {
      const st = recStatus(r);
      const sel = S.selected.has(r.i);
      html += `<tr data-i="${r.i}" class="${sel ? "sel" : ""} ${r.valid ? "" : "invalid"} ${r.i === curI ? "current" : ""}">` +
        `<td><input type="checkbox" data-i="${r.i}" ${sel ? "checked" : ""} ${r.valid ? "" : "disabled"} aria-label="Include row ${r.i + 2}"></td>` +
        `<td>${r.i + 2}</td><td><span class="badge ${st[2]}" title="${esc(st[1])}">${esc(st[1])}</span></td>` +
        cols.map((h) => `<td title="${esc(r.row[h])}">${esc(r.row[h])}</td>`).join("") + "</tr>";
    });
    if (visible.length > limit) html += `<tr><td colspan="${cols.length + 3}" class="tiny">Showing the first ${limit} of ${visible.length} matching rows. Use search to find others. All rows are still included when sending.</td></tr>`;
    tbl.innerHTML = html + "</tbody>";

    const total = S.recs.length, valid = S.recs.filter((r) => r.valid).length;
    const dups = S.recs.filter((r) => r.dup).length;
    $("contactStats").innerHTML =
      `<span class="stat"><b>${total}</b> rows</span>` +
      `<span class="stat ok"><b>${valid - dups}</b> unique valid emails</span>` +
      (total - valid ? `<span class="stat bad"><b>${total - valid}</b> without a valid email</span>` : "") +
      (dups ? `<span class="stat warn"><b>${dups}</b> duplicates</span>` : "") +
      `<span class="stat"><b>${S.selected.size}</b> selected</span>`;
    $("s2status").textContent = S.selected.size + " selected";
    $("s2status").className = "status " + (S.selected.size ? "ok" : "");
  }

  /* =========================================================
     3. TEMPLATE
     ========================================================= */
  function allTemplates() {
    const mine = store.get("templates", []).map((t) => Object.assign({}, t, { mine: true }));
    return BUILTIN_TEMPLATES.concat(mine);
  }

  function renderTemplateSelect(selectedId) {
    const list = allTemplates();
    $("templateSelect").innerHTML =
      `<optgroup label="Built-in">${BUILTIN_TEMPLATES.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>` +
      (list.some((t) => t.mine) ? `<optgroup label="My templates">${list.filter((t) => t.mine).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>` : "");
    if (selectedId && list.some((t) => t.id === selectedId)) $("templateSelect").value = selectedId;
    $("deleteTemplateBtn").disabled = !list.find((t) => t.id === $("templateSelect").value && t.mine);
  }

  function applyTemplate(t) {
    $("subject").value = t.subject || "";
    $("htmlBody").value = t.html || "";
    $("textBody").value = t.text || "";
    $("sendHtml").checked = t.sendHtml !== false;
    renderVars(t.variables || {});
    saveDraft(); refreshAll();
  }

  function currentVars() {
    const v = {};
    document.querySelectorAll("#varsList .var-row").forEach((row) => {
      const k = row.querySelector("input").value.trim();
      if (k) v[k] = row.querySelector("textarea").value;
    });
    return v;
  }

  function renderVars(vars) {
    $("varsList").innerHTML = "";
    Object.keys(vars).forEach((k) => addVarRow(k, vars[k]));
  }
  function addVarRow(k, v) {
    const d = document.createElement("div");
    d.className = "var-row";
    d.innerHTML = `<input type="text" placeholder="NAME" aria-label="Variable name"><textarea rows="1" aria-label="Variable value"></textarea><button type="button" title="Remove" aria-label="Remove variable">×</button>`;
    d.querySelector("input").value = k || ""; d.querySelector("textarea").value = v || "";
    d.querySelector("button").onclick = () => { d.remove(); saveDraft(); refreshAll(); };
    d.addEventListener("input", () => { saveDraft(); refreshAllDebounced(); });
    $("varsList").appendChild(d);
  }

  function saveDraft() {
    draft = {
      templateId: $("templateSelect").value, campaign: $("campaignName").value,
      subject: $("subject").value, html: $("htmlBody").value, text: $("textBody").value,
      sendHtml: $("sendHtml").checked, variables: currentVars()
    };
    store.set("draft", draft);
  }

  function renderTagBar() {
    const vars = Object.keys(currentVars());
    const builtins = ["EMAIL", "NAME", "SENDER_NAME", "SENDER_EMAIL"];
    const cols = S.headers;
    let h = "";
    if (cols.length) h += `<span class="label">Columns</span>` + cols.map((c) => `<button type="button" class="tag" data-tag="${esc(c)}">${esc(c)}</button>`).join("");
    if (vars.length) h += `<span class="label">Variables</span>` + vars.map((c) => `<button type="button" class="tag var" data-tag="${esc(c)}">${esc(c)}</button>`).join("");
    h += `<span class="label">Built-in</span>` + builtins.map((c) => `<button type="button" class="tag var" data-tag="${c}">${c}</button>`).join("");
    $("tagBar").innerHTML = h;
  }

  function insertTag(tag) {
    const el = S.lastFocus || $("htmlBody");
    const ins = "{{" + tag + "}}";
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, s) + ins + el.value.slice(e);
    el.focus(); el.selectionStart = el.selectionEnd = s + ins.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* compose one email for a record */
  function compose(r) {
    const missing = new Set();
    const row = r ? r.row : {};
    const ctx = {
      row, variables: currentVars(),
      builtins: {
        EMAIL: r ? r.email : "", NAME: r ? r.name : "",
        SENDER_NAME: settings.senderName || S.googleName || "", SENDER_EMAIL: senderEmail()
      }
    };
    const subject = C.render($("subject").value, ctx, { html: false, missing }).replace(/\s+/g, " ").trim();
    const useHtml = $("sendHtml").checked;
    const html = useHtml ? C.render($("htmlBody").value, ctx, { html: true, missing }) : "";
    const textSrc = $("textBody").value.trim();
    const text = textSrc ? C.render(textSrc, ctx, { html: false, missing }) : C.htmlToText(C.render($("htmlBody").value, ctx, { html: true, missing }));
    if (!subject) missing.add("(subject is empty)");
    return { subject, html, text, missing: Array.from(missing) };
  }

  /* =========================================================
     PREVIEW
     ========================================================= */
  function previewRecs() {
    const sel = S.recs.filter((r) => S.selected.has(r.i));
    return sel.length ? sel : S.recs.filter((r) => r.valid);
  }

  function renderPreview() {
    const list = previewRecs();
    if (S.previewPos >= list.length) S.previewPos = Math.max(0, list.length - 1);
    const r = list[S.previewPos] || null;
    const m = compose(r);
    $("previewWho").textContent = r ? `Recipient ${S.previewPos + 1} of ${list.length}${S.selected.size ? " selected" : ""} · sheet row ${r.i + 2}` : "Example with no spreadsheet data";
    $("pvTo").textContent = r ? (r.name ? r.name + " <" + r.email + ">" : r.email) : "—";
    $("pvSubject").textContent = m.subject || "(no subject)";
    $("pvMissing").classList.toggle("hidden", !m.missing.length || !r);
    $("pvMissing").textContent = m.missing.length ? "Missing for this recipient: " + m.missing.join(", ") + ". Add the column, a campaign variable or a fallback like {{Field|default}}." : "";
    const useHtml = $("sendHtml").checked;
    $("previewFrame").classList.toggle("hidden", !useHtml);
    $("previewText").classList.toggle("hidden", useHtml);
    if (useHtml) {
      $("previewFrame").srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;background:#fff}</style></head><body>${m.html}</body></html>`;
    } else {
      $("previewText").textContent = m.text;
    }
    const tplOk = !!$("subject").value.trim() && !!(useHtml ? $("htmlBody").value.trim() : (m.text || "").trim());
    $("s3status").textContent = tplOk ? "Ready" : "Needs subject & body";
    $("s3status").className = "status " + (tplOk ? "ok" : "");
  }

  /* =========================================================
     4. SENDING
     ========================================================= */
  function buildQueue() {
    const sup = suppressionSet(); const log = sentLog();
    const skipMissing = $("skipMissing").checked, skipSent = $("skipSent").checked;
    const q = [], skipped = { missing: 0, sent: 0, suppressed: 0 };
    S.recs.forEach((r) => {
      if (!S.selected.has(r.i) || !r.valid || r.dup) return;
      if (sup.has(r.email)) { skipped.suppressed++; return; }
      if (skipSent && log[r.email]) { skipped.sent++; return; }
      if (skipMissing && missingFor(r).length) { skipped.missing++; return; }
      q.push(r);
    });
    return { q, skipped };
  }

  function renderSummary() {
    $("sentToday").value = S.email ? dailyCount() + " / " + settings.dailyLimit : "—";
    if (!S.recs.length) { $("sendSummary").innerHTML = "Upload a spreadsheet to see who will be emailed."; return; }
    const { q, skipped } = buildQueue();
    const left = Math.max(0, settings.dailyLimit - dailyCount());
    const n = Math.min(q.length, left);
    const avg = (Number(settings.delayMin) + Number(settings.delayMax)) / 2;
    let s = `<div class="big">${q.length} email${q.length === 1 ? "" : "s"} ready</div>`;
    const bits = [];
    if (skipped.sent) bits.push(`${skipped.sent} already emailed`);
    if (skipped.missing) bits.push(`${skipped.missing} missing merge fields`);
    if (skipped.suppressed) bits.push(`${skipped.suppressed} on your do-not-email list`);
    if (bits.length) s += `<div>Skipping ${bits.join(", ")}.</div>`;
    if (q.length) s += `<div>From <b>${esc(senderEmail() || "your Gmail")}</b> · about <b>${fmtDur(n * avg)}</b> at ${settings.delayMin}–${settings.delayMax}s apart.</div>`;
    if (q.length > left) s += `<div>Your daily limit allows <b>${left}</b> more today; the rest can be sent tomorrow (they'll be skipped as already sent only once they go).</div>`;
    $("sendSummary").innerHTML = s;
    $("s4status").textContent = S.sending ? (S.paused ? "Paused" : "Sending…") : "";
  }

  async function gmailSend(raw) {
    const res = await fetch(GMAIL + "/messages/send", {
      method: "POST",
      headers: { Authorization: "Bearer " + S.token, "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    });
    let body = null; try { body = await res.json(); } catch (e) {}
    if (res.ok) return body;
    const msg = (body && body.error && body.error.message) || res.statusText || "HTTP " + res.status;
    const reason = body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
    const err = new Error(msg); err.status = res.status; err.reason = reason;
    err.auth = res.status === 401;
    err.rate = res.status === 429 || /rateLimit|quota|dailyLimit|userRateLimit/i.test(reason || "") || /limit exceeded/i.test(msg);
    throw err;
  }

  function mimeFor(r, m, opts) {
    return C.toBase64Url(C.buildMime({
      fromName: settings.senderName || S.googleName || "",
      fromEmail: senderEmail(),
      to: r.email, toName: r.name || "",
      replyTo: settings.replyTo || "",
      subject: (opts && opts.subjectPrefix ? opts.subjectPrefix : "") + m.subject,
      html: m.html, text: m.text,
      unsubscribeMailto: $("listUnsub").checked ? (settings.replyTo || senderEmail()) : ""
    }));
  }

  async function sendTest() {
    if (!tokenValid(30000)) { toast("Connect Gmail first.", true); return; }
    const r0 = previewRecs()[S.previewPos];
    const m = compose(r0 || null);
    if (!m.subject) { toast("Add a subject first.", true); return; }
    const r = { email: S.email, name: "" };
    $("testBtn").disabled = true;
    try {
      await gmailSend(mimeFor(r, m, { subjectPrefix: "[TEST] " }));
      bumpDaily();
      toast("Test sent to " + S.email + (r0 ? " (personalised for " + r0.email + ")" : ""));
    } catch (e) { toast("Test failed: " + e.message, true); }
    $("testBtn").disabled = false; renderSummary();
  }

  function askConfirm(title, bodyHtml, okLabel) {
    return new Promise((resolve) => {
      const d = $("confirmDialog");
      $("confirmTitle").textContent = title; $("confirmBody").innerHTML = bodyHtml; $("confirmOk").textContent = okLabel || "OK";
      d.returnValue = "";
      d.addEventListener("close", function h() { d.removeEventListener("close", h); resolve(d.returnValue === "ok"); });
      d.showModal();
    });
  }

  async function startSending() {
    if (S.sending) return;
    if (!tokenValid(60000)) { toast("Connect Gmail first.", true); connect(); return; }
    const { q } = buildQueue();
    if (!q.length) { toast("Nobody to email. Check your selection and the summary above.", true); return; }
    const left = settings.dailyLimit - dailyCount();
    if (left <= 0) { toast("Daily limit reached for this account. Try again tomorrow or raise the limit carefully.", true); return; }
    const n = Math.min(q.length, left);
    const avg = (Number(settings.delayMin) + Number(settings.delayMax)) / 2;
    const ok = await askConfirm("Send " + n + " email" + (n === 1 ? "" : "s") + "?",
      `<p>From <b>${esc(senderEmail())}</b>${settings.senderName ? " as “" + esc(settings.senderName) + "”" : ""}.</p>
       <p>Subject for the first recipient: <b>${esc(compose(q[0]).subject)}</b></p>
       <p class="tiny">Estimated time: ${fmtDur(n * avg)}. Keep this tab open. You can pause or stop at any time.</p>
       <p class="tiny">Tip: send yourself a test first and check it on your phone.</p>`, "Start sending");
    if (!ok) return;

    S.sending = true; S.paused = false; S.stop = false;
    $("resultsWrap").classList.remove("hidden");
    $("progressWrap").classList.remove("hidden");
    updateSendButtons(); lockEditing(true);
    let done = 0, sent = 0, failed = 0;

    for (const r of q.slice(0, n)) {
      if (S.stop) break;
      while (S.paused && !S.stop) { await sleep(300); }
      if (S.stop) break;
      if (!tokenValid(90000)) {
        S.paused = true; S.waitingAuth = true; updateSendButtons(); renderAccount();
        toast("Your Google session is about to expire. Click “Reconnect to continue sending”.", true);
        while (S.paused && !S.stop) { await sleep(300); }
        if (S.stop) break;
      }
      if (dailyCount() >= settings.dailyLimit) { toast("Daily limit reached. Stopping.", true); break; }

      const m = compose(r);
      let status = "sent", detail = "";
      try {
        const res = await gmailSend(mimeFor(r, m));
        markSent(r.email, { at: new Date().toISOString(), id: res && res.id });
        bumpDaily(); sent++; detail = res && res.id ? "Gmail id " + res.id : "";
      } catch (e) {
        status = "failed"; detail = e.message; failed++;
        if (e.auth) { S.paused = true; S.waitingAuth = true; S.token = null; renderAccount(); updateSendButtons(); toast("Google signed you out. Reconnect to continue.", true); }
        else if (e.rate) { S.paused = true; updateSendButtons(); toast("Gmail says you're sending too fast or hit a limit: " + e.message + ". Paused.", true); }
      }
      S.results.push({ time: new Date().toLocaleString(), email: r.email, name: r.name || "", subject: m.subject, status, detail, row: r.i + 2 });
      done++;
      renderResults();
      $("progressBar").style.width = (100 * done / n).toFixed(1) + "%";
      $("progressText").textContent = `${sent} sent · ${failed} failed · ${n - done} to go`;
      renderContacts(); renderSummary();
      if (status === "failed" && (S.waitingAuth || S.paused)) {
        // retry this one after reconnect / resume
        while (S.paused && !S.stop) { await sleep(300); }
        if (S.stop) break;
        try {
          const res = await gmailSend(mimeFor(r, m));
          markSent(r.email, { at: new Date().toISOString(), id: res && res.id }); bumpDaily(); sent++; failed--;
          const last = S.results[S.results.length - 1]; last.status = "sent"; last.detail = "Sent on retry";
          renderResults();
        } catch (e2) { /* stays failed */ }
      }
      if (done < n && !S.stop) {
        const wait = Number(settings.delayMin) + Math.random() * Math.max(0, Number(settings.delayMax) - Number(settings.delayMin));
        const end = Date.now() + wait * 1000;
        while (Date.now() < end && !S.stop) {
          if (!S.paused) $("progressText").textContent = `${sent} sent · ${failed} failed · ${n - done} to go · next in ${Math.ceil((end - Date.now()) / 1000)}s`;
          await sleep(250);
          if (S.paused) { while (S.paused && !S.stop) await sleep(300); }
        }
      }
    }
    S.sending = false; S.paused = false; S.waitingAuth = false;
    updateSendButtons(); lockEditing(false); renderAccount();
    $("progressText").textContent = `Finished: ${sent} sent · ${failed} failed${S.stop ? " · stopped early" : ""}.`;
    toast(`Done. ${sent} sent${failed ? ", " + failed + " failed" : ""}.`, failed > 0);
    refreshAll();
  }

  function updateSendButtons() {
    $("sendBtn").classList.toggle("hidden", S.sending);
    $("testBtn").disabled = S.sending;
    $("pauseBtn").classList.toggle("hidden", !S.sending);
    $("stopBtn").classList.toggle("hidden", !S.sending);
    $("pauseBtn").textContent = S.paused ? "Resume" : "Pause";
    $("pauseBtn").disabled = S.waitingAuth;
    $("s4status").textContent = S.sending ? (S.paused ? "Paused" : "Sending…") : "";
  }

  function lockEditing(lock) {
    ["fileInput", "sheetSelect", "emailColSelect", "nameColSelect", "templateSelect", "subject", "htmlBody", "textBody", "sendHtml", "campaignName", "selectAllBtn", "selectNoneBtn"]
      .forEach((id) => { $(id).disabled = lock; });
    document.querySelectorAll("#varsList input, #varsList textarea, #contactTable input").forEach((el) => { el.disabled = lock; });
  }

  function renderResults() {
    const t = $("resultsTable");
    t.innerHTML = "<thead><tr><th>Time</th><th>Row</th><th>Email</th><th>Status</th><th>Detail</th></tr></thead><tbody>" +
      S.results.slice().reverse().map((r) => `<tr><td>${esc(r.time)}</td><td>${r.row}</td><td>${esc(r.email)}</td><td><span class="badge ${r.status === "sent" ? "b-ok" : "b-bad"}">${r.status}</span></td><td title="${esc(r.detail)}">${esc(r.detail)}</td></tr>`).join("") +
      "</tbody>";
  }

  function exportResults(kind) {
    if (!S.results.length) { toast("No results yet."); return; }
    const ws = XLSX.utils.json_to_sheet(S.results);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Results");
    const base = "outreach-results-" + today();
    XLSX.writeFile(wb, base + (kind === "csv" ? ".csv" : ".xlsx"), kind === "csv" ? { bookType: "csv" } : {});
  }

  /* =========================================================
     SETTINGS
     ========================================================= */
  function openSettings(focusClientId) {
    $("senderName").value = settings.senderName; $("fromAlias").value = settings.fromAlias;
    $("replyTo").value = settings.replyTo; $("suppression").value = settings.suppression;
    $("clientIdInput").value = settings.clientId; $("originHint").textContent = location.origin;
    $("settingsDialog").showModal();
    if (focusClientId) { $("clientIdInput").closest("details").open = true; $("clientIdInput").focus(); }
  }
  $("settingsDialog").addEventListener("close", () => {
    if ($("settingsDialog").returnValue !== "save") return;
    settings.senderName = $("senderName").value.trim();
    settings.fromAlias = $("fromAlias").value.trim();
    settings.replyTo = $("replyTo").value.trim();
    settings.suppression = $("suppression").value;
    const newCid = $("clientIdInput").value.trim();
    if (newCid !== settings.clientId) { settings.clientId = newCid; S.tokenClient = null; }
    saveSettings(); renderAccount(); refreshAll(); toast("Settings saved");
  });

  /* =========================================================
     WIRING
     ========================================================= */
  let rafPending = false, debounceT;
  function refreshAll() {
    if (rafPending) return; rafPending = true;
    requestAnimationFrame(() => { rafPending = false; S.memo = null; renderTagBar(); renderContacts(); renderPreview(); renderSummary(); });
  }
  function refreshAllDebounced() { clearTimeout(debounceT); debounceT = setTimeout(refreshAll, 250); }

  $("connectBtn").onclick = connect;
  $("disconnectBtn").onclick = disconnect;
  $("settingsBtn").onclick = () => openSettings(false);

  const dz = $("dropZone");
  $("fileInput").onchange = (e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ""; };
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => { if (S.sending) return; const f = e.dataTransfer.files[0]; if (f) readFile(f); });

  $("sheetSelect").onchange = (e) => loadSheet(e.target.value);
  $("emailColSelect").onchange = (e) => { S.emailCol = e.target.value; rebuildRecs(true); };
  $("nameColSelect").onchange = (e) => { S.nameCol = e.target.value; rebuildRecs(false); };
  $("contactSearch").oninput = (e) => { S.filter = e.target.value; renderContacts(); };
  $("selectAllBtn").onclick = () => { const sup = suppressionSet(); S.selected = new Set(S.recs.filter((r) => r.valid && !r.dup && !sup.has(r.email)).map((r) => r.i)); refreshAll(); };
  $("selectNoneBtn").onclick = () => { S.selected = new Set(); refreshAll(); };
  $("contactTable").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-i]"); if (!tr) return;
    const i = Number(tr.dataset.i);
    if (e.target.matches("input[type=checkbox]")) {
      if (S.sending) { e.preventDefault(); return; }
      e.target.checked ? S.selected.add(i) : S.selected.delete(i);
    } else {
      const pos = previewRecs().findIndex((r) => r.i === i);
      if (pos >= 0) S.previewPos = pos; else toast("That row isn't selected, so it won't be sent.");
    }
    refreshAll();
  });

  $("prevBtn").onclick = () => { const n = previewRecs().length; if (n) { S.previewPos = (S.previewPos - 1 + n) % n; refreshAll(); } };
  $("nextBtn").onclick = () => { const n = previewRecs().length; if (n) { S.previewPos = (S.previewPos + 1) % n; refreshAll(); } };

  $("templateSelect").onchange = (e) => {
    const t = allTemplates().find((x) => x.id === e.target.value);
    if (t) applyTemplate(t);
    $("deleteTemplateBtn").disabled = !(t && t.mine);
  };
  $("saveTemplateBtn").onclick = async () => {
    const cur = allTemplates().find((t) => t.id === $("templateSelect").value);
    const suggested = cur && cur.mine ? cur.name : (cur ? "My " + cur.name : "My template");
    const ok = await askConfirm("Save template", `<label class="field"><span>Name</span><input id="tplNameInput" type="text" value="${esc(suggested)}"></label>`, "Save");
    if (!ok) return;
    const name = (document.getElementById("tplNameInput").value || "").trim() || suggested;
    const mine = store.get("templates", []);
    let t = mine.find((x) => x.name === name);
    if (!t) { t = { id: "mine-" + Date.now().toString(36), name }; mine.push(t); }
    Object.assign(t, { subject: $("subject").value, html: $("htmlBody").value, text: $("textBody").value, sendHtml: $("sendHtml").checked, variables: currentVars() });
    store.set("templates", mine); renderTemplateSelect(t.id); saveDraft(); toast("Saved “" + name + "”");
  };
  $("deleteTemplateBtn").onclick = async () => {
    const id = $("templateSelect").value;
    const mine = store.get("templates", []); const t = mine.find((x) => x.id === id);
    if (!t) return;
    if (!(await askConfirm("Delete “" + t.name + "”?", "<p>This removes it from this browser.</p>", "Delete"))) return;
    store.set("templates", mine.filter((x) => x.id !== id));
    renderTemplateSelect(BUILTIN_TEMPLATES[0].id); applyTemplate(BUILTIN_TEMPLATES[0]);
  };
  $("importHtml").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => {
      const m = txt.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      $("htmlBody").value = m ? m[1].trim() : txt; $("sendHtml").checked = true;
      saveDraft(); refreshAll(); toast("Imported " + f.name);
    });
    e.target.value = "";
  };

  ["subject", "htmlBody", "textBody"].forEach((id) => {
    $(id).addEventListener("focus", () => { S.lastFocus = $(id); });
    $(id).addEventListener("input", () => { saveDraft(); refreshAllDebounced(); });
  });
  $("sendHtml").onchange = () => { saveDraft(); refreshAll(); };
  $("campaignName").addEventListener("input", () => { saveDraft(); refreshAllDebounced(); });
  $("tagBar").addEventListener("click", (e) => { const b = e.target.closest("[data-tag]"); if (b) insertTag(b.dataset.tag); });
  $("addVarBtn").onclick = () => { addVarRow("", ""); $("varsList").lastChild.querySelector("input").focus(); };

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tabpanel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab.dataset.tab));
    };
  });

  function bindNum(id, key, min) {
    $(id).value = settings[key];
    $(id).addEventListener("change", () => {
      let v = Math.max(min, Math.round(Number($(id).value) || min));
      settings[key] = v; $(id).value = v;
      if (Number(settings.delayMax) < Number(settings.delayMin)) { settings.delayMax = settings.delayMin; $("delayMax").value = settings.delayMax; }
      saveSettings(); renderSummary();
    });
  }
  bindNum("delayMin", "delayMin", 3); bindNum("delayMax", "delayMax", 3); bindNum("dailyLimit", "dailyLimit", 1);
  ["skipMissing", "skipSent", "listUnsub"].forEach((id) => { $(id).onchange = refreshAll; });

  $("testBtn").onclick = sendTest;
  $("sendBtn").onclick = startSending;
  $("pauseBtn").onclick = () => { S.paused = !S.paused; updateSendButtons(); };
  $("stopBtn").onclick = () => { S.stop = true; S.paused = false; S.waitingAuth = false; updateSendButtons(); };
  $("exportXlsx").onclick = () => exportResults("xlsx");
  $("exportCsv").onclick = () => exportResults("csv");
  $("clearLogBtn").onclick = async () => {
    $("settingsDialog").close();
    if (await askConfirm("Clear the sent log?", "<p>Everyone you've emailed could be emailed again in the same campaign. This can't be undone.</p>", "Clear log")) {
      store.del("sent"); refreshAll(); toast("Sent log cleared");
    }
  };
  $("clearAllBtn").onclick = async () => {
    $("settingsDialog").close();
    if (await askConfirm("Erase everything?", "<p>Removes settings, saved templates, the sent log and the do-not-email list from this browser.</p>", "Erase")) {
      Object.keys(localStorage).filter((k) => k.startsWith("aco.")).forEach((k) => localStorage.removeItem(k));
      location.reload();
    }
  };

  window.addEventListener("beforeunload", (e) => { if (S.sending) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------------- init ---------------- */
  renderTemplateSelect(draft && draft.templateId);
  if (draft) {
    $("campaignName").value = draft.campaign || "";
    applyTemplate(draft);
    renderTemplateSelect(draft.templateId);
  } else {
    applyTemplate(BUILTIN_TEMPLATES[0]);
  }
  renderAccount();
  refreshAll();
})();
