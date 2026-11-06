/* ─────────────────────────────────────────────────────────────
   KITOKO's HAIR — logique du site (tarifs + réservation)
   Aucune dépendance. Les réglages sont dans config.js et services.js.
   ───────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const CFG = window.KITOKO_CONFIG;
  const CAT = window.KITOKO_SERVICES;
  const B = CFG.booking;
  const DEMO = !CFG.appsScriptUrl;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  };

  const euro = (n) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const pad = (n) => String(n).padStart(2, "0");
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  // Minutes « absolues » d'une date locale (calcul sans fuseau, cohérent avec l'agenda)
  const absMin = (dateStr, minutes) => { const [y, m, d] = dateStr.split("-").map(Number); return Date.UTC(y, m - 1, d) / 60000 + minutes; };
  const dateLong = (s) => parseYmd(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const hhFr = (hhmm) => { const [h, m] = hhmm.split(":"); return `${Number(h)} h${m === "00" ? "" : " " + m}`; };

  const familyById = (id) => CAT.families.find((f) => f.id === id);
  const sizeById = (id) => CAT.sizes.find((s) => s.id === id);
  const minPrice = Math.min(...CAT.families.flatMap((f) => f.variants.map((v) => v[2])));

  /* ───────── Infos de contact ───────── */
  function fillBusiness() {
    const biz = CFG.business;
    $$("[data-city]").forEach((n) => (n.textContent = biz.city));
    $$("[data-min-price]").forEach((n) => (n.textContent = euro(minPrice)));
    const set = (sel, href, label) => { const a = $(sel); if (!a) return; if (href) { a.href = href; if (label) a.textContent = label; } else a.parentElement.remove(); };
    set("[data-instagram]", biz.instagram && `https://instagram.com/${biz.instagram}`, `Instagram @${biz.instagram}`);
    set("[data-whatsapp]", biz.whatsapp && `https://wa.me/${biz.whatsapp}`);
    set("[data-phone]", biz.phoneDisplay && `tel:+${biz.whatsapp || ""}`, biz.phoneDisplay);
    set("[data-email]", biz.email && `mailto:${biz.email}`, biz.email);
    const cancel = $("[data-cancel-rule]");
    if (cancel) {
      cancel.textContent = CFG.deposit.enabled
        ? `Annulation gratuite jusqu'à ${B.freeCancellationHours} h avant : l'acompte est remboursé. Après ce délai, ${CFG.deposit.lateCancellationPenaltyPercent} % de l'acompte est retenu.`
        : `Annulation gratuite jusqu'à ${B.freeCancellationHours} h avant le rendez-vous, depuis le lien reçu par e-mail.`;
    }
  }

  /* ───────── Grille tarifaire ───────── */
  function renderPrices() {
    const tabs = $("[data-tabs]");
    const panels = $("[data-price-panels]");
    CAT.groups.forEach((g, i) => {
      const tab = el("button", {
        class: "tab", role: "tab", id: `tab-${g.id}`, "aria-controls": `panel-${g.id}`,
        "aria-selected": i === 0 ? "true" : "false", tabindex: i === 0 ? "0" : "-1", type: "button", text: g.label,
      });
      tabs.append(tab);

      const panel = el("div", { class: "price-panel", role: "tabpanel", id: `panel-${g.id}`, "aria-labelledby": `tab-${g.id}`, hidden: i !== 0 });
      const isSingle = (f) => f.variants.length === 1 && !f.sizes;
      const fams = CAT.families.filter((f) => f.group === g.id);
      [...fams.filter((f) => !isSingle(f)), ...fams.filter(isSingle)].forEach((f) => panel.append(priceCard(f)));
      panels.append(panel);
    });

    const allTabs = $$(".tab", tabs);
    const select = (tab) => {
      allTabs.forEach((t) => { const on = t === tab; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; $("#" + t.getAttribute("aria-controls")).hidden = !on; });
      tab.focus();
    };
    allTabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") select(allTabs[(i + 1) % allTabs.length]);
        if (e.key === "ArrowLeft") select(allTabs[(i - 1 + allTabs.length) % allTabs.length]);
      });
    });

    $("[data-extras-list]").append(
      ...CAT.extras.map((x) => el("li", {}, `${x.label} `, el("b", { text: `${x.from ? "dès " : ""}+${euro(x.price)}` })))
    );
  }

  function priceCard(f) {
    const book = el("button", { class: "price-card__book", type: "button", text: "Réserver cette coiffure", onclick: () => startWith(f.id) });
    if (f.variants.length === 1 && !f.sizes) {
      const [, , price, from] = f.variants[0];
      return el("article", { class: "price-card price-card--single" },
        el("div", { class: "price-card__row" }, el("h3", { text: f.name }), el("p", { class: "price-card__price", text: (from ? "dès " : "") + euro(price) })),
        book
      );
    }
    const head = f.sizes
      ? el("tr", {}, el("th", { scope: "col", text: f.variantLabel }), ...CAT.sizes.map((s) => el("th", { scope: "col", text: `Taille ${s.label}` })))
      : el("tr", {}, el("th", { scope: "col", text: f.variantLabel }), el("th", { scope: "col", text: "Prix" }));
    const rows = f.variants.map(([, label, price, from]) =>
      f.sizes
        ? el("tr", {}, el("td", { text: label }), ...CAT.sizes.map((s) => el("td", { text: euro(price + s.extra) })))
        : el("tr", {}, el("td", { text: label }), el("td", { text: (from ? "dès " : "") + euro(price) }))
    );
    return el("article", { class: "price-card" },
      el("h3", { text: f.name }),
      el("table", { class: "price-table" }, el("thead", {}, head), el("tbody", {}, rows)),
      book
    );
  }

  /* ───────── Réservation : état ───────── */
  const state = { family: null, variant: null, size: null, extras: new Set(), date: null, time: null };
  const busyCache = new Map(); // "YYYY-MM" -> [{s, e}] en minutes absolues

  const currentFamily = () => familyById(state.family);
  const currentVariant = () => currentFamily()?.variants.find((v) => v[0] === state.variant);
  const duration = () => currentFamily()?.duration || B.defaultDurationMinutes;

  function pricing() {
    const f = currentFamily(); const v = currentVariant();
    if (!f || !v) return null;
    if (f.sizes && !state.size) return null;
    const lines = [];
    let total = v[2];
    lines.push([`${f.name} — ${v[1]}${f.sizes ? `, taille ${state.size}` : ""}`, v[2]]);
    if (f.sizes) { const s = sizeById(state.size); total += s.extra; lines.push([`Taille ${s.label}`, s.extra]); }
    for (const x of CAT.extras) if (state.extras.has(x.id)) { total += x.price; lines.push([x.label, x.price]); }
    if (state.time && B.eveningSurcharge && toMin(state.time) >= toMin(B.eveningSurcharge.from)) {
      total += B.eveningSurcharge.amount; lines.push([`Rendez-vous après ${hhFr(B.eveningSurcharge.from)}`, B.eveningSurcharge.amount]);
    }
    const from = v[3] === "from" || CAT.extras.some((x) => x.from && state.extras.has(x.id));
    return { total, lines, from };
  }

  function serviceLabel() {
    const f = currentFamily(); const v = currentVariant();
    if (!f || !v) return "—";
    return `${f.name} · ${v[1]}${f.sizes && state.size ? ` · taille ${state.size}` : ""}`;
  }

  function refreshSummary() {
    const p = pricing();
    const totalTxt = p ? (p.from ? "dès " : "") + euro(p.total) : "—";
    $("[data-total]").textContent = totalTxt;
    $("[data-sum-service]").textContent = serviceLabel();
    const ex = CAT.extras.filter((x) => state.extras.has(x.id)).map((x) => x.label);
    $("[data-sum-extras]").textContent = ex.length ? ex.join(", ") : "Aucun";
    $("[data-sum-date]").textContent = state.date && state.time ? `${dateLong(state.date)}, ${hhFr(state.time)}` : state.date ? dateLong(state.date) : "—";
    $("[data-sum-total]").textContent = totalTxt;
    const note = $("[data-sum-note]");
    if (CFG.deposit.enabled && p) {
      const dep = Math.round(p.total * CFG.deposit.percent) / 100;
      note.textContent = `Acompte de ${CFG.deposit.percent} % : ${euro(dep)} pour valider, le reste (${euro(p.total - dep)}) sur place.`;
    } else note.textContent = "Paiement sur place le jour du rendez-vous.";
  }

  /* ───────── Étapes ───────── */
  let step = 1;
  function goTo(n, { focus = true } = {}) {
    step = n;
    $$("[data-step]").forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    $$("[data-step-tab]").forEach((t) => {
      const k = Number(t.dataset.stepTab);
      t.toggleAttribute("aria-current", k === n); if (k === n) t.setAttribute("aria-current", "step");
      t.classList.toggle("is-done", k < n);
    });
    if (focus) {
      const target = $(`[data-step="${n}"] legend, [data-step="${n}"] h3`) || $(`[data-step="${n}"]`);
      $("[data-booker]").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      target?.setAttribute("tabindex", "-1"); target?.focus({ preventScroll: true });
    }
    if (n === 2) renderCalendar();
  }

  /* Étape 1 */
  function buildStep1() {
    const sel = $("[data-family-select]");
    sel.append(el("option", { value: "", text: "Choisir une coiffure…" }));
    CAT.groups.forEach((g) => {
      const og = el("optgroup", { label: g.label });
      CAT.families.filter((f) => f.group === g.id).forEach((f) => og.append(el("option", { value: f.id, text: f.name })));
      sel.append(og);
    });
    sel.addEventListener("change", () => setFamily(sel.value));

    $("[data-extra-checks]").append(...CAT.extras.map((x) =>
      el("label", { class: "check" },
        el("input", { type: "checkbox", value: x.id, onchange: (e) => { e.target.checked ? state.extras.add(x.id) : state.extras.delete(x.id); refreshSummary(); } }),
        el("span", { text: x.label }),
        el("b", { text: `${x.from ? "dès " : ""}+${euro(x.price)}` })
      )
    ));

    $('[data-step="1"]').addEventListener("submit", (e) => {
      e.preventDefault();
      const f = currentFamily();
      if (!f) return flash("[data-family-select]", "Choisissez une coiffure.");
      if (!state.variant) return flash("[data-variant-chips]", `Choisissez : ${f.variantLabel.toLowerCase()}.`);
      if (f.sizes && !state.size) return flash("[data-size-chips]", "Choisissez la taille des tresses.");
      goTo(2);
    });
    setFamily("");
  }

  function setFamily(id) {
    state.family = id || null; state.variant = null; state.size = null;
    const f = currentFamily();
    $("[data-family-select]").value = id || "";
    const vChips = $("[data-variant-chips]"); vChips.replaceChildren();
    $("[data-variant-field]").hidden = !f;
    if (f) {
      $("[data-variant-label]").textContent = f.variantLabel;
      vChips.setAttribute("aria-label", f.variantLabel);
      f.variants.forEach(([vid, label, price, from], i) => {
        vChips.append(chip("variant", vid, label, `${from ? "dès " : ""}${euro(price)}`, () => { state.variant = vid; refreshSummary(); }, f.variants.length === 1 && i === 0));
      });
      if (f.variants.length === 1) state.variant = f.variants[0][0];
    }
    const sField = $("[data-size-field]"); const sChips = $("[data-size-chips]"); sChips.replaceChildren();
    sField.hidden = !(f && f.sizes);
    if (f && f.sizes) CAT.sizes.forEach((s) => sChips.append(chip("size", s.id, s.label, s.extra ? `+${euro(s.extra)}` : "sans supplément", () => { state.size = s.id; refreshSummary(); })));
    state.time = null; state.date = null;
    refreshSummary();
  }

  function chip(name, value, label, hint, onPick, checked = false) {
    return el("label", { class: "chip" },
      el("input", { type: "radio", name, value, checked, onchange: onPick }),
      el("span", {}, label, hint ? el("small", { text: hint }) : null)
    );
  }

  function flash(sel, msg) {
    const n = $(sel);
    let tip = n.parentElement.querySelector(".tip");
    if (!tip) { tip = el("p", { class: "tip form-error", role: "alert" }); n.parentElement.append(tip); }
    tip.textContent = msg;
    n.focus?.();
    n.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => tip.remove(), 4000);
  }

  function startWith(familyId) {
    setFamily(familyId);
    goTo(1);
  }

  /* ───────── Étape 2 : calendrier ───────── */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastDay = new Date(today); lastDay.setDate(lastDay.getDate() + B.maxDaysAhead);
  let viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  async function fetchBusy(monthDate) {
    const key = `${monthDate.getFullYear()}-${pad(monthDate.getMonth() + 1)}`;
    if (busyCache.has(key)) return busyCache.get(key);
    let busy = [];
    if (!DEMO) {
      const from = ymd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
      const to = ymd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1));
      const url = `${CFG.appsScriptUrl}?action=availability&from=${from}&to=${to}`;
      const res = await fetch(url, { redirect: "follow" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "availability");
      busy = data.busy.map((b) => ({ s: absMin(b.start.slice(0, 10), toMin(b.start.slice(11, 16))), e: absMin(b.end.slice(0, 10), toMin(b.end.slice(11, 16))) }));
    }
    busyCache.set(key, busy);
    return busy;
  }

  function slotsFor(dateStr, busy) {
    const d = parseYmd(dateStr);
    const h = B.hours[d.getDay()];
    if (!h) return [];
    const dur = duration();
    const now = new Date();
    const earliest = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()) / 60000 + B.minNoticeHours * 60;
    const out = [];
    for (let t = toMin(h.start); t + dur <= toMin(h.end); t += B.slotStepMinutes) {
      const s = absMin(dateStr, t), e = s + dur;
      if (s < earliest) continue;
      if (busy.some((b) => b.s < e && b.e > s)) continue;
      out.push(fromMin(t));
    }
    return out;
  }

  async function renderCalendar() {
    const grid = $("[data-cal-grid]"); const status = $("[data-cal-status]");
    $("[data-cal-month]").textContent = viewMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    $("[data-cal-prev]").disabled = viewMonth <= new Date(today.getFullYear(), today.getMonth(), 1);
    $("[data-cal-next]").disabled = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) > lastDay;

    grid.replaceChildren(...["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((d) => el("div", { class: "cal__dow", role: "columnheader", text: d })));
    status.textContent = DEMO ? "" : "Chargement des disponibilités…";

    let busy;
    try { busy = await fetchBusy(viewMonth); }
    catch { status.textContent = "Impossible de charger l'agenda pour le moment. Réessayez dans quelques instants ou contactez-nous."; return; }

    const first = new Date(viewMonth); const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(el("div"));
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    let openCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
      const ds = ymd(d);
      const inRange = d >= today && d <= lastDay;
      const slots = inRange ? slotsFor(ds, busy) : [];
      const open = slots.length > 0;
      if (open) openCount++;
      grid.append(el("button", {
        type: "button", class: `cal__day${open ? " is-open" : ""}`, disabled: !open, "aria-pressed": state.date === ds ? "true" : "false",
        "aria-label": `${dateLong(ds)}${open ? `, ${slots.length} créneau${slots.length > 1 ? "x" : ""} libre${slots.length > 1 ? "s" : ""}` : ", complet ou fermé"}`,
        text: String(day), onclick: () => pickDate(ds, slots),
      }));
    }
    status.textContent = openCount ? "Les jours marqués d'un point ont des créneaux libres." : "Plus de créneau libre ce mois-ci : regardez le mois suivant.";
    if (state.date && state.date.startsWith(ymd(viewMonth).slice(0, 7))) pickDate(state.date, slotsFor(state.date, busy), true);
  }

  function pickDate(ds, slots, keepTime = false) {
    state.date = ds;
    if (!keepTime || !slots.includes(state.time)) state.time = null;
    $$(".cal__day").forEach((b) => b.setAttribute("aria-pressed", b.getAttribute("aria-label").startsWith(dateLong(ds)) ? "true" : "false"));
    const wrap = $("[data-slots-wrap]"); wrap.hidden = false;
    const dur = duration();
    $("[data-slots-title]").textContent = `Heure d'arrivée le ${dateLong(ds)} (séance d'environ ${Math.round(dur / 60)} h)`;
    $("[data-slots]").replaceChildren(...slots.map((t) => {
      const end = fromMin(toMin(t) + dur);
      return chip("slot", t, hhFr(t), `fin vers ${hhFr(end)}`, () => { state.time = t; $("[data-slot-error]").hidden = true; $("[data-to-step3]").disabled = false; refreshSummary(); }, state.time === t);
    }));
    $("[data-to-step3]").disabled = !state.time;
    refreshSummary();
  }

  function buildStep2() {
    $("[data-cal-prev]").addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); });
    $("[data-cal-next]").addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); });
    $('[data-step="2"]').addEventListener("submit", (e) => { e.preventDefault(); if (state.date && state.time) goTo(3); });
  }

  /* ───────── Étape 3 : coordonnées + envoi ───────── */
  function buildStep3() {
    const form = $('[data-step="3"]');
    const mechesNote = $("[data-meches-note]");
    const updateMeches = () => {
      const fournies = form.elements.hairSupply.value === MECHES_FOURNIES;
      mechesNote.hidden = !fournies;
      if (fournies) mechesNote.replaceChildren(...mechesMessage());
    };
    form.addEventListener("change", (e) => { if (e.target.name === "hairSupply") updateMeches(); });
    form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false"); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("[data-form-error]"); err.hidden = true;
      const fd = new FormData(form);
      if (fd.get("website")) return; // robot
      let firstBad = null;
      for (const name of ["firstName", "lastName", "email", "phone"]) {
        const input = form.elements[name];
        const bad = !input.value.trim() || (name === "email" && !input.checkValidity()) || (name === "phone" && input.value.replace(/\D/g, "").length < 9);
        input.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad && !firstBad) firstBad = input;
      }
      if (firstBad) { err.textContent = "Vérifiez les champs entourés en rouge : prénom, nom, e-mail et téléphone sont nécessaires."; err.hidden = false; firstBad.focus(); return; }
      if (!form.elements.consent.checked) { err.textContent = "Cochez la case pour confirmer que vous avez lu les conditions de rendez-vous."; err.hidden = false; form.elements.consent.focus(); return; }

      const p = pricing();
      const payload = {
        action: "book",
        service: serviceLabel(),
        familyId: state.family, variantId: state.variant, size: state.size,
        extras: CAT.extras.filter((x) => state.extras.has(x.id)).map((x) => x.label),
        priceLines: p.lines, total: p.total, priceFrom: p.from,
        date: state.date, time: state.time, durationMinutes: duration(),
        firstName: fd.get("firstName").trim(), lastName: fd.get("lastName").trim(),
        email: fd.get("email").trim(), phone: fd.get("phone").trim(),
        hairSupply: fd.get("hairSupply"), photoUrl: (fd.get("photoUrl") || "").trim(), notes: (fd.get("notes") || "").trim(),
        deposit: CFG.deposit.enabled ? Math.round(p.total * CFG.deposit.percent) / 100 : 0,
      };

      const btn = $("[data-submit]"); btn.disabled = true; btn.textContent = "Envoi en cours…";
      try {
        let data;
        if (DEMO) { await new Promise((r) => setTimeout(r, 700)); data = { ok: true, ref: "DEMO-" + Math.random().toString(36).slice(2, 7).toUpperCase() }; }
        else {
          const res = await fetch(CFG.appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" });
          data = await res.json();
        }
        if (!data.ok) {
          if (data.error === "slot_taken") {
            busyCache.clear(); state.time = null;
            const se = $("[data-slot-error]");
            se.textContent = "Ce créneau vient d'être pris par quelqu'un d'autre. Choisissez une autre heure : vos informations sont conservées.";
            se.hidden = false; goTo(2); return;
          }
          throw new Error(data.error);
        }
        showDone(payload, data);
      } catch {
        err.textContent = `L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez, ou contactez-nous${CFG.business.whatsapp ? " sur WhatsApp" : ""}.`;
        err.hidden = false;
      } finally { btn.disabled = false; btn.textContent = "Envoyer ma demande"; }
    });
  }

  const MECHES_FOURNIES = "Mèches fournies par la coiffeuse";
  function mechesMessage() {
    const biz = CFG.business;
    const links = [];
    if (biz.whatsapp) links.push(el("a", { href: `https://wa.me/${biz.whatsapp}`, target: "_blank", rel: "noopener", text: "WhatsApp" }));
    if (biz.phoneDisplay) links.push(el("a", { href: `tel:+${biz.whatsapp || ""}`, text: biz.phoneDisplay }));
    if (biz.instagram) links.push(el("a", { href: `https://instagram.com/${biz.instagram}`, target: "_blank", rel: "noopener", text: `@${biz.instagram}` }));
    const sep = links.flatMap((a, i) => (i ? [" · ", a] : [a]));
    return [
      el("strong", { text: "Mèches fournies : sur devis. " }),
      "Le prix des mèches s'ajoute à celui de la prestation. Contactez la coiffeuse avant le rendez-vous pour choisir la couleur et la longueur, et connaître le prix",
      ...(sep.length ? [" : ", ...sep, "."] : ["."]),
    ];
  }

  function showDone(payload, data) {
    $("[data-done-title]").textContent = `Merci ${payload.firstName}, votre demande est envoyée`;
    $("[data-done-text]").textContent = DEMO
      ? "Mode démo : rien n'a été envoyé. Une fois l'agenda connecté, la cliente reçoit un e-mail de récapitulatif et le créneau est bloqué dans l'agenda."
      : `Le créneau est réservé pour vous. Vous allez recevoir un e-mail de récapitulatif à ${payload.email}, puis une confirmation définitive sous 24 h.`;
    const rows = [
      ["Référence", data.ref],
      ["Coiffure", payload.service],
      ["Suppléments", payload.extras.join(", ") || "Aucun"],
      ["Mèches", payload.hairSupply === MECHES_FOURNIES ? "Fournies par la coiffeuse, sur devis : contactez-la avant le rendez-vous" : payload.hairSupply],
      ["Date", `${dateLong(payload.date)}, ${hhFr(payload.time)}`],
      ["Prix", (payload.priceFrom ? "dès " : "") + euro(payload.total)],
    ];
    $("[data-recap]").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));

    const dep = $("[data-deposit]");
    if (CFG.deposit.enabled && payload.deposit > 0) {
      dep.hidden = false;
      const link = CFG.deposit.paypalMe ? `https://paypal.me/${CFG.deposit.paypalMe}/${payload.deposit.toFixed(2)}EUR` : null;
      dep.replaceChildren(
        el("p", {}, el("strong", { text: `Acompte à régler : ${euro(payload.deposit)}` })),
        el("p", { text: `Le rendez-vous est confirmé à réception de l'acompte. Le reste, ${euro(payload.total - payload.deposit)}, se règle sur place. Indiquez la référence ${data.ref} dans le message PayPal.` }),
        link ? el("a", { class: "btn", href: link, target: "_blank", rel: "noopener", text: `Payer ${euro(payload.deposit)} avec PayPal` }) : null
      );
    } else dep.hidden = true;
    goTo(4);
  }

  function buildMisc() {
    $$("[data-back]").forEach((b) => b.addEventListener("click", () => goTo(step - 1)));
    $("[data-restart]").addEventListener("click", () => {
      $('[data-step="3"]').reset(); $("[data-meches-note]").hidden = true; state.extras.clear(); $$("[data-extra-checks] input").forEach((i) => (i.checked = false));
      busyCache.clear(); setFamily(""); goTo(1);
    });
    if (DEMO) $("[data-demo-banner]").hidden = false;
  }

  fillBusiness();
  renderPrices();
  buildStep1();
  buildStep2();
  buildStep3();
  buildMisc();
  goTo(1, { focus: false });
})();
