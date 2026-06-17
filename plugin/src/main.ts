// ─── MAIN THREAD ─────────────────────────────────────────────────────────────
// Accès exclusif à l'API Figma. Communication UI via postMessage uniquement.
// ─────────────────────────────────────────────────────────────────────────────

import type { MainToUI, UIToMain, NodeSnapshot, FigmaFill, FigmaStroke, FigmaVectorPath, FigmaEffect, FigmaSnapshot } from './types';
import { changedProps, pickMatch, planResize } from './restoreDiff.js';
import { ensureNodeIdentity, propagateIdentity, readDgId, findByDgId, type BranchNode } from './figmaIdentity.js';
import { decodeBase64Utf8 } from './utils.js';

figma.showUI(__html__, { width: 400, height: 600 });

// Generate a cryptographically random hex ID.
function generateFileId(): string {
  const bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Key resolution order — ensures all editors of the same file share one project:
// 1. figma.fileKey          — available in dev mode + some Figma plans
// 2. figma.root.getPluginData — stored in the file itself, shared across all users
// 3. figma.clientStorage    — legacy per-user fallback (promotes to shared on write)
// 4. Fresh generated ID     — first-ever open, written to both stores
(async () => {
  let fileKey: string =
    (figma.fileKey as string | undefined) ??
    figma.root.getPluginData('dg_file_id') ??
    '';

  if (!fileKey) {
    const userKey = await figma.clientStorage.getAsync('dg_file_id') as string | undefined;
    if (userKey) {
      fileKey = userKey;
      // Promote legacy per-user key to file-scoped shared storage.
      try { figma.root.setPluginData('dg_file_id', fileKey); } catch { /* read-only viewer */ }
    }
  }

  if (!fileKey) {
    fileKey = generateFileId();
    try { figma.root.setPluginData('dg_file_id', fileKey); } catch { /* read-only viewer */ }
    await figma.clientStorage.setAsync('dg_file_id', fileKey);
  }

  // Store main page ID once so handleSwitchBranch can find it reliably.
  if (!figma.root.getPluginData('dg_main_page_id')) {
    try { figma.root.setPluginData('dg_main_page_id', figma.currentPage.id); } catch { /* read-only */ }
  }

  send({ type: 'FILE_INFO', fileKey, fileName: figma.root.name });
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
      const key = (figma.fileKey as string | undefined) ?? figma.root.getPluginData('dg_file_id');
      if (key) send({ type: 'FILE_INFO', fileKey: key, fileName: figma.root.name });
      break;
    }
    case 'OPEN_EXTERNAL':     figma.openExternal(msg.url); break;
    case 'RESIZE':            figma.ui.resize(msg.width, msg.height); break;
    case 'CREATE_BRANCH':     await handleCreateBranch(msg.branchName); break;
    case 'SWITCH_BRANCH':     handleSwitchBranch(msg.branchName); break;
    case 'RESTORE_TO_FIGMA':  await handleRestoreToFigma(msg.snapshot, msg.render_svg_b64); break;
  }
};

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
  if (props.has('cornerRadius') && 'cornerRadius' in node && snap.cornerRadius !== undefined)
    (node as CornerMixin).cornerRadius = snap.cornerRadius;
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
  if (node.type === 'TEXT' && (props.has('fontFamily') || props.has('fontWeight') || props.has('fontStyle') || props.has('characters') || props.has('fontSize'))) {
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
  if (props.has('vectorPaths') && 'vectorPaths' in node && snap.vectorPaths?.length)
    (node as VectorNode).vectorPaths = snap.vectorPaths as VectorPath[];
}

// Every property a snapshot can hold. Root excludes geometry (don't move/resize
// the tracked frame); children include it (restore their layout within the frame).
const RESTORE_PROPS = ['opacity', 'visible', 'rotation', 'cornerRadius', 'strokeWeight', 'fills', 'strokes', 'effects', 'fontFamily', 'fontWeight', 'fontStyle', 'characters', 'fontSize', 'vectorPaths'];
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

  if ('children' in node && snap.children) {
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

async function handleRestoreToFigma(snapshot: FigmaSnapshot, renderSvgB64?: string): Promise<void> {
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
      send({ type: 'RESTORE_COMPLETE', applied: result.applied, skipped: result.skipped });
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

async function handleSnapshot(): Promise<void> {
  const [node] = figma.currentPage.selection;
  if (!node) { send({ type: 'ERROR', message: 'Sélectionne un élément dans Figma.' }); return; }
  if (figma.currentPage.selection.length > 1) { send({ type: 'ERROR', message: 'Sélectionne un seul élément.' }); return; }

  const figmaSnapshot: FigmaSnapshot = {
    figmaNodeId: node.id,
    figmaNodeName: node.name,
    capturedAt: new Date().toISOString(),
    root: extractSnapshot(node),
  };

  // Pixel-perfect SVG via exportAsync — requires "exports" permission in manifest
  let render_svg_b64: string | undefined;
  if ('exportAsync' in node) {
    try {
      const bytes = await (node as ExportMixin).exportAsync({ format: 'SVG' });
      // Chunk-based btoa — handles binary-safe UTF-8 without stack overflow
      const CHUNK = 8192;
      let b = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        b += String.fromCharCode(...Array.from(bytes.slice(i, Math.min(i + CHUNK, bytes.length))));
      }
      const b64 = btoa(b);
      if (b64.length < 2_000_000) render_svg_b64 = b64;
      console.log('[DG] exportAsync SVG:', bytes.length, 'bytes →', b64.length, 'b64 chars', render_svg_b64 ? '✓' : '(skipped: too large)');
    } catch (e) {
      console.log('[DG] exportAsync failed:', e);
    }
  }

  send({ type: 'SNAPSHOT_READY', snapshot: figmaSnapshot, nodeId: node.id, render_svg_b64 });
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

function extractRotation(node: SceneNode): number {
  // absoluteTransform row 0: [cos(θ), -sin(θ), tx] — note the negative sin
  // atan2(-sin(θ), cos(θ)) = -θ, so we negate to get the actual clockwise angle
  const a = node.absoluteTransform[0][0];
  const b = node.absoluteTransform[0][1];
  const deg = -Math.round(Math.atan2(b, a) * (180 / Math.PI) * 100) / 100;
  return deg === 0 ? 0 : deg;
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
    opacity:  'opacity' in node ? (node as { opacity: number }).opacity : 1,
    visible:  'visible' in node ? (node as { visible: boolean }).visible : true,
    rotation: extractRotation(node),
    fills:    extractFills(node),
    strokes:  extractStrokes(node),
    strokeWeight: safeNum('strokeWeight' in node ? (node as { strokeWeight: number | symbol }).strokeWeight : undefined),
    cornerRadius: safeNum('cornerRadius' in node ? (node as { cornerRadius: number | symbol }).cornerRadius : undefined),
    layoutSizingHorizontal: extractLayoutSizing(node, 'layoutSizingHorizontal'),
    layoutSizingVertical:   extractLayoutSizing(node, 'layoutSizingVertical'),
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
  return strokes.map(s => ({
    type: s.type,
    color: s.type === 'SOLID' ? { ...s.color, a: s.opacity ?? 1 } : undefined,
    opacity: s.opacity,
  }));
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

function handleSwitchBranch(branchName: string): void {
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
