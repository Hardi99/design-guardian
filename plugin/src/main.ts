// ─── MAIN THREAD ─────────────────────────────────────────────────────────────
// Accès exclusif à l'API Figma. Communication UI via postMessage uniquement.
// ─────────────────────────────────────────────────────────────────────────────

import type { MainToUI, UIToMain, NodeSnapshot, FigmaFill, FigmaStroke, FigmaVectorPath, FigmaSnapshot } from './types';

figma.showUI(__html__, { width: 400, height: 600 });

// Send Figma file identity — UI calls auto-init with this
send({ type: 'FILE_INFO', fileKey: figma.fileKey ?? figma.root.id, fileName: figma.root.name });

// Attribution — no login needed
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

  console.log('[DG] figma.apiVersion:', figma.apiVersion);
  // Re-fetch node via ID to get a clean (non-selection-proxy) reference
  const exportNode = figma.getNodeById(node.id) as (SceneNode & ExportMixin) | null;
  let svgBase64 = '';
  if (exportNode && 'exportAsync' in exportNode) {
    for (const fmt of ['SVG', 'PNG'] as const) {
      try {
        const bytes: Uint8Array = await exportNode.exportAsync({ format: fmt });
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        svgBase64 = btoa(binary);
        console.log(`[DG] ${fmt} export OK, length:`, svgBase64.length);
        break;
      } catch (e) {
        console.warn(`[DG] ${fmt} export failed:`, (e as Error).message, (e as Error).stack);
      }
    }
  } else {
    console.warn('[DG] Node has no exportAsync:', node.type);
  }

  send({ type: 'SNAPSHOT_READY', snapshot: figmaSnapshot, svgBase64, nodeId: node.id });
}

// ─── Snapshot extraction (native Figma properties — source of truth for diff) ─

function extractSnapshot(node: SceneNode): NodeSnapshot {
  const snap: NodeSnapshot = {
    id: node.id, name: node.name, type: node.type,
    x: node.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2],
    width:  'width'  in node ? (node as { width: number }).width  : 0,
    height: 'height' in node ? (node as { height: number }).height : 0,
    opacity: 'opacity' in node ? (node as { opacity: number }).opacity : 1,
    fills:   extractFills(node),
    strokes: extractStrokes(node),
    strokeWeight:  'strokeWeight'  in node ? (node as { strokeWeight: number }).strokeWeight   : undefined,
    cornerRadius:  'cornerRadius'  in node ? (node as { cornerRadius: number | symbol }).cornerRadius as number : undefined,
    vectorPaths: extractVectorPaths(node),
    children: 'children' in node ? (node as ChildrenMixin).children.map(extractSnapshot) : [],
  };
  return snap;
}

function extractFills(node: SceneNode): FigmaFill[] {
  if (!('fills' in node)) return [];
  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) return [];
  return fills.map(f => ({ type: f.type, color: f.type === 'SOLID' ? { ...f.color, a: f.opacity ?? 1 } : undefined, opacity: f.opacity, visible: f.visible }));
}

function extractStrokes(node: SceneNode): FigmaStroke[] {
  if (!('strokes' in node)) return [];
  const strokes = (node as GeometryMixin).strokes;
  if (!Array.isArray(strokes)) return [];
  return strokes.map(s => ({ type: s.type, color: s.type === 'SOLID' ? { ...s.color, a: s.opacity ?? 1 } : undefined, opacity: s.opacity }));
}

function extractVectorPaths(node: SceneNode): FigmaVectorPath[] | undefined {
  if (!('vectorPaths' in node)) return undefined;
  return (node as VectorNode).vectorPaths
    .filter(p => p.windingRule === 'EVENODD' || p.windingRule === 'NONZERO')
    .map(p => ({ windingRule: p.windingRule as 'EVENODD' | 'NONZERO', data: p.data }));
}

function send(msg: MainToUI): void { figma.ui.postMessage(msg); }
