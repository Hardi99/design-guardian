# C1.2.1 — Opportunités & Menaces (SWOT) — Design Guardian

> **Règle SWOT (retour prof) :** Forces/Faiblesses = **INTERNE → l'équipe / le candidat / les assets** (pas les features produit, déjà couvertes en C1.3.2/C1.6). Opportunités/Menaces = **EXTERNE → le marché**.
> Synthèse stratégique (slide 8). Les menaces renvoient aux risques détaillés en **C1.2.3**.

## Matrice 2×2

| 🟢 **FORCES** (équipe / assets) | 🔴 **FAIBLESSES** (équipe) |
|---|---|
| **Beta-testeur réel actif** (designer pro) → validation terrain | **Équipe solo** (bande passante limitée, bus factor 1) |
| **Produit livré & approuvé Figma** (mai 2026) → exécution prouvée | **Aucune compétence marketing / vente** (équipe 100% tech) |
| **Full-stack solo** (plugin · backend · IA · infra, TS bout-en-bout) | **Ressources limitées** (~2 j/sem, pas de budget) |
| **Connaissance fine du besoin** (issue du pivot SaaS→plugin terrain) | **Pas de notoriété / réseau** dans le milieu design |

| 🔵 **OPPORTUNITÉS** (marché) | 🟠 **MENACES** (marché) |
|---|---|
| **Niche délaissée** (pas de versioning géométrique natif) | Figma sort un **versioning natif** |
| **Extension à d'autres outils** : Illustrator/Photoshop via **UXP**, Sketch → marché élargi | **Rupture / changement de l'API Plugin** Figma |
| **Abstract a quitté le marché (2021)** → créneau vacant | **RGPD / AI Act** (données design + appels IA) |
| Branches trop cher (45 €) → **marché Free** + Figma Community = distribution gratuite | **Dépendance fournisseurs** (pricing OpenAI · Railway · Supabase) |

> **🔒 Sécurité** (préconisation C1.2.1) : HTTPS + `X-API-Key` · JWT/OAuth · RLS Supabase · webhooks Stripe signés.
> **🌱 Impact environnemental** : `gpt-4o-mini` (petit modèle) · propriétés natives (zéro parsing SVG lourd) · hébergement free tier.
> **🔗 Adhérences / interactions** : forte **adhérence à Figma** (le plugin vit dans Figma, dépend de l'API Plugin → tout changement impacte le produit) · dépendances externes : OpenAI · Railway · Supabase · Stripe.

---

## ✅ Ce que la grille C1.2.1 exige (les 5 éléments notés — verbatim Excel)

> Le critère est **« opportunités & menaces »** ; le SWOT n'est que l'outil. **Forces/Faiblesses ne sont PAS scorées** — mais conservées pour la lisibilité de l'outil.

| Élément exigé par la grille | Où dans la slide |
|---|---|
| **Opportunités à exploiter** | quadrant 🔵 Opportunités |
| **Points de vigilance à mettre sous contrôle** | quadrant 🟠 Menaces |
| **Impact environnemental du projet** | callout 🌱 |
| **Préconisations sur la sécurité** | callout 🔒 |
| **Impact des interactions avec d'autres projets (adhérences)** | callout 🔗 (adhérence Figma + services externes) |

> ⚠️ **Adobe XD** est en quasi-fin de vie (dev arrêté par Adobe fin 2023) → cibler **Illustrator / Photoshop** (UXP vivant), pas XD. Montre ta connaissance du marché à l'oral.

---

## Liens avec les autres compétences
- **Menaces** = risques R01 (versioning natif) · R02 (rupture API) · R04 (quota IA) → chiffrés en **C1.2.3**.
- **Features produit** (diff 0,01px, attribution, IA) → volontairement **hors SWOT** : elles sont en **C1.3.2** (comparatif) et **C1.6** (axes).
- **Opportunité Adobe/UXP** = aussi un **axe de solution long terme** (C1.6).
