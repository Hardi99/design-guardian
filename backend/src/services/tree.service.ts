import type { NodeSnapshot } from '../types/figma.js';

// Arbre du snapshot → maps id→parentId (racine = null) et id→name.
// Utilisé pour la détection des moves dérivés (cascade) dans le diff.
export function buildTreeMaps(root: NodeSnapshot): { parent: Map<string, string | null>; name: Map<string, string> } {
  const parent = new Map<string, string | null>();
  const name = new Map<string, string>();
  const walk = (n: NodeSnapshot, p: string | null): void => {
    parent.set(n.id, p);
    name.set(n.id, n.name);
    for (const c of n.children ?? []) walk(c, n.id);
  };
  walk(root, null);
  return { parent, name };
}

// Map chaque nœud → l'INSTANCE la PLUS HAUTE dans sa chaîne d'ancêtres (icône/composant),
// ou absent s'il n'est dans aucune instance. Une fois entré dans une instance, on ne
// redescend pas sur une instance imbriquée : l'unité atomique est la 1ʳᵉ instance rencontrée
// en descendant — exactement ce que le restore traite comme atomique (main.ts, garde INSTANCE).
// L'instance elle-même n'a PAS d'entrée → elle reste tête de groupe (clé = son propre id).
// Sert à REGROUPER les changements internes d'une icône en un seul élément à l'affichage.
// Map chaque nœud → le VIEWPORT qui le contient : l'enfant de premier niveau de la racine
// dont il descend (un enfant de premier niveau est son PROPRE viewport). La racine est
// absente — c'est un conteneur, pas un objet de design.
// Le viewport est le repère géométrique du page-centric : une PageNode n'ayant aucune
// géométrie, les bbox et les dimensions de cadre sont relatives au viewport, pas à la racine.
export function viewportRootMap(root: NodeSnapshot): Map<string, { id: string; name: string }> {
  const out = new Map<string, { id: string; name: string }>();
  for (const top of root.children ?? []) {
    const vp = { id: top.id, name: top.name };
    const walk = (n: NodeSnapshot): void => {
      out.set(n.id, vp);
      for (const c of n.children ?? []) walk(c);
    };
    walk(top);
  }
  return out;
}

export function instanceRootMap(root: NodeSnapshot): Map<string, { id: string; name: string }> {
  const out = new Map<string, { id: string; name: string }>();
  const walk = (n: NodeSnapshot, top: { id: string; name: string } | null): void => {
    if (top) out.set(n.id, top);
    const nextTop = top ?? (n.type === 'INSTANCE' ? { id: n.id, name: n.name } : null);
    for (const c of n.children ?? []) walk(c, nextTop);
  };
  walk(root, null);
  return out;
}
