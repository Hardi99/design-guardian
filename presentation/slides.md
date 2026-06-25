---
theme: default
background: '#041018'
highlighter: shiki
lineNumbers: false
fonts:
  sans: Inter
  mono: JetBrains Mono
mermaid:
  theme: dark
  themeVariables:
    darkMode: true
    background: '#041018'
    primaryColor: '#071a2e'
    primaryTextColor: '#f0f9ff'
    primaryBorderColor: '#0d2d47'
    lineColor: '#5c8aa8'
    secondaryColor: '#0b2236'
    fontFamily: 'Inter, sans-serif'
transition: fade
title: Design Guardian — M2 Expert Développement Logiciel
author: Hardi Tabuna
exportFilename: design-guardian
---

<div class="h-full flex flex-col justify-center">
  <div class="flex items-center gap-4 mb-8">
    <div class="dg-logo lg">DG</div>
    <div>
      <div class="tag tag-purple mb-2">Plugin Figma · Soutenance BC01 — Cadrage de projet</div>
    </div>
  </div>

  <h1 class="text-6xl mb-4">Design Guardian</h1>
  <p class="text-xl" style="color: #9ca3af; max-width: 540px; line-height: 1.5">
    Le contrôle de version pour les designers Figma.<br>
    Précision 0.01px. Attribution par élément. IA embarquée.
  </p>

  <div class="flex items-center gap-6 mt-12">
    <div style="color: #7fb8d0; font-size: 0.85rem"><strong style="color:#f0f9ff">Hardi Tabuna</strong> — Candidat</div>
    <div style="color: #1f2937">·</div>
    <div style="color: #4b5563; font-size: 0.8rem">Expert en Développement Logiciel — RNCP 39583</div>
    <div style="color: #1f2937">·</div>
    <div style="color: #4b5563; font-size: 0.8rem">Juin 2026</div>
  </div>
</div>

---
layout: center
---

<h1 class="text-center mb-2">Sommaire</h1>
<p class="text-center mb-8" style="color:#6b7280">Bloc 1 — Cadrer un projet de développement d'applications logicielles</p>

<div class="grid grid-cols-2 gap-x-10 gap-y-3 max-w-3xl mx-auto">
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">01</span><span class="text-sm" style="color:#a8cfe0">Présentation & compétences visées</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">07</span><span class="text-sm" style="color:#a8cfe0">Démarche d'amélioration & terrain</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">02</span><span class="text-sm" style="color:#a8cfe0">Un projet réel — pas un exercice</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-blue" style="flex-shrink:0">08</span><span class="text-sm" style="color:#a8cfe0">Architecture logicielle · C1.5</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">03</span><span class="text-sm" style="color:#a8cfe0">Cartographie des acteurs · C1.1.1</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-blue" style="flex-shrink:0">09</span><span class="text-sm" style="color:#a8cfe0">Charge & budget · C1.4</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">04</span><span class="text-sm" style="color:#a8cfe0">Processus de cadrage · C1.2.2</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-amber" style="flex-shrink:0">10</span><span class="text-sm" style="color:#a8cfe0">Cartographie des risques · C1.2.3</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">05</span><span class="text-sm" style="color:#a8cfe0">Problème identifié · C1.1.2</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-amber" style="flex-shrink:0">11</span><span class="text-sm" style="color:#a8cfe0">Veille & comparatif · C1.3</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-purple" style="flex-shrink:0">06</span><span class="text-sm" style="color:#a8cfe0">La solution répond au problème · C1.6</span></div>
  <div class="flex items-center gap-3"><span class="tag tag-green" style="flex-shrink:0">12</span><span class="text-sm" style="color:#a8cfe0">Démo live</span></div>
</div>

---
layout: center
---

<h1 class="text-center mb-2">Compétences du Bloc 1 — à l'identique</h1>
<p class="text-center mb-6" style="color:#6b7280">Cadrer un projet de développement d'applications logicielles · RNCP 39583 — chaque compétence est couverte et localisée dans la présentation</p>

<table class="comp-table max-w-4xl mx-auto" style="font-size:0.72rem">
  <thead>
    <tr><th style="width:14%">Compétence</th><th style="width:44%">Intitulé officiel</th><th style="width:26%">Livrable attendu</th><th style="width:16%">Couvert</th></tr>
  </thead>
  <tbody>
    <tr><td><strong style="color:#67e8f9">C1.1.1</strong></td><td>Cartographier les acteurs du projet et leurs rôles</td><td>Cartographie des parties prenantes</td><td class="check">Slide 05</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.1.2</strong></td><td>Analyser la demande et le besoin du commanditaire</td><td>Présentation de l'analyse de la demande</td><td class="check">Slide 07</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.2.1</strong></td><td>Cartographier les opportunités et les menaces</td><td>Cartographie opportunités / menaces</td><td class="check">Risques + Comparatif</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.2.2</strong></td><td>Évaluer la faisabilité technique</td><td>Démarche d'audit + diagnostic de l'existant</td><td class="check">Slide 06</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.2.3</strong></td><td>Cartographier les risques techniques & fonctionnels</td><td>Cartographie des risques + référentiel + indicateurs</td><td class="check">Slide 13</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.3.1</strong></td><td>Réaliser une veille technique, technologique & réglementaire</td><td>Méthodologie de veille + sources</td><td class="check">Slide 14</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.3.2</strong></td><td>Sélectionner l'architecture technique (étude comparative)</td><td>Étude comparative des solutions</td><td class="check">Slide 14 + Archi</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.4.1</strong></td><td>Évaluer la charge de travail</td><td>Cahier des charges fonctionnel + estimation (j-h)</td><td class="check">Slide 12</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.4.2</strong></td><td>Estimer le coût du projet</td><td>Budget prévisionnel</td><td class="check">Slide 12</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.5</strong></td><td>Modéliser une architecture logicielle</td><td>Schémas de l'architecture logicielle</td><td class="check">Slide 11</td></tr>
    <tr><td><strong style="color:#67e8f9">C1.6</strong></td><td>Proposer les axes de solutions au client</td><td>Préconisation + argumentaire</td><td class="check">Slide 08 + Démo</td></tr>
  </tbody>
</table>

---
layout: center
---

<h1 class="text-center mb-2">Un projet réel — pas un exercice</h1>
<p class="text-center mb-10" style="color:#6b7280">Design Guardian répond à un besoin concret et a déjà un utilisateur en production</p>

<div class="grid grid-cols-3 gap-5 max-w-3xl mx-auto">
  <div class="card">
    <div class="tag tag-purple mb-2">Commanditaire</div>
    <div class="text-sm font-semibold text-white mb-1">Double objectif</div>
    <div class="text-xs" style="color:#9ca3af">Valider le titre M2 <strong>et</strong> lancer un produit commercialisable — pas une maquette jetable.</div>
  </div>
  <div class="card" style="border-color:rgba(52,211,153,0.3);background:rgba(52,211,153,0.05)">
    <div class="tag tag-green mb-2">En production ✅</div>
    <div class="text-sm font-semibold text-white mb-1">Publié sur Figma Community</div>
    <div class="text-xs" style="color:#9ca3af">Plugin approuvé · mai 2026. Backend live sur Railway, BDD Supabase.</div>
  </div>
  <div class="card" style="border-color:rgba(34,211,238,0.3);background:rgba(34,211,238,0.05)">
    <div class="tag tag-blue mb-2">Early adopter</div>
    <div class="text-sm font-semibold text-white mb-1">Designer pro actif</div>
    <div class="text-xs" style="color:#9ca3af">Designer UX/UI indépendant qui teste en conditions réelles et fait remonter du feedback terrain.</div>
  </div>
</div>

<div class="mt-6 p-3 rounded-lg max-w-3xl mx-auto text-center" style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.2)">
  <span class="text-sm" style="color:#67e8f9">Le cadrage qui suit n'est pas théorique : il est validé par un utilisateur réel et un produit en ligne.</span>
</div>

---
layout: center
---

<div class="tag tag-purple mb-3" style="margin-left:auto;margin-right:auto;display:table">C1.1.1 — Cartographier les acteurs du projet</div>
<h1 class="text-center mb-8">Cartographie des acteurs</h1>

<div class="grid grid-cols-2 gap-5 max-w-3xl mx-auto">
  <div class="card" style="border-color:rgba(248,113,113,0.3);background:rgba(248,113,113,0.05)">
    <div class="tag" style="background:rgba(248,113,113,0.15);color:#f87171;margin-bottom:0.5rem">Gérer de près — Q1</div>
    <div class="flex flex-col gap-1.5">
      <div class="text-sm"><span class="font-semibold text-white">Jury M2</span> <span style="color:#9ca3af">— valide RNCP 39583 · oral juin 2026</span></div>
      <div class="text-sm"><span class="font-semibold text-white">Early adopter ✅</span> <span style="color:#9ca3af">— designer UX/UI indépendant · actif mai 2026</span></div>
    </div>
  </div>
  <div class="card" style="border-color:rgba(34,211,238,0.3);background:rgba(34,211,238,0.05)">
    <div class="tag tag-purple mb-2">Satisfaire — Q2</div>
    <div class="flex flex-col gap-1.5">
      <div class="text-sm"><span class="font-semibold text-white">Commanditaire formation</span> <span style="color:#9ca3af">— livrables BC01–BC04</span></div>
      <div class="text-sm"><span class="font-semibold text-white">Figma Platform</span> <span style="color:#9ca3af">— Plugin Store · approuvé mai 2026 ✅</span></div>
      <div class="text-sm"><span class="font-semibold text-white">Figma Branches</span> <span style="color:#9ca3af">— concurrent à 45 $/mois/user</span></div>
    </div>
  </div>
  <div class="card">
    <div class="tag tag-amber mb-2">Informer — Q4</div>
    <div class="flex flex-col gap-1.5">
      <div class="text-sm"><span class="font-semibold text-white">UX / Packaging Designers</span> <span style="color:#9ca3af">— utilisateurs finaux</span></div>
      <div class="text-sm"><span class="font-semibold text-white">Communauté Figma</span> <span style="color:#9ca3af">— découverte via Plugin Store</span></div>
    </div>
  </div>
  <div class="card">
    <div class="tag tag-blue mb-2">Surveiller — Q3</div>
    <div class="flex flex-col gap-1.5">
      <div class="text-sm"><span class="font-semibold text-white">OpenAI</span> <span style="color:#9ca3af">— API GPT-4o-mini · quotas</span></div>
      <div class="text-sm"><span class="font-semibold text-white">Railway / Supabase</span> <span style="color:#9ca3af">— infrastructure hébergement</span></div>
    </div>
  </div>
</div>

<div class="mt-4 p-3 rounded-lg text-center" style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2)">
  <span class="text-sm" style="color:#34d399">✦ Early adopter actif — designer professionnel avec sa propre entreprise · feedback terrain CHECK_04 intégré dans le produit</span>
</div>

---
layout: two-cols
---

<div class="tag tag-purple mb-3">C1.2.2 — Faisabilité & processus</div>
<h1>Processus de cadrage</h1>
<p style="color:#6b7280;font-size:0.85rem;margin-bottom:1rem">Du besoin au produit en ligne — une démarche itérative documentée</p>

```mermaid
graph TB
    A["1 · Besoin<br/>+ analyse de la demande"] --> B["2 · Veille & benchmark<br/>concurrents · APIs"]
    B --> C["3 · Faisabilité technique<br/>diagnostic de l'existant"]
    C --> D["4 · Architecture<br/>+ étude comparative"]
    D --> E["5 · Charge & budget<br/>backlog MoSCoW"]
    E --> F["6 · Dev itératif<br/>Scrum · 8 sprints"]
    F --> G["7 · Livraison<br/>Figma Store · Railway"]
    G -.feedback.-> A
```

::right::

<div class="pl-8 pt-10 flex flex-col gap-3">
  <div class="card">
    <div class="tag tag-purple mb-2">Démarche d'audit de l'existant</div>
    <div class="text-xs" style="color:#9ca3af">Diagnostic des solutions en place : Figma Version History, Figma Branches (Organization), Abstract. Constat : aucune granularité géométrique ni attribution par élément.</div>
  </div>
  <div class="card">
    <div class="tag tag-blue mb-2">Contraintes identifiées</div>
    <div class="text-xs" style="color:#9ca3af">Double thread Figma · limite CPU Workers · budget infra ≈ 0 € · solo dev · délais M2.</div>
  </div>
  <div class="card">
    <div class="tag tag-green mb-2">Décision de lancement</div>
    <div class="text-xs" style="color:#9ca3af">Stack validée : Preact + HonoJS + Supabase + Railway. Faisabilité confirmée, MVP cadré.</div>
  </div>
</div>

---
layout: center
---

<div class="tag tag-purple mb-3" style="margin-left:auto;margin-right:auto;display:table">C1.1.2 — Analyse de la demande</div>
<h1 class="text-center mb-2">Le problème identifié</h1>
<p class="text-center mb-10" style="color: #6b7280">Figma sait <em>que</em> tu as sauvegardé. Il ne sait pas <em>quoi</em>, <em>où</em>, ni <em>pourquoi</em>.</p>

<div class="grid grid-cols-3 gap-5">
  <div class="card">
    <div class="font-semibold text-white mb-2">Figma Version History</div>
    <div class="text-sm" style="color: #9ca3af">Capture des snapshots visuels. Impossible de savoir <strong>quel élément</strong> a changé ni de quel montant.</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white mb-2">Attribution fantôme</div>
    <div class="text-sm" style="color: #9ca3af">Dans un fichier partagé à 5 designers, <strong>impossible</strong> de savoir qui a modifié quoi et quand.</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white mb-2">Figma Branches = 45€/mois/user</div>
    <div class="text-sm" style="color: #9ca3af">Réservé au plan Organization. Inaccessible pour les <strong>freelances et petites équipes</strong>.</div>
  </div>
</div>

---
layout: center
---

<div class="tag tag-purple mb-3" style="margin-left:auto;margin-right:auto;display:table">C1.6 — Axes de solution préconisés</div>
<h1 class="text-center mb-8">La solution répond au problème</h1>

<div class="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
  <div class="card">
    <div class="font-semibold text-white text-sm mb-1">Diff géométrique 0.01px</div>
    <div class="text-xs" style="color: #9ca3af"><span style="color:#67e8f9">→ « quel élément »</span> · comparaison nœud par nœud via les propriétés natives Figma</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white text-sm mb-1">Attribution par élément</div>
    <div class="text-xs" style="color: #9ca3af"><span style="color:#67e8f9">→ « qui & quand »</span> · figma.currentUser sur chaque checkpoint</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white text-sm mb-1">AI Patch Notes (GPT-4o-mini)</div>
    <div class="text-xs" style="color: #9ca3af"><span style="color:#67e8f9">→ « pourquoi »</span> · le produit IA vendu : changelog en langage naturel à chaque checkpoint</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white text-sm mb-1">Branches de design — Free</div>
    <div class="text-xs" style="color: #9ca3af"><span style="color:#67e8f9">→ vs 45€/mois</span> · workflow Git-like : main, feat/redesign, fix/nav</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white text-sm mb-1">Restauration sur canvas</div>
    <div class="text-xs" style="color: #9ca3af">Apply to Figma — restaure une version directement dans le fichier</div>
  </div>
  <div class="card">
    <div class="font-semibold text-white text-sm mb-1">Modèle Free / Pro 12€ / Team 39€</div>
    <div class="text-xs" style="color: #9ca3af">Freemium via Stripe — rentable dès 1 abonnement Pro</div>
  </div>
</div>

---
layout: two-cols
---

<div class="tag tag-green mb-3">Démarche d'amélioration continue</div>
<h1>Du feedback au correctif</h1>
<p style="color:#6b7280;font-size:0.85rem;margin-bottom:1rem">Le cycle déclenché par l'usage réel de l'early adopter</p>

```mermaid
graph TB
    F["Feedback terrain<br/>early adopter"] --> D["Diagnostic<br/>reproduction du bug"]
    D --> C["Correctif<br/>branche dédiée"]
    C --> T["Tests<br/>123 cas · Vitest"]
    T --> P["Deploy Railway<br/>auto sur push"]
    P --> V["Vérification<br/>+ CHANGELOG"]
    V -.nouvelle itération.-> F
```

::right::

<div class="pl-8 pt-10 flex flex-col gap-3">
  <div class="card">
    <div class="stat-num" style="font-size:2.5rem">24</div>
    <div class="text-xs" style="color:#6b7280">commits en une session de fiabilisation</div>
  </div>
  <div class="card">
    <div class="tag tag-purple mb-2">Exemples résolus en condition réelle</div>
    <div class="text-xs flex flex-col gap-1" style="color:#9ca3af">
      <span>• Isolation des checkpoints par branche</span>
      <span>• Clé de fichier partagée multi-designers</span>
      <span>• Restauration exhaustive (police + couleur)</span>
      <span>• Mode Différence pour les changements sur place</span>
    </div>
  </div>
  <div class="card" style="background:rgba(52,211,153,0.06);border-color:rgba(52,211,153,0.2)">
    <div class="text-xs" style="color:#9ca3af">Chaque anomalie est <strong style="color:#e5e7eb">consignée, corrigée, testée, déployée et tracée</strong> au CHANGELOG — boucle BC04 illustrée en direct.</div>
  </div>
</div>

---
layout: center
---

<h1 class="text-center mb-8">Témoignage — early adopter</h1>

<div class="card max-w-2xl mx-auto" style="border-color:rgba(34,211,238,0.3);background:linear-gradient(145deg,rgba(34,211,238,0.06),var(--dg-surface))">
  <div style="font-size:2.5rem;line-height:1;color:#67e8f9;opacity:0.5">“</div>
  <p class="text-lg" style="color:#e2f5fa;line-height:1.6;font-style:italic;margin-top:-0.5rem">
    [ Citation à compléter — phrase exacte de l'early adopter sur ce que Design Guardian
    lui apporte dans son workflow réel : précision du diff, attribution, gain de temps… ]
  </p>
  <div class="flex items-center gap-3 mt-6">
    <div class="dg-logo">★</div>
    <div>
      <div class="text-sm font-semibold text-white">[ Prénom / Nom ou initiales ]</div>
      <div class="text-xs" style="color:#9ca3af">Designer UX/UI indépendant · early adopter · mai 2026</div>
    </div>
  </div>
</div>

<div class="mt-5 text-center text-xs" style="color:#4b5563">À remplacer par la citation réelle avant l'oral — encadré prêt à l'emploi.</div>

---
layout: two-cols
---

<div class="tag tag-purple mb-2">C1.5 — Modélisation de l'architecture logicielle</div>
<h1>Architecture</h1>
<p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 1rem">6 microservices · Plugin Figma · Supabase · Railway</p>

```mermaid
graph TB
    Designer["👤 Designer"]

    subgraph Plugin["Plugin Figma · Preact"]
        Main["main.ts\nAPI Figma"]
        UI["ui.tsx\nInterface + HTTP"]
        Main <-->|postMessage| UI
    end

    subgraph API["Backend · HonoJS · Railway"]
        Auth["Auth OAuth·JWT"]
        Core["Checkpoints·Diff·IA"]
        Pay["Paiements Stripe"]
        Notif["Notifs Resend·Twilio"]
    end

    DB[("Supabase\nPostgreSQL + Storage")]
    Mon["Prometheus\nGrafana"]

    Designer --> Plugin
    UI -->|HTTPS| API
    API --> DB
    Core --> OpenAI["OpenAI"]
    Pay --> Stripe["Stripe"]
    Mon -->|scrape| API
```

<a class="open-diagram" href="/architecture.html" target="_blank">
  🔍 Explorer en interactif →
</a>

::right::

<div class="flex flex-col gap-3 pl-8 pt-12">
  <div v-click class="card">
    <div class="tag tag-purple mb-2">Double thread Figma</div>
    <div class="text-xs" style="color: #9ca3af"><strong>main.ts</strong> : API Figma uniquement (absoluteTransform, fills, vectorPaths)<br><strong>ui.tsx</strong> : interface + appels HTTPS</div>
  </div>
  <div v-click class="card">
    <div class="tag tag-blue mb-2">Diff engine</div>
    <div class="text-xs" style="color: #9ca3af">Propriétés natives Figma → DeltaJSON. Tolérance ε = 0.01px. Pas de parsing SVG.</div>
  </div>
  <div v-click class="card">
    <div class="tag tag-green mb-2">6 microservices</div>
    <div class="text-xs" style="color: #9ca3af">Auth · BDD · Métriques · Notifications · IA · Paiements. Snapshots JSON → Storage, métadonnées → PostgreSQL (CTE récursifs pour l'arbre de branches).</div>
  </div>
</div>

---
layout: two-cols
---

<div class="tag tag-purple mb-2">C1.4 — Charge & coût</div>
<h1>Planning & Budget</h1>

<div class="text-xs mt-3" style="color:#6b7280;margin-bottom:0.75rem">8 sprints · Oct 2024 → Juin 2026</div>

<div class="flex flex-col gap-2">
  <div v-click class="card flex items-center gap-3">
    <span class="tag tag-purple" style="flex-shrink:0;font-size:0.65rem">S0–S2</span>
    <span class="text-xs" style="color:#9ca3af">Cadrage · fondations · plugin MVP <span style="color:#6b7280">(Oct – Déc 2024)</span></span>
  </div>
  <div v-click class="card flex items-center gap-3">
    <span class="tag tag-blue" style="flex-shrink:0;font-size:0.65rem">S3–S4</span>
    <span class="text-xs" style="color:#9ca3af">Diff engine · IA · Diff Viewer <span style="color:#6b7280">(Jan – Mar 2025)</span></span>
  </div>
  <div v-click class="card flex items-center gap-3">
    <span class="tag tag-green" style="flex-shrink:0;font-size:0.65rem">S5–S6</span>
    <span class="text-xs" style="color:#9ca3af">Branches · Gold status · CI/CD · Monitoring <span style="color:#6b7280">(Mar – Juin 2025)</span></span>
  </div>
  <div v-click class="card flex items-center gap-3">
    <span class="tag tag-amber" style="flex-shrink:0;font-size:0.65rem">S7–S8</span>
    <span class="text-xs" style="color:#9ca3af">Storage migration · Figma Store ✅ · Soutenance <span style="color:#6b7280">(Avr – Juin 2026)</span></span>
  </div>
  <div v-click class="card" style="border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.05)">
    <span class="text-xs" style="color:#4ade80">🏆 Approuvé Figma Community · mai 2026 · Early adopter actif</span>
  </div>
</div>

::right::

<div class="pl-8 pt-2 flex flex-col gap-3">
  <div class="text-sm font-semibold text-white mb-1">Budget prévisionnel MVP</div>
  <div class="flex flex-col gap-2">
    <div class="card flex justify-between">
      <span class="text-xs" style="color:#9ca3af">Développement (solo, ~3,5 mois · ~2 j/sem)</span>
      <span class="text-xs font-mono text-white">~30 j-h (~240h)</span>
    </div>
    <div class="card flex justify-between">
      <span class="text-xs" style="color:#9ca3af">Railway (hébergement backend)</span>
      <span class="text-xs font-mono text-white">0 €/mois</span>
    </div>
    <div class="card flex justify-between">
      <span class="text-xs" style="color:#9ca3af">Supabase (BDD + Storage)</span>
      <span class="text-xs font-mono text-white">0 €/mois</span>
    </div>
    <div class="card flex justify-between">
      <span class="text-xs" style="color:#9ca3af">OpenAI (GPT-4o-mini)</span>
      <span class="text-xs font-mono text-white">~1 € / 1 000 checkpoints</span>
    </div>
    <div class="card flex justify-between">
      <span class="text-xs" style="color:#9ca3af">Resend + Twilio</span>
      <span class="text-xs font-mono text-white">free tier</span>
    </div>
    <div class="card flex justify-between" style="border-color:rgba(147,51,234,0.4)">
      <span class="text-xs font-semibold text-white">Coût infra mensuel</span>
      <span class="text-sm font-mono font-bold" style="color:#a855f7">0 €/mois</span>
    </div>
  </div>
  <div class="card" style="background:rgba(147,51,234,0.08);border-color:rgba(147,51,234,0.2)">
    <div class="text-xs" style="color:#9ca3af">Rentable dès <strong style="color:#e5e7eb">1 abonnement Pro</strong> (12 €/mois) · ROI immédiat</div>
  </div>
</div>

---
layout: center
---

<div class="tag tag-purple mb-3" style="margin-left:auto;margin-right:auto;display:table">C1.2.3 — Cartographie des risques</div>
<h1 class="text-center mb-6">Cartographie des risques</h1>

<div class="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
  <div class="card" style="border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.05)">
    <div class="flex items-center gap-2 mb-2">
      <span style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0"></span>
      <span class="text-sm font-semibold text-white">R01 — Feature native Figma</span>
    </div>
    <div class="text-xs mb-1" style="color:#9ca3af">Figma sort un versioning natif concurrent</div>
    <div class="text-xs" style="color:#4ade80">→ DG = Free · Branches = 45$/mois · diff 0.01px · AI</div>
  </div>
  <div class="card" style="border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.05)">
    <div class="flex items-center gap-2 mb-2">
      <span style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0"></span>
      <span class="text-sm font-semibold text-white">R02 — Rupture API Plugin</span>
    </div>
    <div class="text-xs mb-1" style="color:#9ca3af">Figma modifie / supprime l'API Plugin</div>
    <div class="text-xs" style="color:#4ade80">→ APIs stables uniquement · surveillance changelog Figma</div>
  </div>
  <div class="card" style="border-color:rgba(251,191,36,0.3);background:rgba(251,191,36,0.05)">
    <div class="flex items-center gap-2 mb-2">
      <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>
      <span class="text-sm font-semibold text-white">R03 — Adoption faible</span>
    </div>
    <div class="text-xs mb-1" style="color:#9ca3af">Faible traction au lancement</div>
    <div class="text-xs" style="color:#4ade80">→ Early adopter actif · Plugin Store public · Free tier</div>
  </div>
  <div class="card" style="border-color:rgba(251,191,36,0.3);background:rgba(251,191,36,0.05)">
    <div class="flex items-center gap-2 mb-2">
      <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>
      <span class="text-sm font-semibold text-white">R06 — Quota OpenAI</span>
    </div>
    <div class="text-xs mb-1" style="color:#9ca3af">Dépassement quota / coût IA incontrôlé</div>
    <div class="text-xs" style="color:#4ade80">→ Rate limiting backend · fallback <code>null</code> si quota atteint</div>
  </div>
</div>

<div class="mt-4 p-3 rounded-lg max-w-3xl mx-auto" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2)">
  <div class="text-xs font-semibold mb-1" style="color:#4ade80">9 risques matérialisés et résolus en cours de projet</div>
  <div class="text-xs" style="color:#9ca3af">figma.mixed non sérialisable · data URI trop large · Zod stripping silencieux · branches sans isolation réelle · Storage migration · fileKey null inter-utilisateurs · Plugin Store refus → tous documentés dans CHANGELOG</div>
</div>

---
layout: center
---

<div class="tag tag-purple mb-3" style="margin-left:auto;margin-right:auto;display:table">C1.3 — Veille & étude comparative des solutions</div>
<h1 class="text-center mb-8">Veille & comparatif concurrents</h1>

<table class="comp-table max-w-3xl mx-auto">
  <thead>
    <tr>
      <th>Fonctionnalité</th>
      <th>Design Guardian</th>
      <th>Figma Version History</th>
      <th>Figma Branches</th>
      <th>Abstract</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Diff géométrique précis</td>
      <td class="check">✓ 0.01px</td>
      <td class="cross">✗</td>
      <td class="cross">✗</td>
      <td class="partial">~ visuel seulement</td>
    </tr>
    <tr>
      <td>Attribution par élément</td>
      <td class="check">✓</td>
      <td class="cross">✗</td>
      <td class="partial">~ par fichier</td>
      <td class="partial">~ par commit</td>
    </tr>
    <tr>
      <td>AI Patch Notes</td>
      <td class="check">✓ GPT-4o-mini</td>
      <td class="cross">✗</td>
      <td class="cross">✗</td>
      <td class="cross">✗</td>
    </tr>
    <tr>
      <td>Branches</td>
      <td class="check">✓ Free</td>
      <td class="cross">✗</td>
      <td class="partial">45€/mois/user</td>
      <td class="check">✓ payant</td>
    </tr>
    <tr>
      <td>Plugin natif Figma</td>
      <td class="check">✓</td>
      <td class="check">✓ intégré</td>
      <td class="check">✓ intégré</td>
      <td class="cross">✗ app externe</td>
    </tr>
    <tr>
      <td>Restauration canvas</td>
      <td class="check">✓ Apply to Figma</td>
      <td class="partial">~ snapshot visuel</td>
      <td class="check">✓</td>
      <td class="cross">✗</td>
    </tr>
    <tr>
      <td>Prix d'entrée</td>
      <td class="check">Gratuit</td>
      <td class="check">Inclus Figma</td>
      <td class="cross">45€/mois</td>
      <td class="cross">29€/mois</td>
    </tr>
  </tbody>
</table>

---
layout: center
---

<div class="flex flex-col items-center gap-6">
  <div class="dg-logo lg">DG</div>
  <h1 class="text-5xl text-center" style="-webkit-text-fill-color: white; background: none">Démo live</h1>
  <p class="text-center text-xl" style="color: #6b7280">Ouvrons Figma.</p>
  <div class="flex gap-3 mt-4">
    <div class="tag tag-purple">Capture d'un checkpoint</div>
    <div class="tag tag-blue">AI Patch Note généré</div>
    <div class="tag tag-green">Diff Split / Overlay</div>
  </div>
  <p class="text-sm mt-8" style="color: #374151">design-guardian.up.railway.app</p>
</div>
