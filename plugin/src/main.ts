// ─── MAIN THREAD ─────────────────────────────────────────────────────────────
// Accès exclusif à l'API Figma. Communication UI via postMessage uniquement.
// ─────────────────────────────────────────────────────────────────────────────

import type { MainToUI, UIToMain, NodeSnapshot, FigmaFill, FigmaStroke, FigmaVectorPath, FigmaEffect, FigmaSnapshot } from './types';

figma.showUI(__html__, { width: 400, height: 600 });

send({ type: 'FILE_INFO', fileKey: figma.fileKey ?? figma.root.id, fileName: figma.root.name });

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
    case 'REQUEST_SNAPSHOT': await handleSnapshot(); break;
    case 'OPEN_EXTERNAL':    figma.openExternal(msg.url); break;
    case 'RESIZE':           figma.ui.resize(msg.width, msg.height); break;
  }
};

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

  send({ type: 'SNAPSHOT_READY', snapshot: figmaSnapshot, nodeId: node.id });
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
  // absoluteTransform: [[a, b, tx], [c, d, ty]]
  // rotation = atan2(b, a) in degrees
  const a = node.absoluteTransform[0][0];
  const b = node.absoluteTransform[0][1];
  const deg = Math.round(Math.atan2(b, a) * (180 / Math.PI) * 100) / 100;
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
    characters:   safeStr('characters' in node ? (node as { characters: string | symbol }).characters : undefined),
    fontSize:     safeNum('fontSize'   in node ? (node as { fontSize: number | symbol }).fontSize    : undefined),
    fontFamily:   'fontName' in node && typeof (node as { fontName: unknown }).fontName === 'object' && (node as { fontName: unknown }).fontName !== null
                    ? ((node as { fontName: { family: string } }).fontName.family)
                    : undefined,
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

function send(msg: MainToUI): void { figma.ui.postMessage(msg); }
