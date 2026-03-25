import type { FigmaSnapshot, NodeSnapshot, FigmaFill, FigmaStroke } from '../types/figma.js';

const r2 = (n: number): number => Math.round(n * 100) / 100;

function toHex(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
}

interface ColorResult { hex: string; opacity: number }

function resolveFill(fills: FigmaFill[]): ColorResult | null {
  for (const fill of fills) {
    if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
      const { r, g, b, a } = fill.color;
      return { hex: `#${toHex(r * 255)}${toHex(g * 255)}${toHex(b * 255)}`, opacity: fill.opacity !== undefined ? fill.opacity : a };
    }
  }
  return null;
}

function resolveStroke(strokes: FigmaStroke[]): ColorResult | null {
  for (const stroke of strokes) {
    if (stroke.type === 'SOLID' && stroke.color) {
      const { r, g, b, a } = stroke.color;
      return { hex: `#${toHex(r * 255)}${toHex(g * 255)}${toHex(b * 255)}`, opacity: stroke.opacity !== undefined ? stroke.opacity : a };
    }
  }
  return null;
}

function fillAttrs(fill: ColorResult | null): string {
  if (!fill) return 'fill="none"';
  const op = fill.opacity < 1 ? ` fill-opacity="${r2(fill.opacity)}"` : '';
  return `fill="${fill.hex}"${op}`;
}

function strokeAttrStr(stroke: ColorResult | null, weight: number): string {
  if (!stroke || weight === 0) return '';
  const op = stroke.opacity < 1 ? ` stroke-opacity="${r2(stroke.opacity)}"` : '';
  return ` stroke="${stroke.hex}"${op} stroke-width="${r2(weight)}"`;
}


function renderNode(node: NodeSnapshot, parentX: number, parentY: number): string {
  const relX = r2(node.x - parentX);
  const relY = r2(node.y - parentY);
  const fill = resolveFill(node.fills);
  const stroke = resolveStroke(node.strokes);
  const strokeWeight = node.strokeWeight ?? 0;
  const opacity = node.opacity < 1 ? ` opacity="${r2(node.opacity)}"` : '';
  const strokeAttrs = strokeAttrStr(stroke, strokeWeight);
  const type = node.type;

  if (type === 'RECTANGLE') {
    const rx = node.cornerRadius ? ` rx="${r2(node.cornerRadius)}" ry="${r2(node.cornerRadius)}"` : '';
    return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillAttrs(fill)}${rx}${strokeAttrs}${opacity}/>`;
  }

  if (type === 'ELLIPSE') {
    const cx = r2(relX + node.width / 2);
    const cy = r2(relY + node.height / 2);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${r2(node.width / 2)}" ry="${r2(node.height / 2)}" ${fillAttrs(fill)}${strokeAttrs}${opacity}/>`;
  }

  if (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(type)) {
    const children = (node.children ?? [])
      .map((child) => renderNode(child, node.x, node.y))
      .join('\n');
    const bg = fill ? `<rect x="0" y="0" width="${r2(node.width)}" height="${r2(node.height)}" ${fillAttrs(fill)}${strokeAttrs}/>` : '';
    const translate = relX !== 0 || relY !== 0 ? ` transform="translate(${relX},${relY})"` : '';
    return `<g${translate}${opacity}>\n${bg}\n${children}\n</g>`;
  }

  if (['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION'].includes(type)) {
    if (node.vectorPaths && node.vectorPaths.length > 0) {
      const paths = node.vectorPaths
        .map((vp) => `<path d="${vp.data}" fill-rule="${vp.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero'}" ${fillAttrs(fill)}${strokeAttrs}/>`)
        .join('\n');
      return `<g transform="translate(${relX},${relY})"${opacity}>\n${paths}\n</g>`;
    }
    return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillAttrs(fill)}${strokeAttrs}${opacity}/>`;
  }

  if (type === 'TEXT') {
    const f = fill ?? { hex: '#808080', opacity: 0.2 };
    return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillAttrs(f)}${strokeAttrs}${opacity}/>`;
  }

  return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillAttrs(fill)}${strokeAttrs}${opacity}/>`;
}

export function generateSvgFromSnapshot(snapshot: FigmaSnapshot): string {
  const root = snapshot.root;
  const pad  = r2((root.strokeWeight ?? 0) / 2);
  const w    = r2(root.width  + pad * 2);
  const h    = r2(root.height + pad * 2);
  // Render root at (0,0) with padding so strokes aren't clipped
  const content = renderNode(root, r2(root.x - pad), r2(root.y - pad));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${content}\n</svg>`;
}

export function findNodeById(root: NodeSnapshot, id: string): NodeSnapshot | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

export function generateSvgFromNode(node: NodeSnapshot): string {
  const pad  = r2((node.strokeWeight ?? 0) / 2);
  const w    = r2(node.width  + pad * 2);
  const h    = r2(node.height + pad * 2);
  const content = renderNode(node, r2(node.x - pad), r2(node.y - pad));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${content}\n</svg>`;
}
