/* CIRCLO page logic. Each page sets <body data-page="…">; only that page's code runs. */
(() => {
  "use strict";
  const K = window.CIRCLO, { $, $$, esc, inr, api, getCatalogue, card, skeletons, stateBox, toast, validate, busy, alertBox, reveal, media, UNS, CAT_IMG, IMG } = K;
  const params = new URLSearchParams(location.search);
  const retryBtn = '<button class="btn btn-ghost" data-retry>Try again</button>';
  const onRetry = (root, fn) => root.querySelector("[data-retry]")?.addEventListener("click", fn);

  /* ================= HOME ================= */
  function home() {
    const feat = $("#featured"), tiles = $("#tiles");
    const drawTiles = (cats) => {
      const pick = ["Sarees", "Jewellery", "Ethnic Wear", "Handbags", "Accessories"].filter((c) => cats.includes(c));
      cats.forEach((c) => pick.length < 5 && !pick.includes(c) && pick.push(c));
      tiles.innerHTML = pick.slice(0, 5).map((c, i) => `<a class="tile reveal" data-d="${i % 3}" href="shop.html?cat=${encodeURIComponent(c)}">${media(CAT_IMG[c] ? UNS(CAT_IMG[c], i === 0 ? 1100 : 700) : "", "", c)}<span class="tile-label"><span>${esc(c)}</span><i>Explore</i></span></a>`).join("");
      reveal(tiles);
    };
    drawTiles(K.DEFAULT_CATS);
    feat.innerHTML = skeletons(4);
    const load = () => getCatalogue().then((d) => {
      if (d.categories?.length) drawTiles(d.categories);
      const items = [...d.products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
      feat.innerHTML = items.length ? items.map(card).join("") : stateBox("The first edit is being curated", "New pieces appear here as soon as they pass review. Have something beautiful to pass on?", '<a class="btn" href="sell.html">Submit a piece</a>');
    }).catch((e) => { feat.innerHTML = stateBox("We couldn't load new arrivals", e.message, retryBtn); onRetry(feat, () => { feat.innerHTML = skeletons(4); load(); }); });
    load();
  }

  /* ================= SHOP ================= */
  function shop() {
    const grid = $("#grid"), count = $("#count"), more = $("#more"), PAGE = K.C.PAGE_SIZE || 12;
    const st = { q: params.get("q") || "", cat: params.get("cat") || "", cond: params.get("cond") || "", min: params.get("min") || "", max: params.get("max") || "", reserved: params.get("reserved") !== "0", sort: params.get("sort") || "new" };
    let all = [], list = [], shown = 0;
    $("#q").value = st.q; $("#sort").value = st.sort; $("#min").value = st.min; $("#max").value = st.max; $("#showReserved").checked = st.reserved;
    const chipRow = (el, values, key) => {
      el.innerHTML = [["", "All"], ...values.map((v) => [v, v])].map(([v, t]) => `<button type="button" class="chip" data-k="${key}" data-v="${esc(v)}" aria-pressed="${st[key] === v}">${esc(t)}</button>`).join("");
    };
    const sync = () => {
      const u = new URLSearchParams();
      st.q && u.set("q", st.q); st.cat && u.set("cat", st.cat); st.cond && u.set("cond", st.cond); st.min && u.set("min", st.min); st.max && u.set("max", st.max);
      !st.reserved && u.set("reserved", "0"); st.sort !== "new" && u.set("sort", st.sort);
      history.replaceState(null, "", "shop.html" + (u.toString() ? "?" + u : ""));
      $("#shopTitle").textContent = st.cat || "The full edit";
    };
    function apply(animate = true) {
      const q = st.q.trim().toLowerCase(), lo = st.min === "" ? null : +st.min, hi = st.max === "" ? null : +st.max;
      list = all.filter((p) => (!q || [p.title, p.description, p.category, p.brand, p.condition].join(" ").toLowerCase().includes(q)) &&
        (!st.cat || p.category === st.cat) && (!st.cond || p.condition === st.cond) && (lo == null || p.price >= lo) && (hi == null || p.price <= hi) && (st.reserved || p.availability === "Available"));
      list.sort((a, b) => st.sort === "low" ? a.price - b.price : st.sort === "high" ? b.price - a.price : new Date(b.createdAt) - new Date(a.createdAt));
      count.textContent = `${list.length} piece${list.length === 1 ? "" : "s"}`;
      const tags = [st.cat && ["cat", st.cat], st.cond && ["cond", st.cond], st.q && ["q", `“${st.q}”`], (st.min || st.max) && ["price", `${st.min ? inr(st.min) : "₹0"} – ${st.max ? inr(st.max) : "any"}`]].filter(Boolean);
      $("#active").innerHTML = tags.map(([k, t]) => `<button type="button" data-clear="${k}" aria-label="Remove filter ${esc(t)}">${esc(t)} ×</button>`).join("") + (tags.length > 1 ? '<button type="button" data-clear="all">Clear all</button>' : "");
      $$(".chip").forEach((c) => c.setAttribute("aria-pressed", st[c.dataset.k] === c.dataset.v));
      sync();
      const draw = () => {
        shown = 0; grid.innerHTML = "";
        if (!list.length) { grid.innerHTML = all.length ? stateBox("No pieces match these filters", "Try removing a filter or searching for something else.", '<button class="btn btn-ghost" data-clear="all">Clear filters</button>') : stateBox("The edit is being curated", "Approved pieces will appear here. Check back soon, or submit one of your own.", '<a class="btn" href="sell.html">Submit a piece</a>'); more.hidden = true; return; }
        page();
      };
      if (animate) { grid.classList.add("fading"); setTimeout(() => { draw(); grid.classList.remove("fading"); }, 150); } else draw();
    }
    function page() {
      grid.insertAdjacentHTML("beforeend", list.slice(shown, shown + PAGE).map(card).join(""));
      shown += PAGE; more.hidden = shown >= list.length;
    }
    const load = () => {
      grid.innerHTML = skeletons(8);
      getCatalogue().then((d) => {
        all = d.products || [];
        chipRow($("#cats"), d.categories?.length ? d.categories : K.DEFAULT_CATS, "cat");
        chipRow($("#conds"), d.conditions?.length ? d.conditions : K.DEFAULT_CONDS, "cond");
        apply(false);
      }).catch((e) => { grid.innerHTML = stateBox("We couldn't load the shop", e.message, retryBtn); onRetry(grid, load); });
    };
    const deb = {};
    $("#q").addEventListener("input", (e) => { clearTimeout(deb.q); deb.q = setTimeout(() => { st.q = e.target.value; apply(); }, 220); });
    $("#sort").addEventListener("change", (e) => { st.sort = e.target.value; apply(); });
    ["min", "max"].forEach((k) => $("#" + k).addEventListener("input", (e) => { clearTimeout(deb[k]); deb[k] = setTimeout(() => { st[k] = e.target.value.replace(/\D/g, ""); apply(); }, 350); }));
    $("#showReserved").addEventListener("change", (e) => { st.reserved = e.target.checked; apply(); });
    document.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) { st[chip.dataset.k] = chip.dataset.v; apply(); return; }
      const c = e.target.closest("[data-clear]");
      if (c) {
        const k = c.dataset.clear;
        if (k === "all" || k === "price") { st.min = st.max = ""; $("#min").value = $("#max").value = ""; }
        if (k === "all") { st.cat = st.cond = st.q = ""; $("#q").value = ""; }
        else if (k !== "price") { st[k] = ""; if (k === "q") $("#q").value = ""; }
        apply();
      }
    });
    more.onclick = page;
    const fl = $("#filters"), scrim = $("#scrim");
    const toggle = (o) => { fl.classList.toggle("open", o); scrim.classList.toggle("open", o); $("#filterBtn").setAttribute("aria-expanded", o); };
    $("#filterBtn").onclick = () => toggle(true); scrim.onclick = () => toggle(false); $("#closeFilters").onclick = () => toggle(false);
    load();
  }

  /* ================= PRODUCT ================= */
  function product() {
    const root = $("#pd"), id = params.get("id") || "";
    const notFound = (msg) => { root.innerHTML = `<div style="grid-column:1/-1">${stateBox("This piece isn't available", msg || "It may have been sold or removed from the catalogue.", '<a class="btn" href="shop.html">Browse the shop</a>')}</div>`; document.title = "Piece not found · CIRCLO"; };
    if (!id) return notFound("No piece was selected.");
    root.innerHTML = '<div><div class="skel" style="border-radius:28px"></div></div><div><div class="skel-line" style="width:30%"></div><div class="skel-line" style="height:40px;width:85%;margin-top:20px"></div><div class="skel-line" style="width:25%;height:24px;margin-top:20px"></div><div class="skel-line" style="width:100%;margin-top:40px"></div><div class="skel-line" style="width:90%"></div></div>';
    api("getProduct", { productId: id }).then((p) => {
      const imgs = (p.images || []).map(K.safeUrl).filter(Boolean), reserved = p.availability === "Reserved";
      document.title = `${p.title} · CIRCLO`;
      $("#crumbCat").textContent = p.category; $("#crumbCat").href = "shop.html?cat=" + encodeURIComponent(p.category); $("#crumbTitle").textContent = p.title;
      root.innerHTML = `
        <div class="gallery">
          ${imgs.length > 1 ? `<div class="thumbs-col" role="tablist" aria-label="Photos">${imgs.map((u, i) => `<button role="tab" data-img="${esc(u)}" aria-current="${i === 0}" aria-label="Photo ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()"></button>`).join("")}</div>` : "<div></div>"}
          <button class="main media" id="mainImg" aria-label="Enlarge photo" style="border:0;padding:0">${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(p.title)}" onerror="this.remove()">` : ""}<div class="fallback" aria-hidden="true">${esc(p.category)}</div></button>
        </div>
        <div class="pd-info">
          <div><span class="eyebrow">${esc(p.category)}</span>${p.sample ? ' <span class="badge mute">Sample · not for sale</span>' : ""}<h1>${esc(p.title)}</h1></div>
          <div class="price">${inr(p.price)}</div>
          <dl class="spec"><dt>Condition</dt><dd>${esc(p.condition)}</dd>${p.brand ? `<dt>Brand</dt><dd>${esc(p.brand)}</dd>` : ""}<dt>Availability</dt><dd>${reserved ? '<span class="badge gold">Reserved</span>' : '<span class="badge ok">Available</span>'}</dd><dt>Reference</dt><dd>${esc(p.productId)}</dd></dl>
          <p class="pd-desc">${esc(p.description)}</p>
          <button class="btn btn-block" id="enqBtn" ${reserved ? "disabled" : ""}>${reserved ? "Reserved for another buyer" : "Enquire about this piece"}</button>
          <div class="assure"><div>${K.ICON.eye}<span>Reviewed by CIRCLO before listing. Please still ask about anything you'd like to confirm.</span></div><div>${K.ICON.truck}<span>Collected and delivered locally by the CIRCLO team once your order is confirmed.</span></div><div>${K.ICON.lock}<span>The seller's details stay private. CIRCLO coordinates everything.</span></div></div>
        </div>`;
      const main = $("#mainImg");
      $$("[data-img]").forEach((b) => b.onclick = () => {
        let img = main.querySelector("img");
        if (!img) { img = new Image(); img.alt = p.title; main.prepend(img); }
        img.classList.add("swap"); setTimeout(() => { img.src = b.dataset.img; img.onload = () => img.classList.remove("swap"); }, 180);
        $$("[data-img]").forEach((x) => x.setAttribute("aria-current", x === b));
      });
      const lb = $("#lightbox");
      main.onclick = () => { const img = main.querySelector("img"); if (!img) return; lb.querySelector("img").src = img.src; lb.classList.add("open"); lb.focus(); };
      lb.onclick = () => lb.classList.remove("open");
      addEventListener("keydown", (e) => e.key === "Escape" && lb.classList.remove("open"));
      if (!reserved) $("#enqBtn").onclick = () => openEnquiry(p);
      getCatalogue().then((d) => {
        const rel = d.products.filter((x) => x.productId !== p.productId && x.category === p.category).concat(d.products.filter((x) => x.productId !== p.productId && x.category !== p.category)).slice(0, 4);
        if (rel.length) { $("#relatedWrap").hidden = false; $("#related").innerHTML = rel.map(card).join(""); }
      }).catch(() => {});
    }).catch((e) => (/not available|not found/i.test(e.message) ? notFound() : (root.innerHTML = `<div style="grid-column:1/-1">${stateBox("We couldn't load this piece", e.message, retryBtn)}</div>`, onRetry(root, product))));
  }
  function openEnquiry(p) {
    const dlg = $("#enqDlg"), f = $("#enqForm"), msg = $("#enqMsg");
    f.reset(); f.hidden = false; msg.className = "alert"; msg.textContent = ""; $("#enqDone").hidden = true;
    f.productId.value = p.productId; $("#enqFor").textContent = `${p.title} · ${inr(p.price)}`;
    dlg.showModal();
    f.onsubmit = async (e) => {
      e.preventDefault(); const btn = f.querySelector("[type=submit]");
      if (btn.disabled || !validate(f)) return;
      busy(btn, true);
      try {
        const fd = Object.fromEntries(new FormData(f));
        const r = await api("submitEnquiry", { ...fd, consent: !!fd.consent });
        f.hidden = true; $("#enqDone").hidden = false; $("#enqRef").textContent = r.reference;
        $("#enqNote").textContent = r.demo ? "Demo mode: this enquiry was not saved." : "We'll contact you to confirm the details and next steps.";
        toast("Enquiry sent");
      } catch (err) { alertBox(msg, err.message, "err"); }
      finally { busy(btn, false); }
    };
  }

  /* ================= SELL ================= */
  function sell() {
    const f = $("#sellForm"), panels = $$(".step-panel", f), bars = $$(".progress li"), msg = $("#sellMsg");
    const MAX = K.C.MAX_IMAGES || 4, MB = K.C.MAX_IMAGE_MB || 8;
    let step = 0, files = [], sending = false;
    const show = (i) => {
      step = i; panels.forEach((p, k) => p.classList.toggle("active", k === i));
      bars.forEach((b, k) => { b.classList.toggle("done", k < i); b.classList.toggle("now", k === i); b.toggleAttribute("aria-current", k === i); });
      f.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    getCatalogue().then((d) => fill(d)).catch(() => fill({}));
    function fill(d) {
      const opt = (a) => '<option value="">Select…</option>' + a.map((x) => `<option>${esc(x)}</option>`).join("");
      $("#sCat").innerHTML = opt(d.categories?.length ? d.categories : K.DEFAULT_CATS);
      $("#sCond").innerHTML = opt(d.conditions?.length ? d.conditions : K.DEFAULT_CONDS);
    }
    f.addEventListener("click", (e) => {
      const nx = e.target.closest("[data-next]"), bk = e.target.closest("[data-back]");
      if (nx) { if (step === 1 && !files.length) { alertBox(msg, "Please add at least one photo.", "err"); return; } if (validate(panels[step])) { msg.className = "alert"; show(step + 1); } }
      if (bk) show(step - 1);
    });
    const drop = $("#drop"), input = $("#photos"), thumbs = $("#thumbs");
    const addFiles = (list) => {
      for (const fl of list) {
        if (files.length >= MAX) { alertBox(msg, `You can add up to ${MAX} photos.`, "err"); break; }
        if (!/^image\/(jpeg|png|webp)$/.test(fl.type)) { alertBox(msg, `"${fl.name}" isn't a JPG, PNG or WebP image.`, "err"); continue; }
        if (fl.size > MB * 1048576) { alertBox(msg, `"${fl.name}" is larger than ${MB} MB.`, "err"); continue; }
        files.push({ file: fl, url: URL.createObjectURL(fl) }); msg.className = "alert";
      }
      drawThumbs();
    };
    const drawThumbs = () => { thumbs.innerHTML = files.map((x, i) => `<figure><img src="${x.url}" alt="Photo ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button></figure>`).join(""); $("#photoCount").textContent = `${files.length} of ${MAX} added`; };
    input.onchange = () => { addFiles(input.files); input.value = ""; };
    thumbs.onclick = (e) => { const b = e.target.closest("[data-rm]"); if (b) { URL.revokeObjectURL(files[+b.dataset.rm].url); files.splice(+b.dataset.rm, 1); drawThumbs(); } };
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    drop.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click()));

    const compress = (file) => new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1400 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        res({ type: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.82).split(",")[1] });
      };
      img.onerror = () => rej(new Error(`"${file.name}" couldn't be read as an image.`)); img.src = url;
    });
    f.onsubmit = async (e) => {
      e.preventDefault(); const btn = $("#sellSubmit");
      if (sending || !validate(panels[2])) return;
      sending = true; busy(btn, true, "Preparing photos…"); msg.className = "alert";
      try {
        const images = await Promise.all(files.map((x) => compress(x.file)));
        btn.lastChild.textContent = "Uploading…";
        const fd = Object.fromEntries(new FormData(f)); delete fd.photos;
        const r = await api("submitProduct", { ...fd, price: +fd.price, consent: !!fd.consent, images });
        f.hidden = true; $("#sellDone").hidden = false; $("#sellRef").textContent = r.reference;
        $("#sellNote").textContent = r.demo ? "Demo mode: nothing was saved. Connect the backend to accept real submissions." : "Your piece is pending review and is not public yet. We'll contact you after review.";
        $("#sellDone").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Submitted for review");
      } catch (err) { alertBox(msg, err.message, "err"); toast("Submission failed", "err"); }
      finally { sending = false; busy(btn, false); }
    };
    $("#again").onclick = () => { f.reset(); files = []; drawThumbs(); f.hidden = false; $("#sellDone").hidden = true; show(0); };
  }

  /* ================= CONTACT ================= */
  function contact() {
    const f = $("#contactForm"), msg = $("#contactMsg");
    const subject = params.get("subject"); if (subject) f.subject.value = subject;
    getCatalogue().then((d) => {
      const s = d.site || {}, set = (id, v, href) => { const el = $(id); if (el && v) { el.textContent = v; if (href) el.href = href; el.closest("div").hidden = false; } };
      set("#cEmail", s.contactEmail || K.C.CONTACT_EMAIL, "mailto:" + (s.contactEmail || K.C.CONTACT_EMAIL));
      set("#cPhone", s.contactPhone || K.C.CONTACT_PHONE, "tel:" + String(s.contactPhone || K.C.CONTACT_PHONE || "").replace(/\s/g, ""));
      set("#cArea", s.serviceArea || K.C.SERVICE_AREA);
    }).catch(() => {});
    f.onsubmit = async (e) => {
      e.preventDefault(); const btn = f.querySelector("[type=submit]");
      if (btn.disabled || !validate(f)) return;
      busy(btn, true);
      try {
        const fd = Object.fromEntries(new FormData(f));
        const r = await api("submitContact", { ...fd, consent: !!fd.consent });
        f.reset(); alertBox(msg, r.demo ? `Demo mode: message not saved (ref ${r.reference}).` : `Thank you. Your message reference is ${r.reference}. We'll reply soon.`, "ok"); toast("Message sent");
      } catch (err) { alertBox(msg, err.message, "err"); }
      finally { busy(btn, false); }
    };
  }

  /* ================= FAQ & LEGAL (scroll-spy) ================= */
  function spy() {
    const links = $$(".faq-nav a, .toc a"); if (!links.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) links.forEach((l) => l.classList.toggle("on", l.hash === "#" + x.target.id)); }), { rootMargin: "-30% 0px -60% 0px" });
    links.forEach((l) => { const t = document.querySelector(l.hash); t && io.observe(t); });
  }

  const pages = { home, shop, product, sell, contact, faq: spy, legal: spy };
  (pages[document.body.dataset.page] || (() => {}))();
})();
