/**
 * ─────────────────────────────────────────────────────────────
 *  KITOKO's HAIR — Back-end de réservation (Google Apps Script)
 *
 *  Ce script tourne sur le compte Google de la coiffeuse. Il :
 *   • lit son Google Agenda pour donner les créneaux libres au site ;
 *   • crée le rendez-vous dans l'agenda (en attente, puis confirmé) ;
 *   • envoie les e-mails à la cliente et à la coiffeuse ;
 *   • gère la confirmation, le refus et l'annulation (règle des 72 h).
 *
 *  Installation : voir README.md, étape 2.
 * ─────────────────────────────────────────────────────────────
 */

const CONFIG = {
  BUSINESS_NAME: "KITOKO's HAIR",
  // Adresse du site publié (GitHub Pages)
  SITE_URL: "https://dokceles.github.io/Kitokos-hair/",
  // "primary" = agenda principal du compte. Sinon, l'ID d'un agenda dédié
  // (Agenda Google > Paramètres de l'agenda > Intégrer l'agenda > ID de l'agenda).
  CALENDAR_ID: "primary",
  // E-mail qui reçoit les nouvelles demandes. Vide = le compte qui déploie le script.
  OWNER_EMAIL: "",
  TIMEZONE: "Europe/Paris",

  // Doit correspondre à assets/js/config.js
  MIN_NOTICE_HOURS: 24,
  MAX_DAYS_AHEAD: 60,
  MIN_DURATION_MINUTES: 30,
  MAX_DURATION_MINUTES: 600,
  OPEN_HOURS: {          // 0 = dimanche … 6 = samedi
    0: null,
    1: ["09:00", "18:00"],
    2: ["09:00", "18:00"],
    3: ["09:00", "18:00"],
    4: ["09:00", "18:00"],
    5: ["09:00", "18:00"],
    6: ["09:00", "18:00"],
  },

  FREE_CANCEL_HOURS: 72,
  // Acompte (facultatif, doit correspondre à config.js)
  DEPOSIT_PAYPAL_ME: "",        // ex. "kitokoshair"
  DEPOSIT_LATE_PENALTY_PERCENT: 5,
};

/* ═════════════════════════ Points d'entrée ═════════════════════════ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case "availability": return json(getAvailability_(p.from, p.to));
      case "confirm":      return adminAction_(p, "confirm");
      case "decline":      return adminAction_(p, "decline");
      case "cancel":       return clientCancel_(p);
      default:             return json({ ok: true, service: CONFIG.BUSINESS_NAME });
    }
  } catch (err) {
    console.error(err);
    return p.action === "availability" ? json({ ok: false, error: "server" }) : page_("Une erreur est survenue", "<p>Réessayez dans quelques minutes.</p>");
  }
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_request" }); }
  if (data.action !== "book") return json({ ok: false, error: "bad_request" });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return json(book_(data));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: err.code || "server" });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ═════════════════════════ Disponibilités ═════════════════════════ */

function getAvailability_(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: "bad_dates" };
  const start = parseLocal_(from, "00:00");
  let end = parseLocal_(to, "00:00");
  const maxEnd = new Date(start.getTime() + 62 * 86400000);
  if (end > maxEnd) end = maxEnd;

  const cacheKey = "busy_" + from + "_" + to;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const busy = calendar_().getEvents(start, end).map(function (ev) {
    const s = ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime();
    const en = ev.isAllDayEvent() ? ev.getAllDayEndDate() : ev.getEndTime();
    return { start: fmt_(s, "yyyy-MM-dd'T'HH:mm"), end: fmt_(en, "yyyy-MM-dd'T'HH:mm") };
  });
  const out = { ok: true, tz: CONFIG.TIMEZONE, busy: busy };
  cache.put(cacheKey, JSON.stringify(out), 60);
  return out;
}

/* ═════════════════════════ Réservation ═════════════════════════ */

function book_(d) {
  // Anti-robot : champ invisible rempli
  if (d.website) return { ok: false, error: "bad_request" };

  const req = ["firstName", "lastName", "email", "phone", "service", "date", "time"];
  for (let i = 0; i < req.length; i++) if (!d[req[i]] || String(d[req[i]]).trim() === "") return { ok: false, error: "missing_" + req[i] };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { ok: false, error: "bad_email" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) return { ok: false, error: "bad_dates" };

  const duration = Math.max(CONFIG.MIN_DURATION_MINUTES, Math.min(CONFIG.MAX_DURATION_MINUTES, Number(d.durationMinutes) || 360));
  const start = parseLocal_(d.date, d.time);
  const end = new Date(start.getTime() + duration * 60000);
  const now = new Date();

  // Règles d'ouverture
  const dow = Number(fmt_(start, "u")) % 7; // u : 1 = lundi … 7 = dimanche
  const hours = CONFIG.OPEN_HOURS[dow];
  if (!hours) return { ok: false, error: "closed" };
  const startMin = toMin_(d.time), endMin = startMin + duration;
  if (startMin < toMin_(hours[0]) || endMin > toMin_(hours[1])) return { ok: false, error: "closed" };
  if (start.getTime() - now.getTime() < CONFIG.MIN_NOTICE_HOURS * 3600000) return { ok: false, error: "too_soon" };
  if (start.getTime() - now.getTime() > (CONFIG.MAX_DAYS_AHEAD + 1) * 86400000) return { ok: false, error: "too_far" };

  // Le créneau est-il toujours libre ?
  const cal = calendar_();
  if (cal.getEvents(start, end).length > 0) return { ok: false, error: "slot_taken" };

  const c = clean_(d);
  const ref = "KH-" + fmt_(start, "yyMMdd") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const token = Utilities.getUuid();
  const priceTxt = (c.priceFrom ? "dès " : "") + euro_(c.total);

  const ev = cal.createEvent("⏳ " + c.firstName + " " + c.lastName + " — " + c.service, start, end, {
    description: eventDescription_(c, ref, priceTxt, null),
  });
  ev.setColor(CalendarApp.EventColor.YELLOW);
  ev.setTag("kh_ref", ref);
  ev.setTag("kh_token", token);
  ev.setTag("kh_status", "pending");
  ev.setTag("kh_email", c.email);
  ev.setTag("kh_name", c.firstName);
  ev.setTag("kh_deposit", String(c.deposit || 0));
  const id = ev.getId();
  ev.setDescription(eventDescription_(c, ref, priceTxt, id));
  clearMonthCache_(start);

  const cancelUrl = scriptUrl_() + "?action=cancel&id=" + encodeURIComponent(id) + "&t=" + token;
  sendClientReceived_(c, ref, start, end, priceTxt, cancelUrl);
  sendOwnerNew_(c, ref, start, end, priceTxt, id);

  return { ok: true, ref: ref };
}

/* ═════════════════════════ Actions coiffeuse ═════════════════════════ */

function adminAction_(p, action) {
  if (!p.key || p.key !== adminKey_()) return page_("Lien invalide", "<p>Ce lien de gestion n'est pas valide.</p>");
  const ev = findEvent_(p.id);
  if (!ev) return page_("Rendez-vous introuvable", "<p>Ce rendez-vous a déjà été annulé ou supprimé de l'agenda.</p>");

  const status = ev.getTag("kh_status");
  const name = ev.getTag("kh_name");
  const when = whenText_(ev.getStartTime());
  const verb = action === "confirm" ? "Confirmer" : "Refuser";

  // Étape 1 : page de vérification (évite les clics automatiques des filtres anti-spam)
  if (p.go !== "1") {
    const go = scriptUrl_() + "?action=" + action + "&id=" + encodeURIComponent(p.id) + "&key=" + encodeURIComponent(p.key) + "&go=1";
    return page_(verb + " le rendez-vous de " + esc_(name) + " ?",
      "<p>" + esc_(ev.getTitle().replace(/^\S+\s/, "")) + "<br>" + esc_(when) + "</p>" +
      (status !== "pending" ? "<p>Statut actuel : <b>" + statusFr_(status) + "</b>.</p>" : "") +
      button_(go, verb));
  }

  if (action === "confirm") {
    if (status === "confirmed") return page_("Déjà confirmé", "<p>Ce rendez-vous était déjà confirmé.</p>");
    ev.setTitle(ev.getTitle().replace(/^⏳\s*/, "✅ "));
    ev.setColor(CalendarApp.EventColor.GREEN);
    ev.setTag("kh_status", "confirmed");
    sendClientConfirmed_(ev);
    return page_("Rendez-vous confirmé", "<p>" + esc_(name) + " vient de recevoir un e-mail de confirmation.</p>");
  }

  // Refus : le créneau est libéré
  sendClientDeclined_(ev);
  clearMonthCache_(ev.getStartTime());
  ev.deleteEvent();
  return page_("Rendez-vous refusé", "<p>Le créneau est de nouveau libre et " + esc_(name) + " a été prévenue par e-mail.</p>");
}

/* ═════════════════════════ Annulation cliente ═════════════════════════ */

function clientCancel_(p) {
  const ev = findEvent_(p.id);
  if (!ev || !p.t || ev.getTag("kh_token") !== p.t) {
    return page_("Rendez-vous introuvable", "<p>Ce rendez-vous a déjà été annulé, ou le lien n'est plus valide. Pour toute question, contactez " + esc_(CONFIG.BUSINESS_NAME) + ".</p>");
  }
  const start = ev.getStartTime();
  const hoursLeft = (start.getTime() - Date.now()) / 3600000;
  if (hoursLeft <= 0) return page_("Rendez-vous passé", "<p>Ce rendez-vous est déjà passé.</p>");

  const deposit = Number(ev.getTag("kh_deposit") || 0);
  const free = hoursLeft >= CONFIG.FREE_CANCEL_HOURS;
  let rule;
  if (free) rule = "Vous annulez plus de " + CONFIG.FREE_CANCEL_HOURS + " h avant : l'annulation est gratuite" + (deposit ? " et votre acompte vous sera remboursé intégralement." : ".");
  else if (deposit) {
    const kept = Math.round(deposit * CONFIG.DEPOSIT_LATE_PENALTY_PERCENT) / 100;
    rule = "Vous annulez moins de " + CONFIG.FREE_CANCEL_HOURS + " h avant : " + CONFIG.DEPOSIT_LATE_PENALTY_PERCENT + " % de l'acompte (" + euro_(kept) + ") est retenu, " + euro_(deposit - kept) + " vous seront remboursés.";
  } else rule = "Vous annulez moins de " + CONFIG.FREE_CANCEL_HOURS + " h avant le rendez-vous. Merci de prévenir dès que possible la prochaine fois.";

  if (p.go !== "1") {
    const go = scriptUrl_() + "?action=cancel&id=" + encodeURIComponent(p.id) + "&t=" + encodeURIComponent(p.t) + "&go=1";
    return page_("Annuler votre rendez-vous ?",
      "<p>" + esc_(whenText_(start)) + "</p><p>" + esc_(rule) + "</p>" + button_(go, "Oui, annuler mon rendez-vous"));
  }

  const name = ev.getTag("kh_name");
  const email = ev.getTag("kh_email");
  const ref = ev.getTag("kh_ref");
  const title = ev.getTitle().replace(/^\S+\s/, "");
  clearMonthCache_(start);
  ev.deleteEvent();

  mail_(email, "Rendez-vous annulé — " + ref,
    "<p>Bonjour " + esc_(name) + ",</p><p>Votre rendez-vous du <b>" + esc_(whenText_(start)) + "</b> est bien annulé.</p><p>" + esc_(rule) + "</p>" +
    "<p>Vous pouvez reprendre rendez-vous à tout moment :</p>" + button_(CONFIG.SITE_URL + "#reserver", "Réserver une nouvelle date"));
  mail_(ownerEmail_(), "❌ Annulation : " + title + " (" + whenText_(start) + ")",
    "<p><b>" + esc_(title) + "</b> a annulé son rendez-vous du <b>" + esc_(whenText_(start)) + "</b> (réf. " + esc_(ref) + ").</p><p>" + esc_(rule) + "</p><p>Le créneau est de nouveau libre sur le site.</p>");

  return page_("Rendez-vous annulé", "<p>C'est fait, un e-mail de confirmation vient de vous être envoyé.</p><p>" + esc_(rule) + "</p>");
}

/* ═════════════════════════ E-mails ═════════════════════════ */

function sendClientReceived_(c, ref, start, end, priceTxt, cancelUrl) {
  let depositHtml = "";
  if (c.deposit > 0) {
    const link = CONFIG.DEPOSIT_PAYPAL_ME ? "https://paypal.me/" + CONFIG.DEPOSIT_PAYPAL_ME + "/" + c.deposit.toFixed(2) + "EUR" : "";
    depositHtml = "<p><b>Acompte à régler : " + euro_(c.deposit) + "</b>. Le rendez-vous est confirmé à réception. Indiquez la référence " + esc_(ref) + " dans le message.</p>" +
      (link ? button_(link, "Payer l'acompte avec PayPal") : "");
  }
  mail_(c.email, "Votre demande de rendez-vous — " + ref,
    "<p>Bonjour " + esc_(c.firstName) + ",</p>" +
    "<p>Merci pour votre réservation ! Le créneau est bloqué pour vous. Vous recevrez une confirmation définitive sous 24 h.</p>" +
    recapTable_([
      ["Référence", ref], ["Coiffure", c.service], ["Suppléments", c.extras.join(", ") || "Aucun"],
      ["Date", whenText_(start)], ["Durée", "environ " + Math.round((end - start) / 3600000) + " h"], ["Prix", priceTxt],
    ]) + depositHtml +
    "<h3 style='font-size:16px;margin:24px 0 8px'>Pour le jour J</h3><ul style='padding-left:18px;margin:0'>" +
    "<li>Venez avec les cheveux propres (sinon shampoing facturé 10 €) et déjà décoiffés.</li>" +
    "<li>Retard : 5 € par tranche de 15 minutes.</li>" +
    "<li>Annulation gratuite jusqu'à " + CONFIG.FREE_CANCEL_HOURS + " h avant le rendez-vous.</li></ul>" +
    "<p style='margin-top:24px'>Un empêchement ? Annulez en un clic :</p>" + button_(cancelUrl, "Annuler mon rendez-vous", true));
}

function sendOwnerNew_(c, ref, start, end, priceTxt, id) {
  const base = scriptUrl_() + "?id=" + encodeURIComponent(id) + "&key=" + encodeURIComponent(adminKey_());
  const wa = c.phone.replace(/\D/g, "").replace(/^0/, "33");
  mail_(ownerEmail_(), "🗓️ Nouvelle demande : " + c.firstName + " " + c.lastName + " — " + whenText_(start),
    "<p>Nouvelle demande de rendez-vous. Elle est déjà bloquée dans l'agenda (en jaune) en attendant ta confirmation.</p>" +
    recapTable_([
      ["Cliente", c.firstName + " " + c.lastName], ["Téléphone", c.phone], ["E-mail", c.email],
      ["Coiffure", c.service], ["Suppléments", c.extras.join(", ") || "Aucun"], ["Mèches", c.hairSupply || "—"],
      ["Date", whenText_(start) + " → " + fmt_(end, "HH:mm")], ["Prix", priceTxt + (c.deposit ? " (acompte attendu : " + euro_(c.deposit) + ")" : "")],
      ["Photo du modèle", c.photoUrl || "—"], ["Message", c.notes || "—"], ["Référence", ref],
    ]) +
    "<p style='margin-top:24px'>" + button_(base + "&action=confirm", "Confirmer le rendez-vous") + "&nbsp; " + button_(base + "&action=decline", "Refuser et libérer le créneau", true) + "</p>" +
    "<p style='font-size:13px;color:#5B3F5E'>Contacter la cliente : <a href='https://wa.me/" + wa + "'>WhatsApp</a> · <a href='tel:" + esc_(c.phone) + "'>Appeler</a></p>",
    c.email);
}

function sendClientConfirmed_(ev) {
  mail_(ev.getTag("kh_email"), "Rendez-vous confirmé ✅ — " + ev.getTag("kh_ref"),
    "<p>Bonjour " + esc_(ev.getTag("kh_name")) + ",</p><p>Votre rendez-vous est <b>confirmé</b> : <b>" + esc_(whenText_(ev.getStartTime())) + "</b>.</p>" +
    "<p>Pensez à venir avec les cheveux propres et décoiffés. À très vite !</p>" +
    "<p>Un empêchement ? Utilisez le lien d'annulation de votre premier e-mail.</p>");
}

function sendClientDeclined_(ev) {
  mail_(ev.getTag("kh_email"), "Votre demande de rendez-vous — " + ev.getTag("kh_ref"),
    "<p>Bonjour " + esc_(ev.getTag("kh_name")) + ",</p><p>Désolée, le créneau du <b>" + esc_(whenText_(ev.getStartTime())) + "</b> n'est finalement pas disponible.</p>" +
    "<p>Choisissez une autre date sur le site, elle sera traitée en priorité :</p>" + button_(CONFIG.SITE_URL + "#reserver", "Choisir une autre date"));
}

/* ═════════════════════════ Outils ═════════════════════════ */

function setup() {
  // À lancer UNE fois depuis l'éditeur Apps Script (bouton Exécuter) pour autoriser le script.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_KEY")) props.setProperty("ADMIN_KEY", Utilities.getUuid().replace(/-/g, ""));
  const cal = calendar_();
  console.log("Agenda connecté : " + cal.getName());
  console.log("E-mails envoyés à : " + ownerEmail_());
  console.log("Quota e-mails restant aujourd'hui : " + MailApp.getRemainingDailyQuota());
  console.log("Tout est prêt. Déployez maintenant le script en « Application Web ».");
}

function calendar_() {
  const cal = CONFIG.CALENDAR_ID === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error("Agenda introuvable : vérifiez CALENDAR_ID");
  return cal;
}
function clearMonthCache_(date) {
  // Le site demande les disponibilités mois par mois : on vide le cache du mois concerné
  const y = Number(fmt_(date, "yyyy")), m = Number(fmt_(date, "M"));
  const from = y + "-" + ("0" + m).slice(-2) + "-01";
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const to = ny + "-" + ("0" + nm).slice(-2) + "-01";
  CacheService.getScriptCache().remove("busy_" + from + "_" + to);
}
function findEvent_(id) { try { return id ? calendar_().getEventById(id) : null; } catch (e) { return null; } }
function adminKey_() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty("ADMIN_KEY");
  if (!k) { k = Utilities.getUuid().replace(/-/g, ""); props.setProperty("ADMIN_KEY", k); }
  return k;
}
function ownerEmail_() { return CONFIG.OWNER_EMAIL || Session.getEffectiveUser().getEmail(); }
function scriptUrl_() { return ScriptApp.getService().getUrl(); }

function parseLocal_(dateStr, hhmm) { return Utilities.parseDate(dateStr + " " + hhmm, CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm"); }
function fmt_(date, pattern) { return Utilities.formatDate(date, CONFIG.TIMEZONE, pattern); }
function toMin_(hhmm) { const p = hhmm.split(":"); return Number(p[0]) * 60 + Number(p[1]); }

function whenText_(date) {
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const dow = Number(fmt_(date, "u")) % 7;
  const h = Number(fmt_(date, "H")), m = fmt_(date, "mm");
  return days[dow] + " " + Number(fmt_(date, "d")) + " " + months[Number(fmt_(date, "M")) - 1] + " à " + h + " h" + (m === "00" ? "" : " " + m);
}
function euro_(n) { return (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0).replace(".", ",") + " €"; }
function statusFr_(s) { return { pending: "en attente", confirmed: "confirmé" }[s] || s; }

function clean_(d) {
  const s = function (v, max) { return String(v == null ? "" : v).trim().slice(0, max || 200); };
  return {
    firstName: s(d.firstName, 60), lastName: s(d.lastName, 60), email: s(d.email, 120), phone: s(d.phone, 30),
    service: s(d.service, 160), extras: (Array.isArray(d.extras) ? d.extras : []).slice(0, 10).map(function (x) { return s(x, 80); }),
    total: Math.max(0, Number(d.total) || 0), priceFrom: !!d.priceFrom, deposit: Math.max(0, Number(d.deposit) || 0),
    hairSupply: s(d.hairSupply, 80), photoUrl: /^https?:\/\//.test(s(d.photoUrl)) ? s(d.photoUrl, 300) : "", notes: s(d.notes, 1000),
  };
}

function eventDescription_(c, ref, priceTxt, id) {
  const lines = [
    "Réf. " + ref, "Cliente : " + c.firstName + " " + c.lastName, "Téléphone : " + c.phone, "E-mail : " + c.email,
    "Coiffure : " + c.service, "Suppléments : " + (c.extras.join(", ") || "aucun"), "Mèches : " + (c.hairSupply || "—"),
    "Prix : " + priceTxt + (c.deposit ? " (acompte " + euro_(c.deposit) + ")" : ""),
    "Photo : " + (c.photoUrl || "—"), "Message : " + (c.notes || "—"),
  ];
  if (id) {
    const base = scriptUrl_() + "?id=" + encodeURIComponent(id) + "&key=" + encodeURIComponent(adminKey_());
    lines.push("", "Confirmer : " + base + "&action=confirm", "Refuser : " + base + "&action=decline");
  }
  return lines.join("\n");
}

function mail_(to, subject, inner, replyTo) {
  const html =
    "<div style='background:#FBF6F9;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#24102B'>" +
    "<div style='max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2CFDB;border-radius:16px;overflow:hidden'>" +
    "<div style='background:#24102B;color:#fff;padding:18px 24px;font-weight:700;font-size:18px'>" + esc_(CONFIG.BUSINESS_NAME) + "</div>" +
    "<div style='padding:24px;font-size:15px;line-height:1.55'>" + inner + "</div></div>" +
    "<p style='text-align:center;font-size:12px;color:#5B3F5E;margin-top:16px'><a style='color:#5B3F5E' href='" + CONFIG.SITE_URL + "'>" + esc_(CONFIG.SITE_URL.replace(/^https?:\/\//, "")) + "</a></p></div>";
  const opts = { to: to, subject: subject, htmlBody: html, name: CONFIG.BUSINESS_NAME };
  if (replyTo) opts.replyTo = replyTo; else if (to !== ownerEmail_()) opts.replyTo = ownerEmail_();
  MailApp.sendEmail(opts);
}

function recapTable_(rows) {
  return "<table style='border-collapse:collapse;width:100%;margin:16px 0'>" + rows.map(function (r) {
    return "<tr><td style='padding:7px 12px 7px 0;color:#5B3F5E;vertical-align:top;white-space:nowrap'>" + esc_(r[0]) +
      "</td><td style='padding:7px 0;font-weight:600'>" + linkify_(esc_(String(r[1]))) + "</td></tr>";
  }).join("") + "</table>";
}
function button_(url, label, ghost) {
  const style = ghost
    ? "display:inline-block;padding:11px 20px;border:2px solid #24102B;border-radius:999px;color:#24102B;text-decoration:none;font-weight:700"
    : "display:inline-block;padding:11px 20px;border:2px solid #C42A63;background:#C42A63;border-radius:999px;color:#fff;text-decoration:none;font-weight:700";
  return "<a target='_top' href='" + esc_(url) + "' style='" + style + "'>" + esc_(label) + "</a>";
}
function page_(title, inner) {
  return HtmlService.createHtmlOutput(
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<div style='font-family:Helvetica,Arial,sans-serif;color:#24102B;background:#FBF6F9;min-height:100vh;padding:40px 16px'>" +
    "<div style='max-width:520px;margin:0 auto;background:#fff;border:1px solid #E2CFDB;border-radius:16px;padding:28px'>" +
    "<p style='font-weight:700;color:#C42A63;margin:0 0 12px'>" + esc_(CONFIG.BUSINESS_NAME) + "</p>" +
    "<h1 style='font-size:22px;margin:0 0 16px'>" + title + "</h1><div style='font-size:15px;line-height:1.6'>" + inner + "</div>" +
    "<p style='margin-top:28px'><a target='_top' style='color:#5B3F5E' href='" + CONFIG.SITE_URL + "'>Retour au site</a></p></div></div>"
  ).setTitle(CONFIG.BUSINESS_NAME).addMetaTag("viewport", "width=device-width, initial-scale=1");
}
function esc_(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
function linkify_(s) { return s.replace(/(https?:\/\/[^\s<]+)/g, "<a href='$1'>$1</a>"); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
