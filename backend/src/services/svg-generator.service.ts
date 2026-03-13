import type { FigmaSnapshot, NodeSnapshot, FigmaFill, FigmaStroke } from '../types/figma.js';

const r2 = (n: number): number => Math.round(n * 100) / 100;

function resolveFill(fills: FigmaFill[]): string {
  for (const fill of fills) {
    if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
      const { r, g, b, a } = fill.color;
      const alpha = fill.opacity !== undefined ? fill.opacity : a;
      return `rgba(${r2(r * 255)},${r2(g * 255)},${r2(b * 255)},${r2(alpha)})`;
    }
  }
  return 'none';
}

function resolveStroke(strokes: FigmaStroke[]): string {
  for (const stroke of strokes) {
    if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
      const { r, g, b, a } = stroke.color;
      const alpha = stroke.opacity !== undefined ? stroke.opacity : a;
      return `rgba(${r2(r * 255)},${r2(g * 255)},${r2(b * 255)},${r2(alpha)})`;
    }
  }
  return 'none';
}

function buildAttrs(pairs: [string, string | number][]): string {
  return pairs.map(([k, v]) => `${k}="${v}"`).join(' ');
}

function renderNode(node: NodeSnapshot, parentX: number, parentY: number): string {
  const relX = r2(node.x - parentX);
  const relY = r2(node.y - parentY);
  const fill = resolveFill(node.fills);
  const stroke = resolveStroke(node.strokes);
  const strokeWeight = node.strokeWeight ?? 0;
  const opacity = node.opacity < 1 ? ` opacity="${r2(node.opacity)}"` : '';

  const strokeAttrs = stroke !== 'none'
    ? ` stroke="${stroke}" stroke-width="${r2(strokeWeight)}"`
    : '';

  const type = node.type;

  if (type === 'RECTANGLE') {
    const rx = node.cornerRadius ? ` rx="${r2(node.cornerRadius)}" ry="${r2(node.cornerRadius)}"` : '';
    return `<rect ${buildAttrs([
      ['x', relX],
      ['y', relY],
      ['width', r2(node.width)],
      ['height', r2(node.height)],
      ['fill', fill],
    ])}${rx}${strokeAttrs}${opacity}/>`;
  }

  if (type === 'ELLIPSE') {
    const cx = r2(relX + node.width / 2);
    const cy = r2(relY + node.height / 2);
    const rx = r2(node.width / 2);
    const ry = r2(node.height / 2);
    return `<ellipse ${buildAttrs([
      ['cx', cx],
      ['cy', cy],
      ['rx', rx],
      ['ry', ry],
      ['fill', fill],
    ])}${strokeAttrs}${opacity}/>`;
  }

  if (
    type === 'FRAME' ||
    type === 'GROUP' ||
    type === 'COMPONENT' ||
    type === 'INSTANCE' ||
    type === 'COMPONENT_SET'
  ) {
    const children = (node.children ?? [])
      .map((child) => renderNode(child, node.x, node.y))
      .join('\n');
    return `<g transform="translate(${relX},${relY})"${opacity}>\n${children}\n</g>`;
  }

  if (
    type === 'VECTOR' ||
    type === 'STAR' ||
    type === 'POLYGON' ||
    type === 'LINE' ||
    type === 'BOOLEAN_OPERATION'
  ) {
    if (node.vectorPaths && node.vectorPaths.length > 0) {
      const paths = node.vectorPaths
        .map((vp) =>
          `<path d="${vp.data}" fill-rule="${vp.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero'}" fill="${fill}"${strokeAttrs}/>`
        )
        .join('\n');
      return `<g transform="translate(${relX},${relY})"${opacity}>\n${paths}\n</g>`;
    }
    // Fallback: bounding box rect
    return `<rect ${buildAttrs([
      ['x', relX],
      ['y', relY],
      ['width', r2(node.width)],
      ['height', r2(node.height)],
      ['fill', fill],
    ])}${strokeAttrs}${opacity}/>`;
  }

  if (type === 'TEXT') {
    // Placeholder rect for text nodes
    return `<rect ${buildAttrs([
      ['x', relX],
      ['y', relY],
      ['width', r2(node.width)],
      ['height', r2(node.height)],
      ['fill', fill === 'none' ? 'rgba(128,128,128,0.2)' : fill],
    ])}${strokeAttrs}${opacity}/>`;
  }

  // Default fallback
  return `<rect ${buildAttrs([
    ['x', relX],
    ['y', relY],
    ['width', r2(node.width)],
    ['height', r2(node.height)],
    ['fill', fill],
  ])}${strokeAttrs}${opacity}/>`;
}

export function generateSvgFromSnapshot(snapshot: FigmaSnapshot): string {
  const root = snapshot.root;
  const w = r2(root.width);
  const h = r2(root.height);

  const children = (root.children ?? [])
    .map((child) => renderNode(child, root.x, root.y))
    .join('\n');

  const rootFill = resolveFill(root.fills);
  const bgRect =
    rootFill !== 'none'
      ? `<rect x="0" y="0" width="${w}" height="${h}" fill="${rootFill}"/>`
      : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    bgRect,
    children,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');
}
