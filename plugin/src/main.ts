// ─── MAIN THREAD ─────────────────────────────────────────────────────────────
// Accès exclusif à l'API Figma. Communication UI via postMessage uniquement.
// ─────────────────────────────────────────────────────────────────────────────

import type { MainToUI, UIToMain, NodeSnapshot, FigmaFill, FigmaStroke, FigmaVectorPath, FigmaEffect, FigmaSnapshot } from './types';

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

async function handleRestoreToFigma(snapshot: FigmaSnapshot, renderSvgB64?: string): Promise<void> {
  const root = await figma.getNodeByIdAsync(snapshot.figmaNodeId) as SceneNode | null;
  const onCurrentPage = root !== null && root.parent === figma.currentPage;

  // No SVG stored (very old checkpoint pre-exportAsync) — property fallback, same-branch only.
  if (!renderSvgB64) {
    if (!root || !onCurrentPage) {
      send({ type: 'ERROR', message: 'Pas de visuel stocké pour cette version. Recapturez un checkpoint.' });
      return;
    }
    try {
      const { applied, skipped } = await applySnapshot(root, snapshot.root, snapshot.root.x, snapshot.root.y, true);
      send({ type: 'RESTORE_COMPLETE', applied, skipped });
    } catch (e) {
      send({ type: 'ERROR', message: `Erreur restauration : ${String(e)}` });
    }
    return;
  }

  // SVG-based restore — same path for same-branch and cross-branch.
  // No property reconstruction: the captured exportAsync SVG is the source of truth.
  try {
    const svgString = atob(renderSvgB64);
    const newNode = figma.createNodeFromSvg(svgString);
    newNode.name = snapshot.figmaNodeName;

    if (onCurrentPage && root) {
      // Same-branch: replace the existing node, keep its current position and z-order.
      const parent = root.parent as PageNode;
      const idx = (parent.children as readonly SceneNode[]).indexOf(root as SceneNode);
      newNode.x = (root as FrameNode).x;
      newNode.y = (root as FrameNode).y;
      parent.appendChild(newNode);
      if (idx >= 0) parent.insertChild(idx, newNode);
      root.remove();
    } else {
      // Cross-branch: add to current page at the snapshot's original canvas position.
      newNode.x = snapshot.root.x;
      newNode.y = snapshot.root.y;
      figma.currentPage.appendChild(newNode);
    }

    figma.currentPage.selection = [newNode];
    figma.viewport.scrollAndZoomIntoView([newNode]);
    send({ type: 'RESTORE_COMPLETE', applied: 1, skipped: 0 });
  } catch (e) {
    send({ type: 'ERROR', message: `Erreur restauration : ${String(e)}` });
  }
}

async function applySnapshot(
  node: SceneNode,
  snap: NodeSnapshot,
  parentAbsX: number,
  parentAbsY: number,
  isRoot: boolean
): Promise<{ applied: number; skipped: number }> {
  let applied = 0, skipped = 0;
  try {
    // Auto-layout children: Figma owns their position + size — manual override corrupts layout
    const inAutoLayout = !isRoot && (() => {
      const p = node.parent;
      return !!(p && 'layoutMode' in p && (p as FrameNode).layoutMode !== 'NONE');
    })();

    // Position relative au parent — skip root and auto-layout children
    if (!isRoot && !inAutoLayout && 'x' in node && 'y' in node) {
      (node as { x: number; y: number }).x = snap.x - parentAbsX;
      (node as { x: number; y: number }).y = snap.y - parentAbsY;
    }

    // Taille — skip root (déclenche le recalcul des contraintes BOTTOM sur les enfants)
    // et skip auto-layout children (Figma throws "Cannot resize auto layout child")
    if ('resize' in node && !isRoot && !inAutoLayout) {
      (node as LayoutMixin).resize(snap.width, snap.height);
    }

    // Opacité / visibilité
    if ('opacity' in node)  (node as BlendMixin).opacity = snap.opacity;
    if ('visible' in node && snap.visible !== undefined) node.visible = snap.visible;

    // Fills — SOLID + linear/radial gradients (angle approximated from stored value)
    if ('fills' in node) {
      const paints: Paint[] = [];
      for (const f of snap.fills) {
        if (f.type === 'SOLID' && f.color) {
          paints.push({
            type: 'SOLID',
            color: { r: f.color.r, g: f.color.g, b: f.color.b },
            opacity: f.color.a,
            visible: f.visible ?? true,
          } as SolidPaint);
        } else if ((f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') && f.gradientStops?.length) {
          const r = ((f.gradientAngle ?? 0) * Math.PI) / 180;
          const cos = Math.cos(r);
          const sin = Math.sin(r);
          paints.push({
            type: f.type,
            gradientStops: f.gradientStops.map(s => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            })),
            // Centered gradient transform reconstructed from stored angle
            gradientTransform: [
              [cos, sin, 0.5 * (1 - cos - sin)],
              [-sin, cos, 0.5 * (1 + sin - cos)],
            ] as Transform,
            visible: f.visible ?? true,
            opacity: f.opacity ?? 1,
          } as GradientPaint);
        }
      }
      if (paints.length > 0) (node as GeometryMixin).fills = paints;
    }

    // Strokes
    if ('strokes' in node) {
      const paints: Paint[] = snap.strokes
        .filter(s => s.type === 'SOLID' && s.color)
        .map(s => ({
          type: 'SOLID' as const,
          color: { r: s.color!.r, g: s.color!.g, b: s.color!.b },
          opacity: s.opacity ?? s.color!.a,
          visible: true,
        } as SolidPaint));
      if (paints.length > 0) (node as GeometryMixin).strokes = paints;
    }

    // Stroke weight + corner radius
    if ('strokeWeight' in node && snap.strokeWeight !== undefined)
      (node as IndividualStrokesMixin).strokeWeight = snap.strokeWeight;
    if ('cornerRadius' in node && snap.cornerRadius !== undefined)
      (node as CornerMixin).cornerRadius = snap.cornerRadius;

    // Texte
    if (node.type === 'TEXT' && snap.characters !== undefined) {
      const t = node as TextNode;
      const fn = typeof t.fontName !== 'symbol' && !Array.isArray(t.fontName)
        ? t.fontName as FontName
        : { family: 'Inter', style: 'Regular' } as FontName;
      await figma.loadFontAsync(fn);
      t.characters = snap.characters;
      if (snap.fontSize !== undefined && typeof t.fontSize !== 'symbol') t.fontSize = snap.fontSize;
    }

    applied++;
  } catch { skipped++; }

  // Récursion sur les enfants matchés par ID
  if ('children' in node && snap.children) {
    for (const childSnap of snap.children) {
      const match = (node as ChildrenMixin).children.find(c => c.id === childSnap.id) as SceneNode | undefined;
      if (match) {
        const r = await applySnapshot(match, childSnap, snap.x, snap.y, false);
        applied += r.applied; skipped += r.skipped;
      } else { skipped++; }
    }
  }
  return { applied, skipped };
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
    newPage.appendChild(node.clone());
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
