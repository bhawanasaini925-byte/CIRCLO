/* CIRCLO shared core — loaded on every public page before pages.js.
   Provides: API client, safe rendering helpers, header/footer, animations, toasts and form helpers. */
(() => {
  "use strict";
  document.documentElement.classList.remove("no-js");
  const C = window.CIRCLO_CONFIG || {};
  const DEMO = !C.API_URL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "");
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const ICON = {
    search: '<svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    up: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    check: '<svg class="ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    eye: '<svg class="ic" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    shield: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    hand: '<svg class="ic" viewBox="0 0 24 24"><path d="M7 11V6a2 2 0 1 1 4 0v5M11 10V4a2 2 0 1 1 4 0v6M15 10V6a2 2 0 1 1 4 0v7a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3l-2-4a2 2 0 0 1 3-2l2 2"/></svg>',
    truck: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    lock: '<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    bag: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    spark: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>'
  };

  /* ---------- Imagery (Unsplash, free licence). Each image falls back to a designed panel if it can't load. ---------- */
  const UNS = (id, w = 900) => `https://images.unsplash.com/${id}?w=${w}&q=72&auto=format&fit=crop`;
  const IMG = {
    hero: "photo-1610030469983-98e550d6193c", jewel: "photo-1599643478518-a784e5dc4c8f", ethnic: "photo-1583391733956-3750e0ff4e8b",
    saree2: "photo-1617627143750-d86bc21e42bb", bag: "photo-1584917865442-de89df76afd3", earrings: "photo-1535632066927-ab7c9ab60908"
  };
  // Photos verified on 21 Oct 2026: saree portrait, pendant necklaces, white ethnic outfit, red silk saree, red handbag, statement earrings.
  const CAT_IMG = { Sarees: IMG.hero, Jewellery: IMG.jewel, "Ethnic Wear": IMG.ethnic, Handbags: IMG.bag, Accessories: IMG.earrings, Clutches: IMG.bag };
  /** <div class="media">: image + a styled fallback label that shows if the image fails. */
  const media = (src, alt, label, cls = "", eager) => {
    const s = safeUrl(src);
    return `<div class="media ${cls}">${s ? `<img src="${esc(s)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.remove()">` : ""}<div class="fallback" aria-hidden="true">${esc(label || "CIRCLO")}</div></div>`;
  };

  /* ---------- Sample data — used ONLY in demo mode (no API_URL). Clearly labelled, never presented as stock. ---------- */
  const DEFAULT_CATS = ["Jewellery", "Sarees", "Lehengas", "Kurtis", "Dresses", "Ethnic Wear", "Handbags", "Clutches", "Accessories", "Footwear"];
  const DEFAULT_CONDS = ["New with tags", "Like new", "Gently used", "Well loved"];
  const SAMPLE = [
    ["Banarasi silk saree, purple & gold zari", "Sarees", "Like new", 6800, [IMG.hero, IMG.saree2], "Handwoven silk with a gold zari border. Worn twice. Blouse piece included."],
    ["Layered pendant necklaces", "Jewellery", "Gently used", 3200, [IMG.jewel], "Two gold-tone pendant necklaces, crescent and stone drop. Clasps work well."],
    ["Embroidered white anarkali set", "Ethnic Wear", "Like new", 8500, [IMG.ethnic], "Floor-length white anarkali with dupatta, worn once. Size M."],
    ["Red structured handbag", "Handbags", "Gently used", 2400, [IMG.bag], "Red top-handle bag with shoulder strap. Light wear on base corners."],
    ["Red silk saree with gold border", "Sarees", "Like new", 4200, [IMG.saree2], "Bright red silk saree with a contrast gold border. Worn once for a festival."],
    ["Statement drop earrings", "Jewellery", "Like new", 1200, [IMG.earrings], "Silver-tone drop earrings with blue stones, with original box."]
  ].map((p, i) => ({ productId: "SAMPLE-" + (i + 1), title: p[0], category: p[1], condition: p[2], price: p[3], images: p[4].map((x) => UNS(x)), description: p[5] + "\n\nThis is a sample item shown in demo mode. It is not for sale.", brand: "", availability: i === 3 ? "Reserved" : "Available", createdAt: new Date(Date.now() - i * 864e5).toISOString(), sample: true }));

  /* ---------- API ---------- */
  // Read-only actions are retried once: while Apps Script is waking up, Google can briefly return a non-JSON page.
  // Write actions are never retried, so a submission can't be duplicated.
  const READS = ["listProducts", "getProduct"];
  async function api(action, data = {}) {
    if (DEMO) return demo(action, data);
    try { return await call(action, data); }
    catch (e) { if (!READS.includes(action) || e.server) throw e; await new Promise((r) => setTimeout(r, 1500)); return call(action, data); }
  }
  async function call(action, data) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
    let res;
    try {
      // text/plain keeps this a "simple" CORS request; Apps Script web apps cannot answer preflight requests.
      res = await fetch(C.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...data }), signal: ctrl.signal, redirect: "follow" });
    } catch (e) {
      throw new Error(e.name === "AbortError" ? "The request took too long. Please try again." : "We couldn't reach CIRCLO. Please check your connection and try again.");
    } finally { clearTimeout(timer); }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error(READS.includes(action) ? "The server sent an unexpected response. Please try again later." : "We couldn't confirm this was saved. Please wait a moment and try again."); }
    if (!json.ok) { const err = new Error(json.error || "Request failed"); err.code = json.code; err.server = true; throw err; }
    // Under load Google can turn the POST into a GET while redirecting; the reply is then the health check, not our answer.
    if (json.data && json.data.service === "CIRCLO API") throw new Error(READS.includes(action) ? "The server is busy. Please try again." : "We couldn't confirm this was saved. Please wait a moment and try again.");
    return json.data;
  }
  let catalogue;
  async function demo(action, d) {
    await new Promise((r) => setTimeout(r, 450));
    if (action === "listProducts") return { products: SAMPLE, categories: DEFAULT_CATS, conditions: DEFAULT_CONDS, site: {} };
    if (action === "getProduct") { const p = SAMPLE.find((x) => x.productId === d.productId); if (!p) throw new Error("This piece is not available"); return p; }
    const ref = (pre) => pre + "-DEMO-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    if (action === "submitProduct") return { reference: ref("CIR"), status: "Pending", demo: true };
    if (action === "submitEnquiry") return { reference: ref("ENQ"), demo: true };
    if (action === "submitContact") return { reference: ref("MSG"), demo: true };
    throw new Error("Not available in demo mode");
  }
  /** Catalogue is fetched once per page and shared. */
  const getCatalogue = () => (catalogue ||= api("listProducts").catch((e) => { catalogue = null; throw e; }));

  /* ---------- Rendering ---------- */
  const card = (p, i = 0) => {
    const img = safeUrl((p.images || [])[0]);
    const badge = p.sample ? '<span class="badge mute">Sample</span>' : p.availability === "Reserved" ? '<span class="badge gold">Reserved</span>' : "";
    return `<a class="pcard" href="product.html?id=${encodeURIComponent(p.productId)}" style="animation-delay:${Math.min(i, 8) * 60}ms">
      <div class="pimg">${badge}${img ? `<img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy" decoding="async" onerror="this.remove()">` : ""}<div class="fallback" aria-hidden="true">${esc(p.category)}</div><span class="view">View piece</span></div>
      <div class="pinfo"><span class="cat-l">${esc(p.category)}</span><h3>${esc(p.title)}</h3><div class="row"><span class="price">${inr(p.price)}</span><span class="cond">${esc(p.condition)}</span></div></div></a>`;
  };
  const skeletons = (n) => Array.from({ length: n }, () => '<div><div class="skel"></div><div class="skel-line"></div><div class="skel-line" style="width:40%"></div></div>').join("");
  const stateBox = (title, text, action = "") => `<div class="state">${ICON.spark}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

  /* ---------- Toast ---------- */
  function toast(text, type = "") {
    const el = $("#toast"); if (!el) return;
    el.className = "toast " + type; el.innerHTML = (type === "err" ? "" : ICON.check) + `<span>${esc(text)}</span>`;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 4200);
  }

  /* ---------- Forms ---------- */
  const CONTACT_RE = /^(\+?[\d\s-]{8,15}|[^\s@]+@[^\s@]+\.[^\s@]{2,})$/;
  function validate(scope) {
    let first = null;
    $$("[required],[data-contact]", scope).forEach((el) => {
      let bad = el.type === "checkbox" ? !el.checked : el.type === "file" ? !el.files.length : !el.checkValidity() || (el.required && !String(el.value).trim());
      if (!bad && el.dataset.contact !== undefined && el.value.trim() && !CONTACT_RE.test(el.value.trim())) bad = true;
      el.classList.toggle("invalid", bad); el.setAttribute("aria-invalid", bad);
      if (bad && !first) first = el;
    });
    if (first) { first.focus(); first.classList.add("shake"); setTimeout(() => first.classList.remove("shake"), 400); }
    return !first;
  }
  document.addEventListener("input", (e) => e.target.classList?.contains("invalid") && e.target.classList.remove("invalid"));
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(label || "Sending…")}`; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  const alertBox = (el, text, type) => { el.className = "alert " + type; el.textContent = text; el.setAttribute("role", type === "err" ? "alert" : "status"); };

  /* ---------- Layout ---------- */
  const NAV = [["index.html", "Home"], ["shop.html", "Shop"], ["sell.html", "Sell with us"], ["about.html", "About"], ["faq.html", "FAQ"], ["contact.html", "Contact"]];
  function layout() {
    const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const head = $("[data-header]");
    if (head) head.outerHTML = `${DEMO ? '<div class="strip">Demo mode: showing <b>sample pieces</b> only. Nothing you submit is saved.</div>' : ""}
      <header class="header" id="top"><div class="container header-in">
        <a href="index.html" class="logo" aria-label="CIRCLO home"><span class="logo-o"></span>CIRCLO</a>
        <nav class="nav" id="nav" aria-label="Main">${NAV.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
        <div class="header-actions">
          <button class="icon-btn" id="searchBtn" aria-label="Search" aria-expanded="false" aria-controls="searchPop">${ICON.search}</button>
          <a href="sell.html" class="btn btn-sm">Submit a piece</a>
          <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
        </div></div>
        <div class="search-pop" id="searchPop"><form class="container" action="shop.html" role="search"><input type="search" name="q" placeholder="Search sarees, jhumkas, clutches…" aria-label="Search the shop"><button class="btn">Search</button></form></div>
      </header>`;
    const foot = $("[data-footer]");
    if (foot) foot.outerHTML = `<footer class="footer"><div class="container">
      <div class="foot-top"><h2>Pre-Loved. <em style="color:var(--rose)">Re-Loved.</em> Yours.</h2><a href="sell.html" class="btn btn-light">Submit a piece</a></div>
      <div class="foot-in">
        <div><a href="index.html" class="logo light"><span class="logo-o"></span>CIRCLO</a><p>A curated marketplace for women's pre-owned fashion and jewellery. Every piece is reviewed before it is listed.</p></div>
        <div><h4>Explore</h4><a href="shop.html">Shop all</a><a href="shop.html?cat=Sarees">Sarees</a><a href="shop.html?cat=Jewellery">Jewellery</a><a href="sell.html">Sell with us</a><a href="about.html">About CIRCLO</a></div>
        <div><h4>Help</h4><a href="faq.html">FAQs</a><a href="contact.html">Contact</a><a href="privacy.html">Privacy policy</a><a href="terms.html">Terms &amp; conditions</a></div>
        <div><h4>Get in touch</h4><span id="footContact"></span></div>
      </div>
      <div class="copy"><span>© ${new Date().getFullYear()} CIRCLO. All rights reserved.</span><a href="admin/login.html" style="display:inline;padding:0">Team sign-in</a></div>
    </div></footer>`;
    document.body.insertAdjacentHTML("beforeend", '<div class="toast" id="toast" role="status" aria-live="polite"></div><button class="to-top" id="toTop" aria-label="Back to top">' + ICON.up + "</button>");
    contactLinks(C);

    const menu = $("#menuBtn"), nav = $("#nav"), sBtn = $("#searchBtn"), sPop = $("#searchPop");
    menu && (menu.onclick = () => { const o = nav.classList.toggle("open"); menu.setAttribute("aria-expanded", o); document.body.style.overflow = o ? "hidden" : ""; });
    sBtn && (sBtn.onclick = () => { const o = sPop.classList.toggle("open"); sBtn.setAttribute("aria-expanded", o); if (o) setTimeout(() => sPop.querySelector("input").focus(), 50); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { sPop?.classList.remove("open"); if (nav?.classList.contains("open")) menu.click(); } });
    const header = $(".header"), top = $("#toTop");
    const onScroll = () => { header?.classList.toggle("scrolled", scrollY > 8); top.classList.toggle("show", scrollY > 900); };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    top.onclick = () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function contactLinks(site) {
    const el = $("#footContact"); if (!el) return;
    const email = site.contactEmail || site.CONTACT_EMAIL, phone = site.contactPhone || site.CONTACT_PHONE, insta = C.INSTAGRAM;
    el.innerHTML = (email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : "") + (phone ? `<a href="tel:${esc(phone.replace(/\s/g, ""))}">${esc(phone)}</a>` : "") +
      (insta ? `<a href="${esc(safeUrl(insta))}" target="_blank" rel="noopener">Instagram</a>` : "") + '<a href="contact.html">Send us a message</a>';
  }

  /* ---------- Scroll reveal & accordions ---------- */
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.12, rootMargin: "0px 0px -40px" }) : null;
  const reveal = (root = document) => $$(".reveal:not(.in)", root).forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function accordions(root = document) {
    $$("details.acc", root).forEach((d) => {
      const s = d.querySelector("summary"), b = d.querySelector(".body");
      s.addEventListener("click", (e) => {
        if (reduce() || !b.animate) return;
        e.preventDefault();
        if (d.open) { const a = b.animate([{ height: b.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 300, easing: "ease" }); a.onfinish = () => (d.open = false); }
        else { d.open = true; const h = b.offsetHeight; b.animate([{ height: "0px", opacity: 0 }, { height: h + "px", opacity: 1 }], { duration: 350, easing: "cubic-bezier(.2,.7,.2,1)" }); }
      });
    });
  }

  window.CIRCLO = { C, DEMO, $, $$, esc, safeUrl, inr, ICON, IMG, UNS, CAT_IMG, media, api, getCatalogue, card, skeletons, stateBox, toast, validate, busy, alertBox, reveal, accordions, contactLinks, DEFAULT_CATS, DEFAULT_CONDS };
  layout(); reveal(); accordions();
  if (!DEMO) getCatalogue().then((d) => d.site && contactLinks({ ...C, ...Object.fromEntries(Object.entries(d.site).filter(([, v]) => v)) })).catch(() => {});
})();
