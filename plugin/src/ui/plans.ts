// Offre affichée dans le plugin. Seule la limite de checkpoints est appliquée par le serveur :
// n'annoncer en Pro que ce qui est réellement débloqué (le test l'impose).
export const PLANS: ReadonlyArray<{ plan: string; price: string; features: string[] }> = [
  { plan: 'Free', price: '0 €',       features: ['10 checkpoints', 'Diff au 0,01 px', 'Résumés IA', 'Restauration sur le canvas'] },
  { plan: 'Pro',  price: '12 €/mois', features: ['Tout ce qu\'offre Free', 'Checkpoints illimités'] },
];

// Le plugin ne connaît pas l'URL de la webapp : le backend redirige vers sa page tarifs.
export const pricingUrl = (apiBase: string) => `${apiBase}/api/link/pricing`;
