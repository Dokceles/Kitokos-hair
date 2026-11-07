/**
 * ─────────────────────────────────────────────────────────────
 *  KITOKO's HAIR — Réglages du site
 *  C'est le SEUL fichier à modifier pour personnaliser le site.
 * ─────────────────────────────────────────────────────────────
 */
window.KITOKO_CONFIG = {
  business: {
    name: "KITOKO's HAIR",
    city: "Le Mans",
    // Numéro affiché sur le site (format international pour WhatsApp, sans + ni espaces)
    phoneDisplay: "06 00 00 00 00",
    whatsapp: "33600000000",
    instagram: "kitoko_hair_officiel", // sans le @
    email: "contact@exemple.fr",
  },

  /**
   * URL de l'application Web Google Apps Script (voir README, étape 2).
   * Tant qu'elle est vide, le site tourne en MODE DÉMO :
   * tous les créneaux sont libres et aucune réservation n'est envoyée.
   */
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbxa27PaAQhDbkbBQyxzPyovQv_VdxWmRE2jKLDIjwNei9o15KdnN8WxhxeiH1_n3gAy/exec",

  booking: {
    // Durée bloquée dans l'agenda pour une séance (en minutes) : 6 h
    defaultDurationMinutes: 360,
    // Pas entre deux heures de début proposées (en minutes)
    slotStepMinutes: 60,
    // Délai minimum avant un rendez-vous (en heures)
    minNoticeHours: 24,
    // Jusqu'à combien de jours à l'avance on peut réserver
    maxDaysAhead: 60,
    // Horaires d'ouverture par jour (0 = dimanche … 6 = samedi). null = fermé.
    // Un rendez-vous doit COMMENCER et SE TERMINER dans ces horaires.
    hours: {
      0: { start: "09:00", end: "18:00" },
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
      6: { start: "09:00", end: "18:00" },
    },
    // Supplément automatique pour un rendez-vous qui commence à partir de 17 h
    eveningSurcharge: { from: "17:00", amount: 10 },
    // Délai d'annulation gratuite (en heures)
    freeCancellationHours: 72,
  },

  /**
   * Acompte en ligne (facultatif).
   * enabled: false → la cliente voit le prix total et paie sur place.
   * enabled: true  → le récapitulatif affiche l'acompte et un bouton PayPal.me
   *                  pré-rempli avec le bon montant.
   */
  deposit: {
    enabled: false,
    percent: 30,
    paypalMe: "", // ex. "kitokoshair" pour https://paypal.me/kitokoshair
    lateCancellationPenaltyPercent: 5, // retenu sur l'acompte si annulation < 72 h
  },
};
