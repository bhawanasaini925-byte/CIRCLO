/* CIRCLO admin — sign-in page and admin app. Every action is authorised on the server;
   this file only renders what the server returns. The session token lives in sessionStorage (this tab only). */
(() => {
  "use strict";
  const C = window.CIRCLO_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const KEY = "circlo_admin", IDLE_MS = 120 * 60 * 1000;
  const session = { get: () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } }, set: (v) => sessionStorage.setItem(KEY, JSON.stringify(v)), clear: () => sessionStorage.removeItem(KEY) };

  function toast(text, err) {
    const el = $("#toast"); el.className = "toast" + (err ? " err" : ""); el.textContent = text;
    requestAnimationFrame(() => el.classList.add("show")); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 4000);
  }
  // Read-only admin actions are retried once on a non-JSON reply or network blip (Apps Script cold starts).
  const READS = ["adminSession", "adminDashboard", "adminList", "adminImage", "adminHistory"];
  async function api(action, data = {}, withToken = true) {
    try { return await call(action, data, withToken); }
    catch (e) { if (!READS.includes(action) || e.server) throw e; await new Promise((r) => setTimeout(r, 1500)); return call(action, data, withToken); }
  }
  async function call(action, data = {}, withToken = true) {
    if (!C.API_URL) throw new Error("The admin area needs the live backend. Set API_URL in config.js first.");
    const body = { action, ...data }; if (withToken) body.token = session.get()?.token;
    let res;
    try { res = await fetch(C.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow" }); }
    catch (e) { throw new Error("Couldn't reach the server. Check your connection."); }
    let j; try { j = await res.json(); } catch (e) { throw new Error(READS.includes(action) ? "Unexpected server response." : "Couldn't confirm the change was saved. Refresh to check, then try again."); }
    if (!j.ok) {
      if (j.code === "AUTH" && withToken) { session.clear(); location.replace("login.html?expired=1"); }
      const err = new Error(j.error || "Request failed"); err.code = j.code; err.server = true; throw err;
    }
    // Under load Google can turn the POST into a GET while redirecting; the reply is then the health check, not our answer.
    if (j.data && j.data.service === "CIRCLO API") throw new Error(READS.includes(action) ? "The server is busy. Please try again." : "Couldn't confirm the change was saved. Refresh to check, then try again.");
    return j.data;
  }

  /* ===================== LOGIN PAGE ===================== */
  if (document.body.classList.contains("login-page")) {
    const f = $("#loginForm"), msg = $("#loginMsg"), btn = f.querySelector("[type=submit]");
    const say = (t, type) => { msg.className = "alert " + type; msg.textContent = t; };
    if (!C.API_URL) { say("The admin area works only with the live backend. Deploy Apps Script and set API_URL in config.js (see docs/SETUP.md).", "info"); btn.disabled = true; }
    else if (/expired=1/.test(location.search)) say("Your session ended. Please sign in again.", "info");
    else if (/out=1/.test(location.search)) say("You have been signed out.", "ok");
    if (session.get()?.token) location.replace("index.html");
    $("#showPw").onclick = (e) => { const p = $("#pw"), s = p.type === "password"; p.type = s ? "text" : "password"; e.target.textContent = s ? "Hide" : "Show"; e.target.setAttribute("aria-label", s ? "Hide password" : "Show password"); };
    f.onsubmit = async (e) => {
      e.preventDefault(); if (btn.disabled) return;
      if (!f.email.value.trim() || !f.password.value) { say("Enter your email and password.", "err"); return; }
      btn.disabled = true; btn.textContent = "Signing in…";
      try {
        const r = await api("adminLogin", { email: f.email.value.trim(), password: f.password.value }, false);
        session.set({ token: r.token, email: r.email, role: r.role, last: Date.now() });
        location.replace("index.html");
      } catch (err) { say(err.message, "err"); f.password.value = ""; f.password.focus(); }
      finally { btn.disabled = false; btn.textContent = "Sign in"; }
    };
    return;
  }

  /* ===================== ADMIN APP ===================== */
  const me = session.get();
  if (!me?.token || Date.now() - (me.last || 0) > IDLE_MS) { session.clear(); location.replace("login.html" + (me ? "?expired=1" : "")); return; }
  const touch = () => { const s = session.get(); if (s) { s.last = Date.now(); session.set(s); } };
  ["click", "keydown"].forEach((t) => addEventListener(t, touch, { passive: true }));
  setInterval(() => { const s = session.get(); if (!s || Date.now() - s.last > IDLE_MS) { session.clear(); location.replace("login.html?expired=1"); } }, 60000);

  const OWNER = me.role === "owner";
  const TONE = { Pending: "warn", "Changes Requested": "info", Approved: "ok", Rejected: "err", Available: "ok", Reserved: "gold", Sold: "mute", Hidden: "mute",
    New: "warn", Contacted: "info", Converted: "ok", Closed: "mute", "Pending Review": "warn", Confirmed: "info", "In Fulfilment": "gold", Completed: "ok", Cancelled: "mute",
    Scheduled: "info", Rescheduled: "warn", Collected: "gold", Verified: "ok", "Verification Failed": "err", Failed: "err", "Out for Delivery": "gold", Delivered: "ok", "Returned to Seller": "err", Recorded: "ok" };
  const badge = (s) => `<span class="badge ${TONE[s] || "mute"}">${esc(s || "—")}</span>`;
  const day = (v) => { if (!v) return "—"; const d = new Date(v); return isNaN(d) ? esc(v) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  const when = (v) => { const d = new Date(v); return isNaN(d) ? esc(v || "") : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const contactLink = (c) => { c = String(c || ""); return /@/.test(c) ? `<a class="link" href="mailto:${esc(c)}">${esc(c)}</a>` : `<a class="link" href="tel:${esc(c.replace(/\s/g, ""))}">${esc(c)}</a>`; };
  const view = $("#view"), drawer = $("#drawer"), dScrim = $("#drawerScrim");
  let cache = {}, meta = {}, staff = [], current = "dashboard", reopen = null;

  document.body.hidden = false;
  $("#who").textContent = `${me.email} · ${me.role}`;
  $("#logout").onclick = async () => { try { await api("adminLogout"); } catch (e) {} session.clear(); location.replace("login.html?out=1"); };
  const sideToggle = (o) => { $("#side").classList.toggle("open", o); $("#sideScrim").classList.toggle("open", o); $("#sideBtn").setAttribute("aria-expanded", o); };
  $("#sideBtn").onclick = () => sideToggle(true); $("#sideScrim").onclick = () => sideToggle(false);
  $("#refresh").onclick = () => { cache = {}; route(); };

  async function list(entity, force) {
    if (!force && cache[entity]) return cache[entity];
    const r = await api("adminList", { entity, withMeta: !meta.pickupSlots });
    if (r.meta) meta = r.meta;
    return (cache[entity] = r.rows);
  }
  const staffName = (id) => staff.find((s) => s.StaffID === id)?.Name || id || "—";
  async function loadStaff() { staff = await list("staff"); }

  /* ---------- Drawer ---------- */
  let lastFocus;
  function openDrawer(title, html, after) {
    lastFocus = document.activeElement;
    $("#drawerTitle").textContent = title; $("#drawerBody").innerHTML = html;
    drawer.hidden = false; requestAnimationFrame(() => { drawer.classList.add("open"); dScrim.classList.add("open"); });
    $("#drawerClose").focus(); after && after($("#drawerBody"));
  }
  function closeDrawer() { reopen = null; drawer.classList.remove("open"); dScrim.classList.remove("open"); setTimeout(() => (drawer.hidden = true), 400); lastFocus?.focus?.(); }
  $("#drawerClose").onclick = closeDrawer; dScrim.onclick = closeDrawer;
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });

  /** Runs an admin action, then refreshes data and re-opens the same record so the new state is visible. */
  async function act(btn, action, data, ok) {
    const form = btn.closest("form"); if (form && !form.reportValidity()) return;
    btn.disabled = true; const label = btn.textContent; btn.textContent = "Saving…";
    try { await api(action, data); toast(ok); cache = {}; await route(true); reopen && reopen(); }
    catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  const val = (root, name) => root.querySelector(`[name="${name}"]`)?.value?.trim() ?? "";
  const slotOpts = (slots) => slots.map((s) => `<option>${esc(s)}</option>`).join("");
  const staffOpts = () => staff.filter((s) => s.Active === "Yes").map((s) => `<option value="${esc(s.StaffID)}">${esc(s.Name)} · ${esc(s.Role)}</option>`).join("");
  const schedFields = (slots, addr, addrLabel) => `<div class="grid3"><label>Date<input type="date" name="date" min="${today()}" required></label><label>Time slot<select name="slot" required>${slotOpts(slots || [])}</select></label><label>Team member<select name="staffId" required><option value="">Choose…</option>${staffOpts()}</select></label></div>${addrLabel ? `<label>${addrLabel}<textarea name="address" rows="2" required minlength="5" maxlength="300">${esc(addr || "")}</textarea></label>` : ""}${!staff.some((s) => s.Active === "Yes") ? '<p class="alert info">Add an active team member in Settings first.</p>' : ""}`;

  /* ---------- Table + tabs helper ---------- */
  function tableView({ rows, tabs, tabKey, cols, onOpen, search, extra = "" }) {
    let tab = tabs[0][0], q = "", ex = {};
    const draw = () => {
      const s = q.toLowerCase();
      let r = rows.filter((x) => (tab === "all" || (typeof tabKey === "function" ? tabKey(x, tab) : x[tabKey] === tab)) && (!s || search(x).toLowerCase().includes(s)));
      if (ex.filter) r = r.filter(ex.filter);
      $("#tabs").innerHTML = tabs.map(([k, t]) => { const n = k === "all" ? rows.length : rows.filter((x) => (typeof tabKey === "function" ? tabKey(x, k) : x[tabKey] === k)).length; return `<button class="tab" data-tab="${esc(k)}" aria-pressed="${k === tab}">${esc(t)}<b>${n}</b></button>`; }).join("");
      $("#tbody").innerHTML = r.length ? r.map((x, i) => `<tr tabindex="0" data-i="${rows.indexOf(x)}" style="animation-delay:${Math.min(i, 12) * 25}ms">${cols.map((c) => `<td class="${c[2] || ""}">${c[1](x)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}" class="empty">Nothing here.</td></tr>`;
    };
    view.innerHTML = `<div class="tabs" id="tabs"></div><div class="bar"><input type="search" id="q" placeholder="Search…" aria-label="Search">${extra}</div>
      <div class="table-wrap"><table class="t"><thead><tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}</tr></thead><tbody id="tbody"></tbody></table></div>`;
    $("#tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; draw(); } };
    $("#q").oninput = (e) => { q = e.target.value; draw(); };
    const open = (e) => { const tr = e.target.closest("tr[data-i]"); if (tr && (e.type === "click" || e.key === "Enter")) onOpen(rows[+tr.dataset.i]); };
    $("#tbody").onclick = open; $("#tbody").onkeydown = open;
    draw();
    return { setFilter: (f) => { ex.filter = f; draw(); } };
  }

  /* ===================== VIEWS ===================== */
  const VIEWS = {
    async dashboard() {
      const d = await api("adminDashboard"), m = d.metrics; await loadStaff();
      $("#nPending").textContent = m.pendingReview || ""; $("#nEnq").textContent = m.newEnquiries || "";
      const k = (n, label, href, warn) => `<a class="kpi${warn && n ? " alert-k" : ""}" href="${href}"><b data-count="${n}">0</b><span>${label}</span></a>`;
      view.innerHTML = `<div class="kpis">${k(m.pendingReview, "Awaiting review", "#products")}${k(m.newEnquiries, "New enquiries", "#enquiries")}${k(m.openOrders, "Open orders", "#orders")}${k(m.live, "Live in the shop", "#products")}
        ${k(m.pickupsToday, "Pickups today", "#pickups")}${k(m.deliveriesToday, "Deliveries today", "#deliveries")}${k(m.sold, "Sold", "#products")}${k(m.failedOps, "Failed pickups / deliveries", "#pickups", true)}</div>
        <div class="panels"><section class="panel"><h2>Upcoming pickups &amp; deliveries</h2>${d.upcoming.length ? `<ul class="feed">${d.upcoming.map((u) => `<li><span class="badge ${u.type === "Pickup" ? "info" : "gold"}">${u.type}</span><span><b>${esc(u.date)}</b> · ${esc(u.slot)} · ${esc(staffName(u.staff))}</span><time>${badge(u.status)}</time></li>`).join("")}</ul>` : '<p class="muted">Nothing scheduled.</p>'}</section>
        <section class="panel"><h2>Recent activity</h2>${d.recent.length ? `<ul class="feed">${d.recent.map((a) => `<li><span>${esc(a.Action)} <span class="muted">${esc(a.EntityID)}</span></span><time>${when(a.Timestamp)}</time></li>`).join("")}</ul>` : '<p class="muted">No activity yet.</p>'}</section></div>`;
      $$("[data-count]").forEach((el, i) => countUp(el, +el.dataset.count, i));
    },

    async products() {
      const rows = (await list("products")).slice().reverse();
      tableView({
        rows, tabKey: (x, k) => (k === "Live" ? x.ApprovalStatus === "Approved" && ["Available", "Reserved"].includes(x.AvailabilityStatus) : ["Sold", "Hidden"].includes(k) ? x.AvailabilityStatus === k && x.ApprovalStatus === "Approved" : x.ApprovalStatus === k),
        tabs: [["Pending", "Pending review"], ["Changes Requested", "Changes requested"], ["Live", "Live"], ["Sold", "Sold"], ["Hidden", "Hidden"], ["Rejected", "Rejected"], ["all", "All"]],
        search: (x) => [x.ProductID, x.Title, x.Category, x.SellerName].join(" "),
        cols: [["Piece", (x) => `<div class="strong">${esc(x.Title)}</div><div class="mono">${esc(x.ProductID)}</div>`], ["Category", (x) => esc(x.Category), "hide-sm"], ["Price", (x) => inr(x.Price)], ["Review", (x) => badge(x.ApprovalStatus)], ["Availability", (x) => badge(x.AvailabilityStatus), "hide-sm"], ["Submitted", (x) => day(x.CreatedAt), "hide-sm"]],
        onOpen: openProduct
      });
    },

    async orders() {
      await loadStaff(); const rows = (await list("orders")).slice().reverse(); await list("pickups"); await list("deliveries");
      tableView({ rows, tabKey: "Status", tabs: [["Pending Review", "Pending review"], ["Confirmed", "Confirmed"], ["In Fulfilment", "In fulfilment"], ["Completed", "Completed"], ["Cancelled", "Cancelled"], ["all", "All"]],
        search: (x) => [x.OrderID, x.ProductTitle, x.BuyerName, x.ProductID].join(" "),
        cols: [["Order", (x) => `<div class="strong">${esc(x.ProductTitle)}</div><div class="mono">${esc(x.OrderID)}</div>`], ["Buyer", (x) => esc(x.BuyerName), "hide-sm"], ["Price", (x) => inr(x.Price)], ["Status", (x) => badge(x.Status)], ["Created", (x) => day(x.CreatedAt), "hide-sm"]],
        onOpen: openOrder });
    },

    async pickups() { await opsView("pickups"); },
    async deliveries() { await opsView("deliveries"); },

    async enquiries() {
      const rows = (await list("enquiries")).slice().reverse();
      tableView({ rows, tabKey: "Status", tabs: [["New", "New"], ["Contacted", "Contacted"], ["Converted", "Converted"], ["Closed", "Closed"], ["all", "All"]],
        search: (x) => [x.EnquiryID, x.BuyerName, x.ProductTitleSnapshot, x.Message].join(" "),
        cols: [["From", (x) => `<div class="strong">${esc(x.BuyerName)}</div><div class="mono">${esc(x.EnquiryID)}</div>`], ["About", (x) => `${x.Type === "Contact" ? '<span class="badge mute">Message</span> ' : ""}${esc(x.ProductTitleSnapshot)}`], ["Status", (x) => badge(x.Status)], ["Received", (x) => when(x.CreatedAt), "hide-sm"]],
        onOpen: openEnquiry });
    },

    async audit() {
      const rows = await list("audit");
      tableView({ rows, tabKey: (x, k) => (k === "logins" ? /LOGIN|LOGOUT/.test(x.Action) : !/LOGIN|LOGOUT/.test(x.Action)), tabs: [["changes", "Changes"], ["logins", "Sign-ins"], ["all", "All"]],
        search: (x) => [x.Actor, x.EntityID, x.Action, x.Notes].join(" "),
        cols: [["When", (x) => when(x.Timestamp)], ["Who", (x) => esc(x.Actor), "hide-sm"], ["Record", (x) => `<span class="mono">${esc(x.EntityID)}</span>`], ["Action", (x) => esc(x.Action)], ["Notes", (x) => esc(x.Notes), "hide-sm"]],
        onOpen: (x) => openDrawer("Activity detail", `<dl class="kv"><dt>When</dt><dd>${when(x.Timestamp)}</dd><dt>Who</dt><dd>${esc(x.Actor)}</dd><dt>Record</dt><dd>${esc(x.EntityID)}</dd><dt>Action</dt><dd>${esc(x.Action)}</dd><dt>Before</dt><dd>${esc(x.OldValue)}</dd><dt>After</dt><dd>${esc(x.NewValue)}</dd><dt>Notes</dt><dd>${esc(x.Notes)}</dd></dl>`) });
    },

    async settings() {
      const rows = await list("settings", true); await loadStaff();
      const get = (k) => rows.find((r) => r.Key === k)?.Value ?? "";
      const f = (k, label, area, hint) => `<label>${label}${area ? `<textarea name="${k}" rows="2">${esc(get(k))}</textarea>` : `<input name="${k}" value="${esc(get(k))}">`}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
      view.innerHTML = `<div class="panels">
        <section class="panel"><h2>Business settings</h2>${OWNER ? "" : '<p class="alert info">Only an owner can change settings.</p>'}
          <form class="form-inline" id="setForm"><fieldset ${OWNER ? "" : "disabled"} style="border:0;padding:0;display:grid;gap:.75rem">
          ${f("Categories", "Categories", 1, "Comma-separated. Shown in the shop and seller form.")}${f("Conditions", "Conditions", 1, "Comma-separated.")}
          ${f("ContactEmail", "Public email")}${f("ContactPhone", "Public phone")}${f("ServiceArea", "Service area")}
          ${f("PickupSlots", "Pickup time slots", 0, "Comma-separated, e.g. 10:00-12:00")}${f("DeliverySlots", "Delivery time slots")}${f("MaxSubmissionsPerHour", "Max submissions per hour per seller")}
          <button class="btn" type="button" id="saveSet">Save settings</button></fieldset></form></section>
        <section class="panel"><h2>Team members</h2>
          <table class="t"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${staff.map((s) => `<tr><td><b>${esc(s.Name)}</b><div class="mono">${esc(s.Phone)}</div></td><td>${esc(s.Role)}</td><td>${badge(s.Active === "Yes" ? "Available" : "Hidden").replace(/Available|Hidden/, s.Active === "Yes" ? "Active" : "Inactive")}</td><td>${OWNER ? `<button class="btn btn-sm btn-ghost" data-toggle="${esc(s.StaffID)}">${s.Active === "Yes" ? "Deactivate" : "Activate"}</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No team members yet.</td></tr>'}</tbody></table>
          ${OWNER ? `<form class="form-inline" id="staffForm" style="margin-top:1rem"><h3 style="font-size:1.2rem">Add team member</h3><div class="grid3"><label>Name<input name="name" required minlength="2" maxlength="80"></label><label>Phone<input name="phone" maxlength="20"></label><label>Role<select name="role"><option>Pickup &amp; Delivery</option><option>Pickup</option><option>Delivery</option><option>Quality Check</option></select></label></div><button class="btn btn-sm" type="button" id="addStaff">Add</button></form>` : ""}
          <div class="box" style="margin-top:1.5rem"><h3>Security</h3><p class="small muted">Admin accounts are managed in Apps Script → Project Settings → Script Properties (see docs/SETUP.md). Passwords are never stored or shown here.</p>${OWNER ? '<button class="btn btn-sm btn-danger" id="logoutAll">Sign out all sessions</button>' : ""}</div>
        </section></div>`;
      if (!OWNER) return;
      $("#saveSet").onclick = (e) => { const s = {}; $$("#setForm [name]").forEach((i) => (s[i.name] = i.value.trim())); act(e.target, "adminSaveSettings", { settings: s }, "Settings saved"); };
      $("#addStaff").onclick = (e) => { const fm = $("#staffForm"); act(e.target, "adminStaff", { op: "add", name: val(fm, "name"), phone: val(fm, "phone"), role: val(fm, "role") }, "Team member added"); };
      view.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = () => act(b, "adminStaff", { op: "toggle", staffId: b.dataset.toggle }, "Updated")));
      $("#logoutAll").onclick = async () => { if (!confirm("Sign out every admin session, including this one?")) return; try { await api("adminLogoutAll"); } catch (e) {} session.clear(); location.replace("login.html?out=1"); };
    }
  };

  /* ---------- Products ---------- */
  function openProduct(p) {
    reopen = () => { const n = cache.products?.find((x) => x.ProductID === p.ProductID); n && openProduct(n); };
    const ids = (() => { try { return JSON.parse(p.ImageFileIDs || "[]"); } catch (e) { return []; } })();
    const cats = (meta.categories || []).map((c) => `<option ${c === p.Category ? "selected" : ""}>${esc(c)}</option>`).join("");
    const conds = (meta.conditions || []).map((c) => `<option ${c === p.Condition ? "selected" : ""}>${esc(c)}</option>`).join("");
    openDrawer(p.Title, `
      <div class="actions">${badge(p.ApprovalStatus)}${badge(p.AvailabilityStatus)}<span class="mono small">${esc(p.ProductID)}</span>${p.ApprovalStatus === "Approved" && ["Available", "Reserved"].includes(p.AvailabilityStatus) ? `<a class="link small" target="_blank" rel="noopener" href="../product.html?id=${encodeURIComponent(p.ProductID)}">View live ↗</a>` : ""}</div>
      <div class="imgs" id="imgs">${ids.map((id) => `<a data-fid="${esc(id)}" target="_blank" rel="noopener">Loading…</a>`).join("") || '<p class="muted small">No photos.</p>'}</div>
      <div class="box"><h3>Review</h3>${p.ReviewNotes ? `<p class="small muted">Last note: ${esc(p.ReviewNotes)}</p>` : ""}
        <label class="small">Notes for the seller / record<textarea name="notes" rows="2" maxlength="500" id="revNotes" placeholder="Required when rejecting or requesting changes"></textarea></label>
        <div class="actions"><button class="btn btn-sm" data-dec="Approved">Approve</button><button class="btn btn-sm btn-ghost" data-dec="Changes Requested">Request changes</button><button class="btn btn-sm btn-danger" data-dec="Rejected">Reject</button></div>
        <p class="hint">Approving publishes the piece and makes its photos viewable by link. Rejecting or requesting changes keeps everything private. The seller is not notified automatically. Contact them using the details below.</p></div>
      <div class="box"><h3>Seller (private)</h3><dl class="kv"><dt>Name</dt><dd>${esc(p.SellerName)}</dd><dt>Contact</dt><dd>${contactLink(p.SellerContact)}</dd><dt>Submitted</dt><dd>${when(p.CreatedAt)}</dd><dt>Reviewed</dt><dd>${p.ReviewedAt ? when(p.ReviewedAt) + " by " + esc(p.ReviewedBy) : "—"}</dd></dl></div>
      <form class="box form-inline" id="editForm"><h3>Listing details</h3>
        <label>Title<input name="title" value="${esc(p.Title)}" required minlength="3" maxlength="100"></label>
        <div class="grid3"><label>Price (₹)<input name="price" type="number" min="1" value="${esc(p.Price)}" required></label><label>Category<select name="category">${cats}</select></label><label>Condition<select name="condition">${conds}</select></label></div>
        <div class="grid3"><label>Brand<input name="brand" value="${esc(p.Brand)}" maxlength="60"></label><label>Availability<select name="availability">${["Available", "Reserved", "Sold", "Hidden"].map((a) => `<option ${a === p.AvailabilityStatus ? "selected" : ""}>${a}</option>`).join("")}</select></label></div>
        <label>Description<textarea name="description" rows="4" required minlength="20" maxlength="1500">${esc(p.Description)}</textarea></label>
        <button class="btn btn-sm" type="button" id="saveProd">Save changes</button><p class="hint">While an order is active, availability is controlled by the order.</p></form>
      <div class="box"><h3>History</h3><ul class="history" id="hist"><li class="muted">Loading…</li></ul></div>`, (root) => {
      root.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => act(b, "adminReviewProduct", { productId: p.ProductID, decision: b.dataset.dec, notes: $("#revNotes").value.trim() }, `Marked ${b.dataset.dec.toLowerCase()}`)));
      $("#saveProd").onclick = (e) => { const fm = $("#editForm"), fields = {}; ["title", "price", "category", "condition", "brand", "availability", "description"].forEach((k) => { const v = val(fm, k); const orig = { title: p.Title, price: String(p.Price), category: p.Category, condition: p.Condition, brand: p.Brand || "", availability: p.AvailabilityStatus, description: p.Description }[k]; if (v !== String(orig ?? "")) fields[k] = v; }); if (!Object.keys(fields).length) return toast("No changes to save"); act(e.target, "adminUpdateProduct", { productId: p.ProductID, fields }, "Listing updated"); };
      ids.forEach(async (id) => {
        const a = root.querySelector(`[data-fid="${CSS.escape(id)}"]`);
        try { const im = await api("adminImage", { fileId: id }); const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(im.data), (c) => c.charCodeAt(0))], { type: im.type })); a.innerHTML = `<img src="${url}" alt="Submitted photo">`; a.href = url; }
        catch (e) { a.textContent = "Unavailable"; }
      });
      api("adminHistory", { productId: p.ProductID }).then((h) => { $("#hist").innerHTML = h.audit.slice().reverse().map((x) => `<li><b>${esc(x.Action)}</b> <span class="muted">${esc(x.EntityID !== p.ProductID ? x.EntityID : "")}</span>${x.Notes ? ` · ${esc(x.Notes)}` : ""}<time>${when(x.Timestamp)} · ${esc(x.Actor)}</time></li>`).join("") || '<li class="muted">No history.</li>'; }).catch(() => ($("#hist").innerHTML = '<li class="muted">Could not load history.</li>'));
    });
  }

  /* ---------- Orders ---------- */
  const ORDER_FLOW = ["Pending Review", "Confirmed", "In Fulfilment", "Completed"];
  const flow = (steps, cur, bad) => `<div class="flow">${steps.map((s) => `<span class="${s === cur ? (bad ? "bad" : "on") : ""}">${esc(s)}</span>`).join("")}${bad ? `<span class="bad">${esc(cur)}</span>` : ""}</div>`;
  function openOrder(o) {
    reopen = () => { const n = cache.orders?.find((x) => x.OrderID === o.OrderID); n && openOrder(n); };
    const pk = (cache.pickups || []).filter((x) => x.OrderID === o.OrderID), dl = (cache.deliveries || []).filter((x) => x.OrderID === o.OrderID);
    const activePk = pk.find((x) => !["Cancelled", "Verification Failed"].includes(x.Status)), verified = pk.some((x) => x.Status === "Verified");
    const activeDl = dl.find((x) => !["Cancelled", "Returned to Seller"].includes(x.Status));
    const open = ["Pending Review", "Confirmed", "In Fulfilment"].includes(o.Status);
    openDrawer("Order " + o.OrderID, `
      ${flow(ORDER_FLOW, o.Status, o.Status === "Cancelled")}
      <div class="box"><dl class="kv"><dt>Piece</dt><dd>${esc(o.ProductTitle)} <span class="mono">${esc(o.ProductID)}</span></dd><dt>Price</dt><dd>${inr(o.Price)}</dd><dt>Buyer</dt><dd>${esc(o.BuyerName)}</dd><dt>Contact</dt><dd>${contactLink(o.BuyerContact)}</dd><dt>Delivery address</dt><dd>${esc(o.DeliveryAddress) || "—"}</dd><dt>From enquiry</dt><dd class="mono">${esc(o.EnquiryID)}</dd>${o.CancelReason ? `<dt>Cancelled because</dt><dd>${esc(o.CancelReason)}</dd>` : ""}<dt>Notes</dt><dd>${esc(o.Notes) || "—"}</dd></dl></div>
      ${o.Status === "Pending Review" ? `<div class="box"><h3>Confirm the order</h3><p class="small muted">Confirm after agreeing price and timing with both buyer and seller. The piece will show as Reserved in the shop.</p><div class="actions"><button class="btn btn-sm" id="confirmO">Confirm order</button></div></div>` : ""}
      ${["Confirmed", "In Fulfilment"].includes(o.Status) && !activePk ? `<form class="box form-inline" id="pkForm"><h3>Schedule pickup from seller</h3>${schedFields(meta.pickupSlots, "", "Pickup address")}<label>Notes<input name="notes" maxlength="500"></label><button class="btn btn-sm" type="button" id="schedPk">Schedule pickup</button></form>` : ""}
      ${o.Status === "In Fulfilment" && verified && !activeDl ? `<form class="box form-inline" id="dlForm"><h3>Schedule delivery to buyer</h3>${schedFields(meta.deliverySlots, o.DeliveryAddress, "Delivery address")}<label>Notes<input name="notes" maxlength="500"></label><button class="btn btn-sm" type="button" id="schedDl">Schedule delivery</button></form>` : ""}
      ${pk.length || dl.length ? `<div class="box"><h3>Pickups &amp; deliveries</h3><ul class="feed">${pk.map((x) => `<li><span class="badge info">Pickup</span><span>${esc(x.Date)} · ${esc(x.Slot)}</span><time>${badge(x.Status)}</time></li>`).join("")}${dl.map((x) => `<li><span class="badge gold">Delivery</span><span>${esc(x.Date)} · ${esc(x.Slot)}</span><time>${badge(x.Status)}</time></li>`).join("")}</ul><a class="arrow-link small" href="#pickups">Manage in Pickups / Deliveries</a></div>` : ""}
      <form class="box form-inline" id="noteForm"><h3>Edit notes &amp; address</h3><label>Delivery address<textarea name="address" rows="2" maxlength="300">${esc(o.DeliveryAddress)}</textarea></label><label>Notes<textarea name="notes" rows="2" maxlength="500">${esc(o.Notes)}</textarea></label><button class="btn btn-sm btn-ghost" type="button" id="saveNote">Save</button></form>
      ${open ? `<form class="box form-inline" id="cancelForm"><h3>Cancel order</h3><label>Reason<input name="reason" required minlength="3" maxlength="300"></label><button class="btn btn-sm btn-danger" type="button" id="cancelO">Cancel order</button><p class="hint">Cancels any scheduled pickup or delivery and returns a reserved piece to the shop.</p></form>` : ""}`, () => {
      const on = (id, fn) => { const el = $("#" + id); el && (el.onclick = fn); };
      on("confirmO", (e) => act(e.target, "adminOrderAction", { orderId: o.OrderID, op: "confirm" }, "Order confirmed"));
      on("schedPk", (e) => { const f = $("#pkForm"); act(e.target, "adminSchedulePickup", { orderId: o.OrderID, date: val(f, "date"), slot: val(f, "slot"), staffId: val(f, "staffId"), address: val(f, "address"), notes: val(f, "notes") }, "Pickup scheduled"); });
      on("schedDl", (e) => { const f = $("#dlForm"); act(e.target, "adminScheduleDelivery", { orderId: o.OrderID, date: val(f, "date"), slot: val(f, "slot"), staffId: val(f, "staffId"), address: val(f, "address"), notes: val(f, "notes") }, "Delivery scheduled"); });
      on("saveNote", (e) => { const f = $("#noteForm"); act(e.target, "adminOrderAction", { orderId: o.OrderID, op: "note", notes: val(f, "notes"), address: val(f, "address") }, "Saved"); });
      on("cancelO", (e) => { const f = $("#cancelForm"); if (!confirm("Cancel this order?")) return; act(e.target, "adminOrderAction", { orderId: o.OrderID, op: "cancel", reason: val(f, "reason") }, "Order cancelled"); });
    });
  }

  /* ---------- Pickups & deliveries ---------- */
  const OPS = {
    pickups: { id: "PickupID", action: "adminPickupAction", key: "pickupId", addr: "PickupAddress", flow: ["Scheduled", "Collected", "Verified"], bad: ["Failed", "Verification Failed", "Cancelled"],
      tabs: [["open", "Upcoming"], ["Collected", "Awaiting check"], ["Verified", "Verified"], ["Failed", "Failed"], ["closed", "Cancelled / failed check"], ["all", "All"]],
      ops: { Scheduled: ["collected", "failed", "reschedule", "cancel"], Rescheduled: ["collected", "failed", "reschedule", "cancel"], Failed: ["reschedule", "cancel"], Collected: ["verified", "verification_failed"] } },
    deliveries: { id: "DeliveryID", action: "adminDeliveryAction", key: "deliveryId", addr: "DeliveryAddress", flow: ["Scheduled", "Out for Delivery", "Delivered"], bad: ["Failed", "Returned to Seller", "Cancelled"],
      tabs: [["open", "Upcoming"], ["Out for Delivery", "Out for delivery"], ["handover", "Awaiting handover"], ["Delivered", "Delivered"], ["Failed", "Failed"], ["closed", "Cancelled / returned"], ["all", "All"]],
      ops: { Scheduled: ["out", "failed", "reschedule", "cancel"], Rescheduled: ["out", "failed", "reschedule", "cancel"], "Out for Delivery": ["delivered", "failed"], Failed: ["reschedule", "returned", "cancel"], Delivered: ["handover"] } }
  };
  const OP_LABEL = { collected: "Mark collected", verified: "Item matches listing", verification_failed: "Item doesn't match", failed: "Mark failed", reschedule: "Reschedule", cancel: "Cancel", out: "Out for delivery", delivered: "Mark delivered", returned: "Return to seller", handover: "Record handover" };
  async function opsView(kind) {
    await loadStaff(); await list("orders"); const cfg = OPS[kind], rows = (await list(kind)).slice().sort((a, b) => String(a.Date + a.Slot).localeCompare(String(b.Date + b.Slot)));
    const tabKey = (x, k) => k === "open" ? ["Scheduled", "Rescheduled"].includes(x.Status) : k === "closed" ? ["Cancelled", "Verification Failed", "Returned to Seller"].includes(x.Status) : k === "handover" ? x.Status === "Delivered" && x.HandoverStatus !== "Recorded" : x.Status === k;
    const t = tableView({ rows, tabs: cfg.tabs, tabKey, search: (x) => [x[cfg.id], x.OrderID, x.ProductID, staffName(x.StaffID), x[cfg.addr]].join(" "),
      extra: `<input type="date" id="fDate" aria-label="Filter by date" style="max-width:180px"><select id="fStaff" aria-label="Filter by team member"><option value="">All team members</option>${staff.map((s) => `<option value="${esc(s.StaffID)}">${esc(s.Name)}</option>`).join("")}</select>`,
      cols: [["Date", (x) => `<b>${esc(x.Date)}</b><div class="small muted">${esc(x.Slot)}</div>`], ["Record", (x) => `<span class="mono">${esc(x[cfg.id])}</span><div class="mono">${esc(x.OrderID)}</div>`, "hide-sm"], ["Team member", (x) => esc(staffName(x.StaffID))], ["Status", (x) => badge(x.Status) + (kind === "deliveries" && x.HandoverStatus === "Recorded" ? " " + badge("Recorded") : "")], ["Attempts", (x) => esc(x.Attempts || 0), "hide-sm"]],
      onOpen: (r) => openOp(kind, r) });
    const refilter = () => { const d = $("#fDate").value, s = $("#fStaff").value; t.setFilter((x) => (!d || x.Date === d) && (!s || x.StaffID === s)); };
    $("#fDate").onchange = refilter; $("#fStaff").onchange = refilter;
  }
  function openOp(kind, r) {
    const cfg = OPS[kind];
    reopen = () => { const n = cache[kind]?.find((x) => x[cfg.id] === r[cfg.id]); n && openOp(kind, n); };
    const ops = (cfg.ops[r.Status] || []).filter((op) => !(op === "handover" && r.HandoverStatus === "Recorded"));
    const need = { failed: "reason", cancel: "reasonOpt", returned: "reason", verification_failed: "notes", verified: "notesOpt", reschedule: "sched", handover: "receiver" };
    const order = (cache.orders || []).find((o) => o.OrderID === r.OrderID);
    openDrawer((kind === "pickups" ? "Pickup " : "Delivery ") + r[cfg.id], `
      ${flow(cfg.flow, r.Status, cfg.bad.includes(r.Status))}
      <div class="box"><dl class="kv"><dt>Date &amp; slot</dt><dd>${esc(r.Date)} · ${esc(r.Slot)}</dd><dt>Team member</dt><dd>${esc(staffName(r.StaffID))}</dd><dt>Address</dt><dd>${esc(r[cfg.addr])}</dd><dt>Order</dt><dd class="mono">${esc(r.OrderID)}</dd><dt>Piece</dt><dd>${esc(order?.ProductTitle || r.ProductID)}</dd>${order ? `<dt>Buyer</dt><dd>${esc(order.BuyerName)} · ${contactLink(order.BuyerContact)}</dd>` : ""}<dt>Attempts failed</dt><dd>${esc(r.Attempts || 0)}</dd>${r.FailureReason ? `<dt>Reason</dt><dd>${esc(r.FailureReason)}</dd>` : ""}${r.VerificationNotes ? `<dt>Check notes</dt><dd>${esc(r.VerificationNotes)}</dd>` : ""}${kind === "deliveries" ? `<dt>Handover</dt><dd>${badge(r.HandoverStatus || "Pending")}${r.ReceivedBy ? ` received by ${esc(r.ReceivedBy)} on ${when(r.HandoverAt)}` : ""}</dd>` : ""}<dt>Notes</dt><dd>${esc(r.Notes) || "—"}</dd></dl></div>
      ${ops.length ? `<form class="box form-inline" id="opForm"><h3>Update</h3><div class="actions" id="opBtns">${ops.map((op, i) => `<button type="button" class="tab" data-op="${op}" aria-pressed="${i === 0}">${OP_LABEL[op]}</button>`).join("")}</div><div id="opFields"></div><button class="btn btn-sm" type="button" id="opGo">Save update</button></form>` : '<p class="muted small">No further actions for this record.</p>'}
      ${kind === "pickups" && r.Status === "Verification Failed" ? '<p class="alert info">The item did not match its listing. Contact the buyer and seller, then cancel the order from Orders if the sale will not go ahead.</p>' : ""}
      ${kind === "pickups" && r.Status === "Verified" ? '<p class="alert ok">Verified. Schedule delivery from the order.</p>' : ""}`, () => {
      if (!ops.length) return;
      let op = ops[0];
      const fields = () => {
        const n = need[op];
        $("#opFields").innerHTML = n === "sched" ? schedFields(kind === "pickups" ? meta.pickupSlots : meta.deliverySlots) : n === "reason" ? '<label>Reason<input name="reason" required minlength="3" maxlength="300"></label>' : n === "reasonOpt" ? '<label>Reason <small>(optional)</small><input name="reason" maxlength="300"></label>'
          : n === "notes" ? '<label>What doesn\'t match?<textarea name="notes" rows="2" required minlength="3" maxlength="500"></textarea></label>' : n === "notesOpt" ? '<label>Check notes <small>(optional)</small><textarea name="notes" rows="2" maxlength="500"></textarea></label>'
          : n === "receiver" ? '<label>Received by<input name="receivedBy" required minlength="2" maxlength="80" placeholder="Name of the person who received it"></label><label>Notes <small>(optional)</small><input name="notes" maxlength="500"></label><p class="hint">Recording the handover completes the order and marks the piece sold.</p>' : "";
      };
      fields();
      $("#opBtns").onclick = (e) => { const b = e.target.closest("[data-op]"); if (!b) return; op = b.dataset.op; $$("#opBtns [data-op]").forEach((x) => x.setAttribute("aria-pressed", x === b)); fields(); };
      $("#opGo").onclick = (e) => { const f = $("#opForm"), d = { [cfg.key]: r[cfg.id], op }; ["date", "slot", "staffId", "reason", "notes", "receivedBy"].forEach((k) => { const v = val(f, k); if (v) d[k] = v; }); if (op === "cancel" && !confirm("Cancel this " + (kind === "pickups" ? "pickup" : "delivery") + "?")) return; act(e.target, cfg.action, d, OP_LABEL[op] + " saved"); };
    });
  }

  /* ---------- Enquiries ---------- */
  function openEnquiry(x) {
    reopen = () => { const n = cache.enquiries?.find((y) => y.EnquiryID === x.EnquiryID); n && openEnquiry(n); };
    const isProduct = x.Type !== "Contact" && x.ProductID;
    openDrawer(x.Type === "Contact" ? "Message " + x.EnquiryID : "Enquiry " + x.EnquiryID, `
      <div class="actions">${badge(x.Status)}${x.Type === "Contact" ? '<span class="badge mute">General message</span>' : ""}</div>
      <div class="box"><dl class="kv"><dt>From</dt><dd>${esc(x.BuyerName)}</dd><dt>Contact</dt><dd>${contactLink(x.BuyerContact)}</dd><dt>Received</dt><dd>${when(x.CreatedAt)}</dd><dt>${isProduct ? "Piece" : "Subject"}</dt><dd>${esc(x.ProductTitleSnapshot)} ${isProduct ? `<span class="mono">${esc(x.ProductID)}</span>` : ""}</dd><dt>Message</dt><dd>${esc(x.Message) || "—"}</dd>${x.OrderID ? `<dt>Order</dt><dd class="mono">${esc(x.OrderID)}</dd>` : ""}</dl></div>
      <form class="box form-inline" id="enqForm"><h3>Status &amp; notes</h3><label>Status<select name="status">${["New", "Contacted", "Closed"].concat(x.Status === "Converted" ? ["Converted"] : []).map((s) => `<option ${s === x.Status ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Internal notes<textarea name="notes" rows="3" maxlength="800">${esc(x.AdminNotes)}</textarea></label><button class="btn btn-sm" type="button" id="saveEnq">Save</button></form>
      ${isProduct && !x.OrderID ? `<form class="box form-inline" id="ordForm"><h3>Create an order</h3><p class="small muted">After speaking with the buyer. The order starts as Pending review; confirm it once the seller agrees.</p><label>Buyer's delivery address<textarea name="address" rows="2" maxlength="300"></textarea></label><label>Notes<input name="notes" maxlength="500"></label><button class="btn btn-sm" type="button" id="mkOrder">Create order</button></form>` : ""}`, () => {
      $("#saveEnq").onclick = (e) => { const f = $("#enqForm"); act(e.target, "adminUpdateEnquiry", { enquiryId: x.EnquiryID, status: val(f, "status"), notes: val(f, "notes") }, "Enquiry updated"); };
      const mk = $("#mkOrder"); mk && (mk.onclick = (e) => { const f = $("#ordForm"); act(e.target, "adminCreateOrder", { enquiryId: x.EnquiryID, address: val(f, "address"), notes: val(f, "notes") }, "Order created"); });
    });
  }

  /* ---------- Helpers ---------- */
  function countUp(el, n, i) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !n) { el.textContent = n; return; }
    const t0 = performance.now() + i * 60, dur = 700;
    const step = (t) => { const k = Math.min(1, Math.max(0, (t - t0) / dur)); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const TITLES = { dashboard: "Dashboard", products: "Products", orders: "Orders", pickups: "Pickups", deliveries: "Deliveries", enquiries: "Enquiries", audit: "Activity", settings: "Settings" };
  async function route(keepDrawer) {
    current = (location.hash.slice(1) || "dashboard"); if (!VIEWS[current]) current = "dashboard";
    $$(".side nav a").forEach((a) => (a.dataset.v === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    $("#viewTitle").textContent = TITLES[current]; document.title = TITLES[current] + " · CIRCLO admin";
    if (!keepDrawer) { closeDrawer(); view.innerHTML = '<div class="kpis">' + '<div class="skel" style="aspect-ratio:auto;height:110px"></div>'.repeat(4) + "</div>"; }
    sideToggle(false);
    try { await VIEWS[current](); view.style.animation = "none"; view.offsetHeight; view.style.animation = ""; }
    catch (e) { if (e.code !== "AUTH") view.innerHTML = `<div class="panel"><h2>Couldn't load this page</h2><p class="muted">${esc(e.message)}</p><button class="btn btn-ghost" onclick="location.reload()">Try again</button></div>`; }
  }
  addEventListener("hashchange", () => route());
  api("adminSession").then(() => route()).catch((e) => {
    if (e.code === "AUTH") return; // already redirected to sign-in
    view.innerHTML = `<div class="panel"><h2>Couldn't reach the server</h2><p class="muted">${esc(e.message)}</p><button class="btn btn-ghost" onclick="location.reload()">Try again</button></div>`;
  });
})();
