// ─── MAIN THREAD ─────────────────────────────────────────────────────────────
// Accès exclusif à l'API Figma. Communication UI via postMessage uniquement.
// ─────────────────────────────────────────────────────────────────────────────

import type { MainToUI, UIToMain, NodeSnapshot, FigmaFill, FigmaStroke, FigmaVectorPath, FigmaEffect, FigmaSnapshot } from './types';
import type { Asset, Version } from './store.js';
import { chooseFormat, PNG_MAX_B64, PNG_SCALES } from './renderFormat';
import { computeCornerRadii, type CornerInput } from './cornerRadii.js';
import { changedProps, pickMatch, planResize } from './restoreDiff.js';
import { framesToPrune, pickHistoryClone, hashSnapshot, latestCopy, planPageRestore, stalePending, type HistoryFrameInfo } from './restoreClone.js';
import { decideFileId, isValidFileId, generateFileId, FILE_ID_KEY } from './fileId.js';
import { classifyPresence, shouldOfferSplit, parseDismissed, SPLIT_DISMISSED_KEY } from './fileSplit.js';
import { autoLayoutOf, strokeOf, spreadOf, variantOf, collectComponents, type ComponentInfo, type TreeLike, type AutoLayoutLike, type PaintLike, type EffectLike } from './capture.js';

// Composants principaux des instances de la capture en cours, lus en passe préalable
// (getMainComponentAsync est asynchrone, extractSnapshot ne l'est pas — et sert de rappel
// à Array.map, d'où une variable plutôt qu'un paramètre).
let capturedComponents = new Map<string, ComponentInfo>();
import { IDENTITY_KEY } from './identity.js';
import { ensureNodeIdentity, propagateIdentity, claimIdentity, readDgId, findByDgId, adoptMovedIdentities, type BranchNode, type IdentifiableNode } from './figmaIdentity.js';
import { decodeBase64Utf8 } from './utils.js';
import { listFrames, locateFrame, frameKey, setTracked, isTracked, assignFloating, type TrackableNode, type Box } from './trackedFrames.js';

figma.showUI(__html__, { width: 400, height: 600, themeColors: true });

// Un historique par page : l'UI a besoin de la page courante, et de la suivre quand elle change.
function sendFileInfo(fileKey: string) {
  send({ type: 'FILE_INFO', fileKey, fileName: figma.root.name, pageId: figma.currentPage.id, pageName: figma.currentPage.name });
}
figma.on('currentpagechange', () => {
  send({ type: 'PAGE_CHANGED', pageId: figma.currentPage.id, pageName: figma.currentPage.name });
  sendFrames(); // l'accueil affiche les frames (et le sélecteur) de la nouvelle page
});

// documentAccess: "dynamic-page" → charger toutes les pages est coûteux sur les gros
// fichiers. On le diffère jusqu'au premier accès cross-page réel (historique, branches)
// au lieu de bloquer le démarrage. Idempotent : un seul appel réseau, quel que soit
// le nombre de handlers qui le déclenchent.

let pagesLoaded = false;
async function ensurePagesLoaded(): Promise<void> {
  if (pagesLoaded) return;
  await figma.loadAllPagesAsync();
  pagesLoaded = true;
}

(async () => {
  // Auto-init : ne lit que figma.root / figma.currentPage.id (racine +
  // page courante, toujours accessibles) — aucun accès cross-page ici, donc pas besoin
  // d'ensurePagesLoaded(). Le chargement des pages est différé aux handlers qui en ont
  // vraiment besoin (historique, branches).
  // Identifiant de fichier : uniquement dans le fichier (cf. fileId.ts).
  const { fileId: fileKey, mustWrite } = decideFileId(figma.root.getPluginData(FILE_ID_KEY));
  if (mustWrite) {
    try { figma.root.setPluginData(FILE_ID_KEY, fileKey); } catch {
      // Lecture seule : sans id persistant, chaque ouverture créerait un projet jetable.
      send({ type: 'INIT_ERROR', message: "Ce fichier n'est pas encore relié à Design Guardian. Ouvrez-le une première fois avec les droits d'édition." });
      return;
    }
  }

  // Store main page ID once so handleSwitchBranch can find it reliably.
  if (!figma.root.getPluginData('dg_main_page_id')) {
    try { figma.root.setPluginData('dg_main_page_id', figma.currentPage.id); } catch { /* read-only */ }
  }

  sendFileInfo(fileKey);
  const linkToken = (await figma.clientStorage.getAsync('dg_link_token')) as string | undefined;
  send({ type: 'LINK_TOKEN', token: linkToken ?? null });

  // Cache stale-while-revalidate : affichage instantané des assets à la 2e ouverture,
  // rafraîchis ensuite par l'auto-init réseau (source de vérité, cf. handler PERSIST_STATE).
  const cached = (await figma.clientStorage.getAsync('dg_cache_' + fileKey)) as
    { apiKey: string; plan: string; assets: Asset[] } | undefined;
  if (cached) send({ type: 'CACHED_STATE', apiKey: cached.apiKey, plan: cached.plan, assets: cached.assets });
})();

const user = figma.currentUser;
if (user) {
  send({ type: 'AUTHOR_INFO', author: {
    figma_id: user.id ?? 'unknown',
    name: user.name ?? 'Anonyme',
    avatar_url: user.photoUrl ?? undefined,
  }});
}

figma.ui.onmessage = async (raw: unknown) => {
  const msg = raw as UIToMain;
  switch (msg.type) {
    case 'REQUEST_SNAPSHOT':  await handleSnapshot(); break;
    case 'RETRY_INIT': {
      const key = figma.root.getPluginData(FILE_ID_KEY);
      if (isValidFileId(key)) {
        sendFileInfo(key);
      }
      break;
    }
    case 'OPEN_EXTERNAL':     figma.openExternal(msg.url); break;
    case 'LINK_PERSIST_TOKEN': await figma.clientStorage.setAsync('dg_link_token', msg.token); break;
    case 'RESIZE':            figma.ui.resize(msg.width, msg.height); break;
    case 'CREATE_BRANCH':     await handleCreateBranch(msg.branchName); break;
    case 'SWITCH_BRANCH':     await handleSwitchBranch(msg.branchName); break;
    case 'PROTECT_HISTORY':   await protectHistory(msg.versionId, msg.gold); break;
    case 'STORE_HISTORY_CLONE': await handleStoreHistoryClone(msg.nodeId, msg.versionId, msg.versionNumber); break;
    case 'RESTORE_TO_FIGMA':  await handleRestoreToFigma(msg.versionId, msg.snapshot, msg.render_svg_b64); break;
    case 'PERSIST_STATE':
      await figma.clientStorage.setAsync('dg_cache_' + msg.fileKey, { apiKey: msg.apiKey, plan: msg.plan, assets: msg.assets });
      break;
    case 'REQUEST_VERSION_CACHE': {
      const c = await figma.clientStorage.getAsync('dg_vcache_' + msg.assetId) as
        { versions: Version[]; branches: string[] } | undefined;
      if (c) send({ type: 'VERSION_CACHE', assetId: msg.assetId, versions: c.versions, branches: c.branches });
      break;
    }
    case 'SWAP_SEEN': { // dernière version vue PAR CE designer (clientStorage = par utilisateur)
      const key = 'dg_seen_' + msg.assetId;
      const old = await figma.clientStorage.getAsync(key) as number | undefined;
      await figma.clientStorage.setAsync(key, msg.versionNumber);
      send({ type: 'SEEN', assetId: msg.assetId, versionNumber: old ?? null });
      break;
    }
    case 'CHECK_PRESENCE': {
      // Quels éléments suivis du projet sont dans CE fichier ? (nœud + dg_id, cf. fileSplit.ts)
      try {
        const found = new Map<string, string>();
        for (const nodeId of new Set(msg.identities.map(i => i.figma_node_id))) {
          const n = await figma.getNodeByIdAsync(nodeId).catch(() => null);
          if (n) found.set(nodeId, readDgId(n as unknown as IdentifiableNode));
        }
        // Restauration / branche : le nœud a un nouvel id mais garde son dg_id. Si l'id n'a
        // pas suffi, on relève tous les dg_id du fichier (recherche native, une seule passe).
        let dgIdsInFile = new Set<string>();
        if (classifyPresence(msg.identities, found).elsewhere.length > 0) {
          await ensurePagesLoaded(); // dynamic-page : requis pour chercher dans tout le document
          const stamped = figma.root.findAllWithCriteria({ pluginData: { keys: [IDENTITY_KEY] } });
          dgIdsInFile = new Set(stamped.map(n => readDgId(n as unknown as IdentifiableNode)));
        }
        const presence = classifyPresence(msg.identities, found, dgIdsInFile);
        console.log('[DG] présence :', msg.identities.length, 'éléments,', found.size, 'nœuds trouvés par id,', dgIdsInFile.size, 'dg_id dans le fichier,', presence.here.length, 'ici,', presence.elsewhere.length, 'ailleurs');
        const dismissed = parseDismissed(figma.root.getPluginData(SPLIT_DISMISSED_KEY));
        send({ type: 'PRESENCE', ...presence, offer: shouldOfferSplit(presence.elsewhere, dismissed) });
      } catch (e) {
        console.error('[DG] vérification de présence impossible', e);
      }
      break;
    }
    case 'SPLIT_BEGIN': {
      // Nouvel id écrit AVANT l'appel serveur : si le fichier est en lecture seule, on s'arrête là.
      const previous = figma.root.getPluginData(FILE_ID_KEY);
      const fileKey = generateFileId();
      try { figma.root.setPluginData(FILE_ID_KEY, fileKey); } catch {
        send({ type: 'ERROR', message: "Fichier en lecture seule : impossible de le séparer." });
        break;
      }
      send({ type: 'SPLIT_READY', fileKey, previous });
      break;
    }
    case 'SPLIT_DISMISS': {
      const dismissed = parseDismissed(figma.root.getPluginData(SPLIT_DISMISSED_KEY));
      const merged = [...new Set([...dismissed, ...msg.assetIds])];
      try { figma.root.setPluginData(SPLIT_DISMISSED_KEY, JSON.stringify(merged)); } catch { /* read-only : le bandeau reviendra */ }
      break;
    }
    case 'SPLIT_ROLLBACK':
      try { figma.root.setPluginData(FILE_ID_KEY, msg.fileKey); } catch { /* read-only */ }
      break;
    case 'RENDER_FRAMES': {
      // Rendus par frame, demandés APRÈS le POST (le serveur sait lesquelles ont changé).
      // Frame introuvable ou export raté : aucun message pour elle (« Rendu indisponible. »).
      await ensurePagesLoaded();
      for (const f of msg.frames) {
        const node = await figma.getNodeByIdAsync(f.id).catch(() => null);
        if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') continue;
        const r = await exportRender(node as SceneNode);
        if (r) send({ type: 'FRAME_RENDERED', versionId: msg.versionId, key: f.key, b64: r.b64, kind: r.kind });
      }
      break;
    }
    case 'PERSIST_VERSION_CACHE':
      await figma.clientStorage.setAsync('dg_vcache_' + msg.assetId, { versions: msg.versions, branches: msg.branches });
      break;

    case 'REQUEST_FRAMES': sendFrames(); break;

    case 'SHOW_ON_CANVAS': {
      // Page courante d'abord (aucun chargement) ; sinon toutes les pages (chargement différé).
      const cur = figma.currentPage as unknown as TrackableNode;
      let hit = locateFrame([cur], msg.key);
      if (!hit) { await ensurePagesLoaded(); hit = locateFrame(figma.root.children as unknown as TrackableNode[], msg.key); }
      if (!hit) { figma.notify('Frame introuvable : elle a peut-être été supprimée.'); break; }
      const page = hit.page as unknown as PageNode;
      const node = hit.node as unknown as SceneNode;
      if (page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
      page.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      break;
    }

    case 'GO_TO_PAGE': { // choix dans le sélecteur → Figma suit ; currentpagechange prévient l'UI
      const page = figma.root.children.find(p => p.id === msg.pageId);
      if (page) await figma.setCurrentPageAsync(page);
      break;
    }

    case 'SET_TRACKED': { // une case, ou « Tout suivre / Tout retirer » en 1 clic
      const ids = new Set(msg.nodeIds);
      for (const node of figma.currentPage.children) if (ids.has(node.id)) setTracked(node as unknown as TrackableNode, msg.tracked);
      sendFrames(); // liste à jour → l'estimation se recalcule côté UI
      break;
    }
  }
};

// Le préfixe `dg/` est réservé aux pages techniques (branches + _history) : jamais capturable.
function isCapturablePage(name: string): boolean {
  return !name.startsWith('dg/');
}

function sendFrames(): void {
  const page = figma.currentPage;
  send({
    type: 'FRAMES_LIST',
    frames: listFrames(page.children as unknown as readonly TrackableNode[]),
    pageName: page.name,
    capturable: isCapturablePage(page.name),
    // Liste des pages pour le sélecteur (noms seulement : aucun chargement de page requis).
    pages: figma.root.children.filter(p => isCapturablePage(p.name)).map(p => ({ id: p.id, name: p.name })),
  });
}

// ─── Delta-based restore helpers ─────────────────────────────────────────────

// Reconstruct the Figma font style string from stored weight + italic flag.
function weightToStyle(weight?: number, italic = false): string {
  const w = weight ?? 400;
  const base =
    w <= 100 ? 'Thin'       : w <= 200 ? 'ExtraLight' :
    w <= 300 ? 'Light'      : w <= 400 ? 'Regular'    :
    w <= 500 ? 'Medium'     : w <= 600 ? 'SemiBold'   :
    w <= 700 ? 'Bold'       : w <= 800 ? 'ExtraBold'  : 'Black';
  return italic ? (base === 'Regular' ? 'Italic' : `${base} Italic`) : base;
}

// Load + apply font for a text node. Tries the exact stored style string first
// (source of truth), then the weight-derived approximation, then Regular/Italic.
async function restoreFont(t: TextNode, snap: NodeSnapshot): Promise<void> {
  const family = snap.fontFamily
    ?? (typeof t.fontName !== 'symbol' && !Array.isArray(t.fontName) ? (t.fontName as FontName).family : 'Inter');
  const candidates = [
    snap.fontStyleName,                                          // exact round-trip
    weightToStyle(snap.fontWeight, snap.fontStyle === 'italic'), // approximation (old checkpoints)
    snap.fontStyle === 'italic' ? 'Italic' : 'Regular',          // last-resort fallback
  ].filter((s): s is string => !!s);
  for (const style of candidates) {
    try {
      await figma.loadFontAsync({ family, style });
      t.fontName = { family, style };
      return;
    } catch { /* try next candidate */ }
  }
}

// Charge TOUTES les polices présentes dans un nœud texte. Figma exige que chaque
// police soit chargée avant de muter characters/fontName/fontSize — sinon "unloaded
// font" → throw (W4 : restore multi-police). Résilient aux polices indisponibles.
async function loadNodeFonts(t: TextNode): Promise<void> {
  const len = t.characters.length;
  const fonts: FontName[] = len > 0
    ? t.getRangeAllFontNames(0, len)
    : [typeof t.fontName !== 'symbol' && !Array.isArray(t.fontName) ? t.fontName as FontName : { family: 'Inter', style: 'Regular' }];
  await Promise.all(fonts.map(f => figma.loadFontAsync(f).catch(() => { /* police indisponible — on ignore */ })));
}

// Single source of truth for applying a node's stored properties.
// Restore passes the full set; every property the snapshot holds is covered here.
async function applyDeltaProps(node: SceneNode, snap: NodeSnapshot, props: Set<string>): Promise<void> {
  const inAutoLayout = (() => {
    const p = node.parent;
    return !!(p && 'layoutMode' in p && (p as FrameNode).layoutMode !== 'NONE');
  })();

  if ((props.has('x') || props.has('y')) && !inAutoLayout && 'x' in node) {
    let parentAbsX = 0, parentAbsY = 0;
    if (node.parent && 'absoluteTransform' in node.parent) {
      parentAbsX = (node.parent as SceneNode).absoluteTransform[0][2];
      parentAbsY = (node.parent as SceneNode).absoluteTransform[1][2];
    }
    (node as { x: number; y: number }).x = snap.x - parentAbsX;
    (node as { x: number; y: number }).y = snap.y - parentAbsY;
  }
  if ((props.has('width') || props.has('height')) && 'resize' in node) {
    // En auto-layout, la taille dépend du mode de l'enfant (FIXED/HUG/FILL) : on restaure
    // le mode puis on resize (Figma applique aux axes FIXED, ignore HUG/FILL). Hors auto-layout,
    // resize absolu classique. Chaque écriture est guardée (modes parfois non assignables).
    const plan = planResize(snap, inAutoLayout);
    const n = node as unknown as Record<string, unknown>;
    if (plan.hSizing && 'layoutSizingHorizontal' in node) { try { n.layoutSizingHorizontal = plan.hSizing; } catch { /* non assignable */ } }
    if (plan.vSizing && 'layoutSizingVertical' in node)   { try { n.layoutSizingVertical = plan.vSizing; } catch { /* non assignable */ } }
    if (plan.resize) { try { (node as LayoutMixin).resize(plan.resize.width, plan.resize.height); } catch { /* contraint par le layout */ } }
  }
  if (props.has('opacity')  && 'opacity' in node) (node as BlendMixin).opacity = snap.opacity;
  if (props.has('visible'))                       node.visible = snap.visible ?? true;
  if (props.has('rotation') && 'rotation' in node && snap.rotation !== undefined)
    (node as SceneNode & { rotation: number }).rotation = snap.rotation;
  if ((props.has('cornerRadius') || props.has('cornerRadii')) && 'cornerRadius' in node) {
    if (snap.cornerRadii && snap.cornerRadii.length === 4) {
      const n = node as unknown as Record<string, number>;
      try {
        n.topLeftRadius = snap.cornerRadii[0]; n.topRightRadius = snap.cornerRadii[1];
        n.bottomRightRadius = snap.cornerRadii[2]; n.bottomLeftRadius = snap.cornerRadii[3];
      } catch { /* non assignable sur ce type de nœud */ }
    } else if (snap.cornerRadius !== undefined) {
      (node as CornerMixin).cornerRadius = snap.cornerRadius;
    }
  }
  if (props.has('strokeWeight') && 'strokeWeight' in node && snap.strokeWeight !== undefined)
    (node as MinimalStrokesMixin).strokeWeight = snap.strokeWeight;

  if (props.has('fills') && 'fills' in node) {
    const paints: Paint[] = [];
    for (const f of snap.fills) {
      if (f.type === 'SOLID' && f.color) {
        paints.push({ type: 'SOLID', color: { r: f.color.r, g: f.color.g, b: f.color.b }, opacity: f.color.a, visible: f.visible ?? true } as SolidPaint);
      } else if ((f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') && f.gradientStops?.length) {
        const r = ((f.gradientAngle ?? 0) * Math.PI) / 180;
        const cos = Math.cos(r), sin = Math.sin(r);
        paints.push({ type: f.type, gradientStops: f.gradientStops.map(s => ({ position: s.position, color: s.color })), gradientTransform: [[cos, sin, 0.5 * (1 - cos - sin)], [-sin, cos, 0.5 * (1 + sin - cos)]] as Transform, visible: f.visible ?? true, opacity: f.opacity ?? 1 } as GradientPaint);
      } else if (f.type === 'IMAGE' && f.imageHash) {
        paints.push({ type: 'IMAGE', imageHash: f.imageHash, scaleMode: (f.scaleMode as ImagePaint['scaleMode']) ?? 'FILL', visible: f.visible ?? true, opacity: f.opacity ?? 1 } as ImagePaint);
      }
    }
    if (paints.length > 0) (node as GeometryMixin).fills = paints;
  }

  if (props.has('strokes') && 'strokes' in node) {
    const paints: Paint[] = snap.strokes.filter(s => s.type === 'SOLID' && s.color).map(s => ({ type: 'SOLID', color: { r: s.color!.r, g: s.color!.g, b: s.color!.b }, opacity: s.opacity ?? s.color!.a, visible: true } as SolidPaint));
    if (paints.length > 0) (node as GeometryMixin).strokes = paints;
  }

  if (props.has('effects') && 'effects' in node) {
    const effects: Effect[] = [];
    for (const e of snap.effects ?? []) {
      const color = e.color ? { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a } : { r: 0, g: 0, b: 0, a: 0.25 };
      if (e.type === 'DROP_SHADOW') {
        effects.push({ type: 'DROP_SHADOW', visible: e.visible, radius: e.radius, spread: 0, blendMode: 'NORMAL', showShadowBehindNode: false, color, offset: e.offset ?? { x: 4, y: 4 } } as DropShadowEffect);
      } else if (e.type === 'INNER_SHADOW') {
        effects.push({ type: 'INNER_SHADOW', visible: e.visible, radius: e.radius, spread: 0, blendMode: 'NORMAL', color, offset: e.offset ?? { x: 0, y: 0 } } as InnerShadowEffect);
      } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
        effects.push({ type: e.type, visible: e.visible, radius: e.radius } as BlurEffect);
      }
    }
    (node as BlendMixin).effects = effects;
  }

  // Sécurité multi-police (W4) : charger toutes les polices du nœud AVANT toute
  // mutation texte, sinon Figma throw "unloaded font" et le restore du nœud échoue.
  // LIMITE CONNUE : le snapshot ne stocke le style texte qu'au niveau nœud (1 couleur,
  // 1 police). Le rich text (couleur/police PAR PLAGE) n'est pas capturé → non restauré.
  // Vrai fix = getStyledTextSegments + setRange* (projet « fidélité rich-text » post-SP1).
  if (node.type === 'TEXT' && (props.has('fontFamily') || props.has('fontWeight') || props.has('fontStyle') || props.has('characters') || props.has('fontSize') || props.has('letterSpacing') || props.has('lineHeight'))) {
    await loadNodeFonts(node as TextNode);
  }

  // Font family / weight / style — must be restored before characters or fontSize
  if ((props.has('fontFamily') || props.has('fontWeight') || props.has('fontStyle')) && node.type === 'TEXT') {
    await restoreFont(node as TextNode, snap);
  }

  if (props.has('characters') && node.type === 'TEXT') {
    const t = node as TextNode;
    const fn = typeof t.fontName !== 'symbol' && !Array.isArray(t.fontName) ? t.fontName as FontName : { family: 'Inter', style: 'Regular' };
    await figma.loadFontAsync(fn);
    if (snap.characters !== undefined) t.characters = snap.characters;
  }
  if (props.has('fontSize') && node.type === 'TEXT' && snap.fontSize !== undefined) {
    const t = node as TextNode;
    if (typeof t.fontSize !== 'symbol') t.fontSize = snap.fontSize;
  }
  if (props.has('letterSpacing') && node.type === 'TEXT' && snap.letterSpacing !== undefined) {
    (node as TextNode).letterSpacing = { value: snap.letterSpacing, unit: 'PIXELS' };
  }
  if (props.has('lineHeight') && node.type === 'TEXT' && snap.lineHeight !== undefined) {
    (node as TextNode).lineHeight = { value: snap.lineHeight, unit: 'PIXELS' };
  }
  if (props.has('vectorPaths') && 'vectorPaths' in node && snap.vectorPaths?.length)
    (node as VectorNode).vectorPaths = snap.vectorPaths as VectorPath[];
}

// Every property a snapshot can hold. Root excludes geometry (don't move/resize
// the tracked frame); children include it (restore their layout within the frame).
const RESTORE_PROPS = ['opacity', 'visible', 'rotation', 'cornerRadius', 'cornerRadii', 'strokeWeight', 'fills', 'strokes', 'effects', 'fontFamily', 'fontWeight', 'fontStyle', 'characters', 'fontSize', 'letterSpacing', 'lineHeight', 'vectorPaths'];
const RESTORE_PROPS_ROOT     = new Set(RESTORE_PROPS);
const RESTORE_PROPS_CHILDREN = new Set([...RESTORE_PROPS, 'x', 'y', 'width', 'height']);

// Aplatit un arbre de snapshot en Map id → snapshot du nœud (pour le live-diff).
function flattenSnapshot(snap: NodeSnapshot, map: Map<string, NodeSnapshot>): void {
  map.set(snap.id, snap);
  for (const c of snap.children ?? []) flattenSnapshot(c, map);
}

// Restore « live-diff » : on parcourt l'arbre du snapshot, on matche chaque nœud
// par ID, et on n'applique QUE les propriétés qui diffèrent de l'état actuel du
// canvas (`currMap`). Couverture complète (toute prop peut être appliquée), mais
// écritures minimales : un nœud inchangé est entièrement sauté. Si l'état courant
// du nœud est introuvable, on retombe sur le set complet (sûr).
async function applyFullSnapshot(node: SceneNode, snap: NodeSnapshot, currMap: Map<string, NodeSnapshot>, isRoot: boolean): Promise<{ applied: number; skipped: number }> {
  let applied = 0, skipped = 0;
  try {
    const candidates = isRoot ? RESTORE_PROPS_ROOT : RESTORE_PROPS_CHILDREN;
    const curr = currMap.get(node.id);
    const toApply = curr ? changedProps(curr, snap, candidates) : candidates;
    if (toApply.size > 0) {
      await applyDeltaProps(node, snap, toApply);
      applied++;
    }
  } catch (e) { skipped++; console.warn('[DG] restore: nœud sauté', node.id, node.type, e); }

  // Les enfants d'une INSTANCE sont verrouillés par Figma (« cannot be overridden
  // in an instance ») et suivent la transform de l'instance — déjà restaurée ci-dessus.
  // On ne descend donc pas dedans : c'est correct (pas une perte) et ça évite des erreurs.
  if ('children' in node && snap.children && node.type !== 'INSTANCE') {
    // Index une seule fois (O(n), corrige W5) : par dg_id (identité stable, marche
    // cross-branche grâce à la propagation) + par node.id (repli legacy).
    const liveChildren = (node as ChildrenMixin).children as readonly SceneNode[];
    const byDgId = new Map<string, SceneNode>();
    const byId = new Map<string, SceneNode>();
    for (const c of liveChildren) {
      const d = readDgId(c);
      if (d) byDgId.set(d, c);
      byId.set(c.id, c);
    }
    for (const childSnap of snap.children) {
      const match = pickMatch(childSnap, byDgId, byId);
      if (match) {
        const r = await applyFullSnapshot(match, childSnap, currMap, false);
        applied += r.applied; skipped += r.skipped;
      } else { skipped++; }
    }
  }
  return { applied, skipped };
}

// Walk up the parent chain to find the owning page.
function isOnCurrentPage(node: SceneNode): boolean {
  let n: BaseNode | null = node;
  while (n) {
    if (n.type === 'PAGE') return n.id === figma.currentPage.id;
    n = n.parent;
  }
  return false;
}

// ─── Restore to Figma canvas ──────────────────────────────────────────────────

// Restore LOSSLESS : re-clone le clone d'historique du checkpoint et remplace le nœud live.
// Renvoie true si effectué, false si aucun clone (→ l'appelant fait le repli).
function tryRestoreFromClone(versionId: string): boolean {
  const page = figma.root.children.find(p => p.name === HISTORY_PAGE) as PageNode | undefined;
  if (!page) return false;
  const cloneId = pickHistoryClone(readHistoryFrames(page), versionId);
  if (!cloneId) return false;
  const stored = page.children.find(c => c.id === cloneId);
  if (!stored || !('clone' in stored)) return false;
  try {
    const assetDgId = stored.getPluginData('dg_history_asset');
    const liveRoots = figma.currentPage.children as unknown as BranchNode[];
    const live = (assetDgId ? findByDgId(liveRoots, assetDgId) : undefined) as unknown as SceneNode | undefined;
    const fresh = (stored as SceneNode & { clone(): SceneNode }).clone();
    fresh.locked = false;
    // Nettoyer les tags d'historique sur la copie restaurée.
    for (const k of HISTORY_TAGS) fresh.setPluginData(k, '');
    if (live && live.parent) {
      live.parent.appendChild(fresh);
      (fresh as SceneNode & { x: number; y: number }).x = (live as SceneNode & { x: number }).x;
      (fresh as SceneNode & { x: number; y: number }).y = (live as SceneNode & { y: number }).y;
      propagateIdentity(live as unknown as BranchNode, fresh as unknown as BranchNode); // continuité dg_id
      live.remove();
    } else {
      figma.currentPage.appendChild(fresh);
    }
    figma.currentPage.selection = [fresh];
    figma.viewport.scrollAndZoomIntoView([fresh]);
    return true;
  } catch (e) {
    console.log('[DG] restore par clone échec → repli', e);
    return false;
  }
}

async function handleRestoreToFigma(versionId: string | undefined, snapshot: FigmaSnapshot, renderSvgB64?: string): Promise<void> {
  if (renderSvgB64 && renderSvgB64.startsWith('iVBO')) renderSvgB64 = undefined; // PNG → pas de createNodeFromSvg
  if (snapshot.root.type === 'PAGE') { await restorePage(versionId ?? '', snapshot); return; }
  await ensurePagesLoaded(); // dynamic-page : le clone d'historique vit sur dg/_history
  // 0. Restore LOSSLESS par clone d'historique (primaire). Repli sur la suite si absent.
  if (versionId && tryRestoreFromClone(versionId)) {
    send({ type: 'RESTORE_COMPLETE', applied: 1, skipped: 0, mode: 'clone' });
    return;
  }
  // 1. Fast path same-branch : le nœud d'origine est-il sur la page courante ?
  //    getNodeByIdAsync peut throw (pas juste renvoyer null) si le nœud n'existe pas.
  let root: SceneNode | null = null;
  try { root = await figma.getNodeByIdAsync(snapshot.figmaNodeId) as SceneNode | null; } catch {}
  if (root && !isOnCurrentPage(root)) root = null;

  // 2. Cross-branch (W2) : retrouver l'homologue sur la page courante par dg_id.
  //    La propagation (P2) garantit que le clone porte le même dg_id qu'à la capture.
  if (!root && snapshot.root.dg_id) {
    root = (findByDgId(figma.currentPage.children as unknown as BranchNode[], snapshot.root.dg_id) as unknown as SceneNode | undefined) ?? null;
  }

  // 3. Racine trouvée sur la page courante → restore live-diff RÉEL (same- OU cross-branche).
  //    currMap = snapshot de l'état ACTUEL du canvas (une seule traversée O(n)).
  if (root) {
    try {
      const currMap = new Map<string, NodeSnapshot>();
      flattenSnapshot(extractSnapshot(root), currMap);
      const result = await applyFullSnapshot(root, snapshot.root, currMap, true);
      figma.commitUndo();
      send({ type: 'RESTORE_COMPLETE', applied: result.applied, skipped: result.skipped, mode: 'reapply' });
    } catch (e) {
      send({ type: 'ERROR', message: `Erreur restauration : ${String(e)}` });
    }
    return;
  }

  // 4. Dernier recours : aucun nœud homologue (dg_id absent / non trouvé) →
  //    reconstruction depuis le SVG capturé au checkpoint.
  if (!renderSvgB64) {
    send({ type: 'ERROR', message: 'Pas de visuel stocké pour cette version. Recapturez un checkpoint.' });
    return;
  }
  try {
    const svgString = decodeBase64Utf8(renderSvgB64); // W3 : UTF-8 correct (accents) au lieu de atob/Latin-1
    const newNode = figma.createNodeFromSvg(svgString);
    newNode.name = snapshot.figmaNodeName;

    // Replace existing node by name if found — keeps z-order + position,
    // and makes the operation fully undoable as one step (old node is restored on Ctrl+Z).
    const existing = figma.currentPage.children
      .find(n => n.name === snapshot.figmaNodeName) as SceneNode | undefined;

    if (existing) {
      const parent = existing.parent as PageNode;
      const idx = (parent.children as readonly SceneNode[]).indexOf(existing);
      newNode.x = (existing as FrameNode).x;
      newNode.y = (existing as FrameNode).y;
      parent.appendChild(newNode);
      if (idx >= 0) parent.insertChild(idx, newNode);
      existing.remove();
    } else {
      newNode.x = snapshot.root.x;
      newNode.y = snapshot.root.y;
      figma.currentPage.appendChild(newNode);
    }

    figma.commitUndo();
    // Selection + zoom are cosmetic — don't fail the restore if they throw
    try { figma.currentPage.selection = [newNode]; } catch {}
    try { figma.viewport.scrollAndZoomIntoView([newNode]); } catch {}
    send({ type: 'RESTORE_COMPLETE', applied: 1, skipped: 0 });
  } catch (e) {
    send({ type: 'ERROR', message: `Erreur restauration cross-branche : ${String(e)}` });
  }
}

const HISTORY_PAGE = 'dg/_history';
const HISTORY_KEEP_N = 5;

// Marques posées sur une copie d'historique (effacées sur la frame restaurée).
const HISTORY_TAGS = ['dg_history_pending', 'dg_history_pending_at', 'dg_history_version', 'dg_history_versions', 'dg_history_asset', 'dg_history_vnum', 'dg_history_hash', 'dg_history_gold'];

/** Page dg/_history chargée (dynamic-page : seule cette page, pas tout le fichier). */
async function historyPage(create: boolean): Promise<PageNode | undefined> {
  let page = figma.root.children.find(p => p.name === HISTORY_PAGE) as PageNode | undefined;
  if (!page && create) { page = figma.createPage(); page.name = HISTORY_PAGE; } // ne change PAS currentPage
  await page?.loadAsync();
  return page;
}

function readHistoryFrames(page: PageNode): HistoryFrameInfo[] {
  return page.children.map(c => {
    const list = (k: string): string[] => { try { return JSON.parse(c.getPluginData(k) || '[]') as string[]; } catch { return []; } };
    const vnum = c.getPluginData('dg_history_vnum');
    const legacy = c.getPluginData('dg_history_version'); // copie d'avant la couverture multi-versions
    const versionIds = list('dg_history_versions');
    return {
      id: c.id,
      key: c.getPluginData('dg_history_asset'),
      versionIds: versionIds.length ? versionIds : legacy ? [legacy] : [],
      versionNumber: vnum ? Number(vnum) : undefined,
      hash: c.getPluginData('dg_history_hash') || undefined,
      gold: list('dg_history_gold'),
      pending: c.getPluginData('dg_history_pending') !== '',
      pendingAt: Number(c.getPluginData('dg_history_pending_at')) || undefined,
    };
  });
}

// Capture → sauvegarde : identifiant de CETTE capture (ses copies en attente le portent) et dernières
// copies des frames inchangées, qui couvriront aussi la nouvelle version.
let pendingCover: { pageId: string; captureId: string; copyIds: string[] } | null = null;
const PENDING_MAX_AGE_MS = 3_600_000; // 1 h : absorbe les horloges décalées entre ordinateurs

// Capture (avant le POST) : copie seulement les frames qui ont changé depuis leur dernière
// copie ; les autres seront couvertes par celle-ci. Copies « en attente » jusqu'à la sauvegarde.
async function prepareCopies(pageId: string, frames: Array<{ node: SceneNode; snap: NodeSnapshot }>): Promise<void> {
  pendingCover = null;
  try {
    const hist = await historyPage(true);
    if (!hist) return;
    // Plusieurs designers capturent dans le même fichier : chacun n'efface que les captures
    // ABANDONNÉES (> 1 h), jamais celle d'un collègue encore en route.
    for (const id of stalePending(readHistoryFrames(hist), Date.now(), PENDING_MAX_AGE_MS)) hist.children.find(c => c.id === id)?.remove();
    const captureId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const copies = readHistoryFrames(hist);
    const cover: string[] = [];
    for (const { node, snap } of frames) {
      const key = snap.dg_id || snap.id;
      const hash = hashSnapshot(snap);
      const last = latestCopy(copies, key);
      if (last && last.hash === hash) { cover.push(last.id); continue; }
      if (!('clone' in node)) continue;
      const copy = (node as SceneNode & { clone(): SceneNode }).clone();
      hist.appendChild(copy);
      copy.setPluginData('dg_history_pending', captureId);
      copy.setPluginData('dg_history_pending_at', String(Date.now()));
      copy.setPluginData('dg_history_asset', key);
      copy.setPluginData('dg_history_hash', hash);
      copy.locked = true;
    }
    pendingCover = { pageId, captureId, copyIds: cover };
  } catch (e) {
    console.log('[DG] copies d\'historique (capture) échec', e);
  }
}

// Sauvegarde réussie : les copies couvrent la version, puis nettoyage (N par frame, Gold gardées).
async function handleStoreHistoryClone(pageId: string, versionId: string, versionNumber: number): Promise<void> {
  const mine = pendingCover?.pageId === pageId ? pendingCover : null;
  pendingCover = null;
  if (!mine) return;
  try {
    const hist = await historyPage(false);
    if (!hist) return;
    const infos = new Map(readHistoryFrames(hist).map(i => [i.id, i]));
    const keys = new Set<string>();
    for (const c of hist.children) {
      const info = infos.get(c.id)!;
      const isNew = c.getPluginData('dg_history_pending') === mine.captureId;
      if (!isNew && !mine.copyIds.includes(c.id)) continue;
      c.setPluginData('dg_history_versions', JSON.stringify([...info.versionIds, versionId]));
      if (isNew) {
        c.setPluginData('dg_history_vnum', String(versionNumber));
        c.setPluginData('dg_history_pending', '');
        c.setPluginData('dg_history_pending_at', '');
      }
      keys.add(info.key);
    }
    const all = readHistoryFrames(hist);
    for (const key of keys) for (const id of framesToPrune(all, key, HISTORY_KEEP_N)) hist.children.find(c => c.id === id)?.remove();
  } catch (e) {
    console.log('[DG] copies d\'historique (sauvegarde) échec', e);
  }
}

// Statut Gold : les copies qui couvrent la version ne seront jamais supprimées par le nettoyage.
async function protectHistory(versionId: string, gold: boolean): Promise<void> {
  const hist = await historyPage(false);
  if (!hist) return;
  for (const info of readHistoryFrames(hist)) {
    if (!info.versionIds.includes(versionId)) continue;
    const next = gold ? [...new Set([...info.gold, versionId])] : info.gold.filter(v => v !== versionId);
    hist.children.find(c => c.id === info.id)?.setPluginData('dg_history_gold', JSON.stringify(next));
  }
}

// Remplace la frame par une copie de sa copie d'historique, à sa place dans la pile (ou la
// fait revenir si elle a été supprimée). L'identité (dg_id) est conservée.
function restoreFromCopy(hist: PageNode, page: PageNode, copyId: string, live: SceneNode | undefined): SceneNode {
  const stored = hist.children.find(c => c.id === copyId) as SceneNode & { clone(): SceneNode };
  const fresh = stored.clone();
  for (const k of HISTORY_TAGS) fresh.setPluginData(k, '');
  fresh.locked = false;
  page.insertChild(live ? page.children.indexOf(live) : page.children.length, fresh);
  // PAS propagateIdentity : elle ré-identifierait la copie (prise pour un doublon) → frame en double.
  claimIdentity(fresh as unknown as BranchNode, stored.getPluginData('dg_history_asset') || undefined);
  live?.remove();
  return fresh;
}

// Checkpoint d'une page : chaque frame de la version revient à l'identique depuis sa copie,
// sinon par réapplication des valeurs. Restaurer ne supprime jamais rien.
async function restorePage(versionId: string, snapshot: FigmaSnapshot): Promise<void> {
  const page = figma.root.children.find(p => p.id === snapshot.figmaNodeId);
  if (!page) { send({ type: 'ERROR', message: 'La page de cette version n\'existe plus.' }); return; }
  if (page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
  const hist = await historyPage(false);
  const live = new Map(page.children.map(n => [frameKey(n as unknown as TrackableNode), n]));
  const steps = planPageRestore(snapshot.root.children ?? [], hist ? readHistoryFrames(hist) : [], versionId, live);
  let exact = 0, partial = 0, missing = 0;
  const restored: SceneNode[] = [];
  for (const step of steps) {
    try {
      if (step.kind === 'copy') { restored.push(restoreFromCopy(hist!, page, step.copyId, step.live)); exact++; }
      else if (step.kind === 'reapply') {
        const currMap = new Map<string, NodeSnapshot>();
        flattenSnapshot(extractSnapshot(step.live), currMap);
        await applyFullSnapshot(step.live, step.snap, currMap, true);
        restored.push(step.live); partial++;
      } else missing++;
    } catch (e) { console.warn('[DG] restore: frame sautée', step.snap.id, e); missing++; }
  }
  figma.commitUndo();
  if (restored.length) { page.selection = restored; figma.viewport.scrollAndZoomIntoView(restored); }
  send({ type: 'RESTORE_COMPLETE', applied: exact + partial, skipped: missing, mode: 'frames', exact, partial, missing });
}

async function handleSnapshot(): Promise<void> {
  const page = figma.currentPage;

  if (!isCapturablePage(page.name)) {
    send({ type: 'ERROR', message: `« ${page.name} » est une page technique Design Guardian : elle ne peut pas être capturée.` });
    return;
  }

  const tracked = page.children.filter(c => isTracked(c as unknown as TrackableNode));
  if (tracked.length === 0) {
    send({ type: 'ERROR', message: 'Aucune frame suivie. Coche les frames à suivre dans la liste, puis relance la capture.' });
    return;
  }

  await ensurePagesLoaded(); // dynamic-page : requis avant le clone d'historique (page dg/_history)

  // Éléments flottants : posés sur la page au-dessus d'une frame suivie (typiquement un
  // collage sans frame sélectionnée). Rangés sous cette frame pour rester capturés, sinon
  // ils seraient signalés supprimés alors qu'ils sont toujours visibles (cf. assignFloating).
  const boxOf = (n: SceneNode): Box | null => {
    const b = 'absoluteBoundingBox' in n ? n.absoluteBoundingBox : null;
    return b ? { id: n.id, x: b.x, y: b.y, w: b.width, h: b.height } : null;
  };
  const others = page.children.filter(c => !isTracked(c as unknown as TrackableNode));
  const hostOf = assignFloating(
    others.map(boxOf).filter((b): b is Box => b !== null),
    tracked.map(boxOf).filter((b): b is Box => b !== null),
  );
  const floating = others.filter(c => hostOf.has(c.id));
  const withFloating = (frame: SceneNode): NodeSnapshot => {
    const snap = extractSnapshot(frame);
    const extra = floating.filter(c => hostOf.get(c.id) === frame.id).map(c => ({ ...extractSnapshot(c), floating: true }));
    return extra.length > 0 ? { ...snap, children: [...(snap.children ?? []), ...extra] } : snap;
  };

  // Avant l'extraction (synchrone) : un nœud coupé-collé garde son dg_id au lieu d'être pris pour une copie.
  await adoptMovedIdentities([...tracked, ...floating] as unknown as BranchNode[],
    async (id) => (await figma.getNodeByIdAsync(id)) as unknown as IdentifiableNode | null);
  // Composant principal de chaque instance (échange de composant, variante), lu en parallèle.
  capturedComponents = await collectComponents([...tracked, ...floating] as unknown as TreeLike[], async (inst) => {
    const main = await (inst as unknown as InstanceNode).getMainComponentAsync();
    return main ? { key: main.key, name: main.name, parent: main.parent ? { type: main.parent.type, name: main.parent.name, key: main.parent.type === 'COMPONENT_SET' ? (main.parent as ComponentSetNode).key : undefined } : null } : null;
  });

  const figmaSnapshot: FigmaSnapshot = {
    figmaNodeId: page.id,
    figmaNodeName: page.name,
    capturedAt: new Date().toISOString(),
    root: {
      // dg_id de la page : apparie la racine elle-même (le diff apparie par dg_id nœud par nœud).
      dg_id: ensureNodeIdentity(page as unknown as Parameters<typeof ensureNodeIdentity>[0]),
      id: page.id,
      name: page.name,
      type: 'PAGE',
      // Géométrie CONSTANTE : c'est ce qui garantit que la racine ne produit aucun diff.
      // Une PageNode n'a de toute façon aucune géométrie (elle n'étend pas LayoutMixin).
      x: 0, y: 0, width: 0, height: 0,
      opacity: 1, fills: [], strokes: [],
      children: tracked.map(withFloating),
    },
  };

  // Clone d'historique PROVISOIRE (première frame suivie) : restauration par frame et clones
  // bornés relèvent de la Phase 4. Les rendus, eux, sont faits APRÈS le POST, frame par frame
  // (RENDER_FRAMES) : seul le serveur sait lesquelles ont changé.
  await prepareCopies(page.id, tracked.map((node, i) => ({ node, snap: figmaSnapshot.root.children![i] })));
  // nodeId = la PAGE : c'est elle l'identifiant du checkpoint, pas une frame.
  send({ type: 'SNAPSHOT_READY', snapshot: figmaSnapshot, nodeId: page.id });
}

// Rendu d'un nœud : SVG si vectoriel léger (zoom net), sinon PNG borné (échelle dégressive).
async function exportRender(node: SceneNode): Promise<{ b64: string; kind: 'svg' | 'png' } | null> {
  if (!('exportAsync' in node)) return null;
  const exportNode = node as ExportMixin;
  const toB64 = (bytes: Uint8Array): string => {
    const CHUNK = 8192; let b = '';
    for (let i = 0; i < bytes.length; i += CHUNK) b += String.fromCharCode(...Array.from(bytes.slice(i, Math.min(i + CHUNK, bytes.length))));
    return btoa(b);
  };
  try {
    const svgB64 = toB64(await exportNode.exportAsync({ format: 'SVG' }));
    if (chooseFormat(svgB64.length) === 'svg') return { b64: svgB64, kind: 'svg' };
    let png = '';
    for (const s of PNG_SCALES) {
      png = toB64(await exportNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: s } }));
      if (png.length <= PNG_MAX_B64 || s === 0.5) break;
    }
    return { b64: png, kind: 'png' };
  } catch (e) {
    console.log('[DG] export failed:', e);
    return null;
  }
}

// ─── Snapshot extraction ──────────────────────────────────────────────────────

// figma.mixed is a Symbol — not serializable via postMessage
function safeNum(v: unknown): number | undefined {
  return typeof v === 'symbol' ? undefined : (v as number);
}

function safeStr(v: unknown): string | undefined {
  return typeof v === 'symbol' ? undefined : (v as string);
}

// Lecture guardée du mode de dimensionnement auto-layout. Le getter n'existe/ne
// s'applique que sur un enfant direct d'un frame auto-layout (sinon throw) → try/catch.
function extractLayoutSizing(
  node: SceneNode,
  key: 'layoutSizingHorizontal' | 'layoutSizingVertical',
): 'FIXED' | 'HUG' | 'FILL' | undefined {
  try {
    const v = (node as unknown as Record<string, unknown>)[key];
    return v === 'FIXED' || v === 'HUG' || v === 'FILL' ? v : undefined;
  } catch {
    return undefined;
  }
}

// Lecture guardée du positionnement auto-layout ('AUTO' = dans le flux, 'ABSOLUTE' = libre).
// Le getter peut throw hors auto-layout → try/catch. Sert à la significativité (géométrie dérivée).
function extractLayoutPositioning(node: SceneNode): 'AUTO' | 'ABSOLUTE' | undefined {
  try {
    const v = (node as unknown as Record<string, unknown>).layoutPositioning;
    return v === 'AUTO' || v === 'ABSOLUTE' ? v : undefined;
  } catch {
    return undefined;
  }
}

function extractRotation(node: SceneNode): number {
  // absoluteTransform row 0: [cos(θ), -sin(θ), tx] — note the negative sin
  // atan2(-sin(θ), cos(θ)) = -θ, so we negate to get the actual clockwise angle
  const a = node.absoluteTransform[0][0];
  const b = node.absoluteTransform[0][1];
  const deg = -Math.round(Math.atan2(b, a) * (180 / Math.PI) * 100) / 100;
  return deg === 0 ? 0 : deg;
}

// Instance : composant principal (passe préalable) et variantes (componentProperties).
function componentOf(node: SceneNode): NodeSnapshot['component'] {
  if (node.type !== 'INSTANCE') return undefined;
  const info = capturedComponents.get(node.id);
  if (!info) return undefined;
  let props: Record<string, { type: string; value: string | boolean }> | undefined;
  try { props = node.componentProperties as unknown as typeof props; } catch { props = undefined; }
  const variant = variantOf(props);
  return variant ? { ...info, variant } : info;
}

function extractSnapshot(node: SceneNode): NodeSnapshot {
  return {
    dg_id: ensureNodeIdentity(node),
    id: node.id,
    name: node.name,
    type: node.type,
    x: node.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2],
    width:    'width'   in node ? (node as { width: number }).width    : 0,
    height:   'height'  in node ? (node as { height: number }).height  : 0,
    // AABB visuelle absolue (axis-aligned, rotations/effets inclus) → surlignage/crops corrects pour les nœuds rotés.
    aabb: ('absoluteBoundingBox' in node && node.absoluteBoundingBox)
      ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y, w: node.absoluteBoundingBox.width, h: node.absoluteBoundingBox.height }
      : undefined,
    opacity:  'opacity' in node ? (node as { opacity: number }).opacity : 1,
    visible:  'visible' in node ? (node as { visible: boolean }).visible : true,
    rotation: extractRotation(node),
    fills:    extractFills(node),
    strokes:  extractStrokes(node),
    strokeWeight: safeNum('strokeWeight' in node ? (node as { strokeWeight: number | symbol }).strokeWeight : undefined),
    cornerRadius: safeNum('cornerRadius' in node ? (node as { cornerRadius: number | symbol }).cornerRadius : undefined),
    cornerRadii: computeCornerRadii(node as unknown as CornerInput),
    layoutSizingHorizontal: extractLayoutSizing(node, 'layoutSizingHorizontal'),
    layoutSizingVertical:   extractLayoutSizing(node, 'layoutSizingVertical'),
    layoutPositioning:      extractLayoutPositioning(node),
    layoutMode:             'layoutMode' in node ? (node as FrameNode).layoutMode : undefined,
    autoLayout:             autoLayoutOf(node as unknown as AutoLayoutLike),
    component:              componentOf(node),
    vectorPaths:  extractVectorPaths(node),
    effects:      extractEffects(node),
    characters:   node.type === 'TEXT' ? safeStr((node as unknown as TextNode).characters) : undefined,
    fontSize:     node.type === 'TEXT' ? safeNum((node as unknown as TextNode).fontSize as number | symbol) : undefined,
    fontFamily:   node.type === 'TEXT' ? (() => {
                    const fn = (node as unknown as TextNode).fontName;
                    return typeof fn === 'object' && fn !== null && !Array.isArray(fn) ? (fn as FontName).family : undefined;
                  })() : undefined,
    fontWeight:   node.type === 'TEXT' ? (() => {
                    const fn = (node as unknown as TextNode).fontName;
                    if (typeof fn !== 'object' || fn === null || Array.isArray(fn)) return undefined;
                    const style = (fn as FontName).style.toLowerCase();
                    if (style.includes('thin')) return 100;
                    if (style.includes('extralight') || style.includes('extra light') || style.includes('ultralight')) return 200;
                    if (style.includes('light')) return 300;
                    if (style.includes('medium')) return 500;
                    if (style.includes('semibold') || style.includes('semi bold') || style.includes('demibold')) return 600;
                    if (style.includes('extrabold') || style.includes('extra bold') || style.includes('ultrabold')) return 800;
                    if (style.includes('black') || style.includes('heavy')) return 900;
                    if (style.includes('bold')) return 700;
                    return 400;
                  })() : undefined,
    fontStyle:    node.type === 'TEXT' ? (() => {
                    const fn = (node as unknown as TextNode).fontName;
                    if (typeof fn !== 'object' || fn === null || Array.isArray(fn)) return undefined;
                    return (fn as FontName).style.toLowerCase().includes('italic') ? 'italic' : 'normal';
                  })() : undefined,
    // Raw Figma style string ("Medium", "Book", "DemiBold Italic"…) — source of truth for restore
    fontStyleName: node.type === 'TEXT' ? (() => {
                    const fn = (node as unknown as TextNode).fontName;
                    if (typeof fn !== 'object' || fn === null || Array.isArray(fn)) return undefined;
                    return (fn as FontName).style;
                  })() : undefined,
    letterSpacing: node.type === 'TEXT' ? (() => {
      const ls = (node as unknown as TextNode).letterSpacing;
      return typeof ls === 'object' && ls !== null && (ls as { unit?: string }).unit === 'PIXELS' ? (ls as { value: number }).value : undefined;
    })() : undefined,
    lineHeight: node.type === 'TEXT' ? (() => {
      const lh = (node as unknown as TextNode).lineHeight;
      return typeof lh === 'object' && lh !== null && (lh as { unit?: string }).unit === 'PIXELS' ? (lh as { value: number }).value : undefined;
    })() : undefined,
    children: 'children' in node ? (node as ChildrenMixin).children.map(extractSnapshot) : [],
  };
}

function extractFills(node: SceneNode): FigmaFill[] {
  if (!('fills' in node)) return [];
  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) return [];
  return fills.map(f => {
    const base: FigmaFill = { type: f.type, opacity: f.opacity, visible: f.visible };
    if (f.type === 'SOLID' && f.color) {
      base.color = { ...f.color, a: f.opacity ?? 1 };
    }
    if ((f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') && 'gradientStops' in f) {
      base.gradientStops = (f as { gradientStops: Array<{ position: number; color: { r: number; g: number; b: number; a: number } }> }).gradientStops
        .map(s => ({ position: s.position, color: s.color }));
      // Approximate angle from gradientTransform matrix
      if ('gradientTransform' in f) {
        const gt = (f as { gradientTransform: number[][] }).gradientTransform;
        base.gradientAngle = Math.round(Math.atan2(gt[0][1], gt[0][0]) * (180 / Math.PI));
      }
    }
    if (f.type === 'IMAGE') {
      base.imageHash = (f as ImagePaint).imageHash ?? undefined;
      base.scaleMode = (f as ImagePaint).scaleMode;
    }
    return base;
  });
}

function extractStrokes(node: SceneNode): FigmaStroke[] {
  if (!('strokes' in node)) return [];
  const strokes = (node as GeometryMixin).strokes;
  if (!Array.isArray(strokes)) return [];
  return strokes.map(s => strokeOf(s as unknown as PaintLike));
}

function extractVectorPaths(node: SceneNode): FigmaVectorPath[] | undefined {
  if (!('vectorPaths' in node)) return undefined;
  return (node as VectorNode).vectorPaths
    .filter(p => p.windingRule === 'EVENODD' || p.windingRule === 'NONZERO')
    .map(p => ({ windingRule: p.windingRule as 'EVENODD' | 'NONZERO', data: p.data }));
}

function extractEffects(node: SceneNode): FigmaEffect[] | undefined {
  if (!('effects' in node)) return undefined;
  const effects = (node as { effects: ReadonlyArray<Effect> }).effects;
  if (!effects || effects.length === 0) return undefined;
  const result: FigmaEffect[] = [];
  for (const e of effects) {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const shadow = e as DropShadowEffect | InnerShadowEffect;
      result.push({
        type: e.type,
        visible: e.visible,
        radius: shadow.radius,
        color: shadow.color,
        offset: shadow.offset,
        spread: spreadOf(shadow as unknown as EffectLike),
      });
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      result.push({ type: e.type, visible: e.visible, radius: (e as BlurEffect).radius });
    }
  }
  return result.length > 0 ? result : undefined;
}

async function handleCreateBranch(branchName: string): Promise<void> {
  if (figma.currentPage.selection.length === 0) {
    send({ type: 'ERROR', message: 'Sélectionne au moins un frame pour créer la branche.' });
    return;
  }
  await ensurePagesLoaded(); // liste + bascule des pages dg/* → toutes les pages doivent être chargées
  const pageName = `dg/${branchName}`;
  const existing = figma.root.children.find(p => p.name === pageName) as PageNode | undefined;
  if (existing) {
    figma.currentPage = existing;
    send({ type: 'BRANCH_CREATED', branchName });
    return;
  }
  const newPage = figma.createPage();
  newPage.name = pageName;
  for (const node of figma.currentPage.selection) {
    const clone = node.clone();
    newPage.appendChild(clone);
    // Propage l'identité : le clone partage le dg_id de l'original (corrélation
    // cross-branche) sans dépendre du comportement non documenté de clone()+pluginData.
    propagateIdentity(node as unknown as BranchNode, clone as unknown as BranchNode);
  }
  figma.currentPage = newPage;
  send({ type: 'BRANCH_CREATED', branchName });
}

async function handleSwitchBranch(branchName: string): Promise<void> {
  await ensurePagesLoaded(); // bascule vers une page dg/* → toutes les pages doivent être chargées
  let page: PageNode | undefined;
  if (branchName === 'main') {
    // Use stored main page ID first — reliable even if the file has multiple non-dg pages
    const mainId = figma.root.getPluginData('dg_main_page_id');
    page = mainId
      ? figma.root.children.find(p => p.id === mainId) as PageNode | undefined
      : figma.root.children.find(p => !p.name.startsWith('dg/')) as PageNode | undefined;
  } else {
    page = figma.root.children.find(p => p.name === `dg/${branchName}`) as PageNode | undefined;
  }
  if (page) {
    figma.currentPage = page;
    send({ type: 'BRANCH_SWITCHED', branchName });
  } else {
    send({ type: 'ERROR', message: branchName === 'main' ? 'Page principale introuvable.' : `Branche "${branchName}" introuvable. Crée-la d'abord depuis le champ de branche.` });
  }
}

function send(msg: MainToUI): void { figma.ui.postMessage(msg); }
