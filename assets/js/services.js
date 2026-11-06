/**
 * ─────────────────────────────────────────────────────────────
 *  KITOKO's HAIR — Catalogue des prestations et des prix
 *  Prix en euros. Modifier ici met à jour la grille tarifaire
 *  ET le formulaire de réservation.
 * ─────────────────────────────────────────────────────────────
 *
 *  family = une coiffure
 *    variantLabel : nom du choix (Longueur, Formule…)
 *    variants     : [id, libellé, prix, "from" si prix « à partir de »]
 *    sizes        : true si la cliente choisit une taille S / M / L
 *    duration     : durée en minutes (sinon durée par défaut du config.js)
 */
window.KITOKO_SERVICES = {
  // Suppléments de taille (ajoutés au prix de la longueur)
  sizes: [
    { id: "S", label: "S", extra: 10 },
    { id: "M", label: "M", extra: 5 },
    { id: "L", label: "L", extra: 5 },
  ],

  groups: [
    { id: "tresses", label: "Tresses" },
    { id: "twists", label: "Twists & vanilles" },
    { id: "locs", label: "Locs" },
    { id: "nattes", label: "Nattes collées" },
    { id: "tissage", label: "Tissage" },
    { id: "homme", label: "Homme" },
  ],

  families: [
    // ── Tresses ──────────────────────────────────────────────
    {
      id: "knotless", group: "tresses", name: "Knotless braids", sizes: true,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 30], ["mi-dos", "Mi-dos", 40], ["bas-dos", "Bas du dos", 50], ["bas-fesses", "Bas des fesses", 60]],
    },
    {
      id: "fulani-braids", group: "tresses", name: "Fulani braids", sizes: true,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 30], ["mi-dos", "Mi-dos", 35], ["bas-dos", "Bas du dos", 40], ["bas-fesses", "Bas des fesses", 55]],
    },
    {
      id: "lemonade", group: "tresses", name: "Lemonade braids", sizes: true,
      variantLabel: "Formule",
      variants: [["sans-meche", "Sans mèche", 40], ["meche-incluse", "Mèches incluses", 55]],
    },

    // ── Twists & vanilles ───────────────────────────────────
    {
      id: "vanilles", group: "twists", name: "Vanilles", sizes: true,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 35], ["mi-dos", "Mi-dos", 40], ["bas-dos", "Bas du dos", 45], ["bas-fesses", "Bas des fesses", 50]],
    },
    {
      id: "fulani-twist", group: "twists", name: "Fulani twist", sizes: true,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 30], ["mi-dos", "Mi-dos", 35], ["bas-dos", "Bas du dos", 45], ["bas-fesses", "Bas des fesses", 60]],
    },
    {
      id: "marley", group: "twists", name: "Marley twist", sizes: false,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 35], ["dos", "Dos", 40], ["bas-fesses", "Bas des fesses", 50], ["meche-incluse", "Mèches incluses", 35, "from"]],
    },
    {
      id: "twist-naturels", group: "twists", name: "Twist sur cheveux naturels", sizes: false,
      variantLabel: "Formule",
      variants: [["unique", "Cheveux naturels", 20]],
    },
    {
      id: "twist-meches", group: "twists", name: "Twist avec mèches", sizes: false,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 25], ["dos", "Dos", 35]],
    },

    // ── Locs ─────────────────────────────────────────────────
    {
      id: "soft-locs", group: "locs", name: "Soft locs", sizes: true,
      variantLabel: "Longueur",
      variants: [["mi-dos", "Mi-dos", 35], ["dos", "Dos", 40], ["bas-fesses", "Bas des fesses", 45]],
    },
    {
      id: "butterfly-locs", group: "locs", name: "Butterfly locs", sizes: true,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 50], ["dos", "Dos", 60]],
    },
    {
      id: "invisible-locs", group: "locs", name: "Invisible locs", sizes: false,
      variantLabel: "Formule",
      variants: [["unique", "Toutes tailles (S, M, L)", 50]],
    },
    {
      id: "vrais-locs", group: "locs", name: "Vrais locs — resserrage", sizes: false,
      variantLabel: "Type",
      variants: [["sisterlocks", "Sisterlocks", 100], ["medium", "Medium", 75]],
    },

    // ── Nattes collées ──────────────────────────────────────
    {
      id: "nattes-rajout", group: "nattes", name: "Nattes collées avec rajout", sizes: true,
      variantLabel: "Longueur",
      variants: [["epaule", "Épaule", 20], ["mi-dos", "Mi-dos", 25], ["bas-dos", "Bas du dos", 30], ["bas-fesses", "Bas des fesses", 35]],
    },
    {
      id: "nattes-sans", group: "nattes", name: "Nattes collées sans rajout", sizes: false,
      variantLabel: "Formule",
      variants: [["unique", "Sans rajout (20 à 25 €)", 20, "from"]],
    },

    // ── Tissage ─────────────────────────────────────────────
    {
      id: "tissage", group: "tissage", name: "Tissage", sizes: false,
      variantLabel: "Formule",
      variants: [["ferme", "Fermé", 45], ["ouvert", "Ouvert", 40], ["meche-incluse", "Mèches incluses", 40, "from"]],
    },

    // ── Homme ───────────────────────────────────────────────
    {
      id: "homme", group: "homme", name: "Coiffures homme", sizes: false,
      variantLabel: "Coiffure",
      variants: [["barrel", "Barrel twist", 30], ["vanille", "Vanille", 35], ["nattes-libres", "Nattes libres", 20], ["nattes-collees", "Nattes collées", 20]],
    },
  ],

  // Suppléments à cocher
  extras: [
    { id: "koroba", label: "Koroba braids", price: 10 },
    { id: "boheme", label: "Version bohème", price: 5 },
    { id: "perles", label: "Pose des perles", price: 5 },
    { id: "shampoing", label: "Shampoing", price: 10, hint: "Si vous ne venez pas les cheveux propres" },
    { id: "demelant", label: "Démêlant", price: 5 },
    { id: "domicile", label: "Coiffure à domicile (Le Mans, bus ou tram)", price: 10, from: true },
  ],
};
