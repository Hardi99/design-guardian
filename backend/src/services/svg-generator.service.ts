import type { FigmaSnapshot, NodeSnapshot, FigmaFill, FigmaStroke, FigmaEffect, FigmaGradientStop } from '../types/figma.js';

const r2 = (n: number): number => Math.round(n * 100) / 100;

function toHex(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
}

function colorToHex(r: number, g: number, b: number): string {
  return `#${toHex(r * 255)}${toHex(g * 255)}${toHex(b * 255)}`;
}

interface ColorResult { hex: string; opacity: number }

function resolveFill(fills: FigmaFill[]): ColorResult | null {
  for (const fill of fills) {
    if (fill.visible === false) continue;
    if (fill.type === 'SOLID' && fill.color) {
      const { r, g, b, a } = fill.color;
      return { hex: colorToHex(r, g, b), opacity: fill.opacity !== undefined ? fill.opacity : a };
    }
  }
  return null;
}

function resolveStroke(strokes: FigmaStroke[]): ColorResult | null {
  for (const stroke of strokes) {
    if (stroke.type === 'SOLID' && stroke.color) {
      const { r, g, b, a } = stroke.color;
      return { hex: colorToHex(r, g, b), opacity: stroke.opacity !== undefined ? stroke.opacity : a };
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

// Build <linearGradient> or <radialGradient> defs for a node
function buildGradientDef(nodeId: string, fill: FigmaFill, index: number): string | null {
  if (!fill.gradientStops || fill.gradientStops.length === 0) return null;
  const id = `grad-${nodeId.replace(/[^a-z0-9]/gi, '')}-${index}`;
  const stops = fill.gradientStops.map((s: FigmaGradientStop) => {
    const hex = colorToHex(s.color.r, s.color.g, s.color.b);
    const opacity = s.color.a < 1 ? ` stop-opacity="${r2(s.color.a)}"` : '';
    return `<stop offset="${r2(s.position * 100)}%" stop-color="${hex}"${opacity}/>`;
  }).join('');

  if (fill.type === 'GRADIENT_RADIAL') {
    return `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`;
  }
  // LINEAR — use gradientAngle if available
  const angle = fill.gradientAngle ?? 0;
  const rad = angle * (Math.PI / 180);
  const x2 = r2(0.5 + 0.5 * Math.cos(rad));
  const y2 = r2(0.5 + 0.5 * Math.sin(rad));
  return `<linearGradient id="${id}" x1="${r2(1 - x2)}" y1="${r2(1 - y2)}" x2="${x2}" y2="${y2}" gradientUnits="objectBoundingBox">${stops}</linearGradient>`;
}

// Build SVG <filter> for drop shadows
function buildFilterDef(nodeId: string, effects: FigmaEffect[]): string | null {
  const shadows = effects.filter(e => e.visible && (e.type === 'DROP_SHADOW') && e.color);
  if (shadows.length === 0) return null;
  const id = `fx-${nodeId.replace(/[^a-z0-9]/gi, '')}`;
  const feList = shadows.map(s => {
    const c = s.color!;
    const hex = colorToHex(c.r, c.g, c.b);
    return `<feDropShadow dx="${s.offset?.x ?? 0}" dy="${s.offset?.y ?? 4}" stdDeviation="${r2(s.radius / 2)}" flood-color="${hex}" flood-opacity="${r2(c.a)}"/>`;
  }).join('');
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${feList}</filter>`;
}

// Collect all defs needed by a node subtree
function collectDefs(node: NodeSnapshot): string[] {
  const defs: string[] = [];
  node.fills.forEach((f, i) => {
    if (f.visible === false) return;
    const def = buildGradientDef(node.id, f, i);
    if (def) defs.push(def);
  });
  if (node.effects) {
    const filterDef = buildFilterDef(node.id, node.effects);
    if (filterDef) defs.push(filterDef);
  }
  for (const child of node.children ?? []) {
    defs.push(...collectDefs(child));
  }
  return defs;
}

function getGradientFill(node: NodeSnapshot): string | null {
  for (let i = 0; i < node.fills.length; i++) {
    const f = node.fills[i]!;
    if (f.visible === false) continue;
    if ((f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') && f.gradientStops?.length) {
      const id = `grad-${node.id.replace(/[^a-z0-9]/gi, '')}-${i}`;
      return `fill="url(#${id})"`;
    }
  }
  return null;
}

function getFilterAttr(node: NodeSnapshot): string {
  if (!node.effects) return '';
  const hasShadow = node.effects.some(e => e.visible && e.type === 'DROP_SHADOW');
  if (!hasShadow) return '';
  const id = `fx-${node.id.replace(/[^a-z0-9]/gi, '')}`;
  return ` filter="url(#${id})"`;
}

function renderNode(node: NodeSnapshot, parentX: number, parentY: number): string {
  if (node.visible === false) return '';

  const relX = r2(node.x - parentX);
  const relY = r2(node.y - parentY);
  const fill = resolveFill(node.fills);
  const gradFill = getGradientFill(node);
  const fillStr = gradFill ?? fillAttrs(fill);
  const stroke = resolveStroke(node.strokes);
  const strokeWeight = node.strokeWeight ?? 0;
  const opacity = node.opacity < 1 ? ` opacity="${r2(node.opacity)}"` : '';
  const strokeAttrs = strokeAttrStr(stroke, strokeWeight);
  const filterAttr = getFilterAttr(node);
  const type = node.type;

  // Rotation transform
  const rot = node.rotation ?? 0;
  const rotAttr = rot !== 0
    ? ` transform="rotate(${rot} ${r2(relX + node.width / 2)} ${r2(relY + node.height / 2)})"`
    : '';

  if (type === 'RECTANGLE') {
    const rx = node.cornerRadius ? ` rx="${r2(node.cornerRadius)}" ry="${r2(node.cornerRadius)}"` : '';
    return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillStr}${rx}${strokeAttrs}${opacity}${rotAttr}${filterAttr}/>`;
  }

  if (type === 'ELLIPSE') {
    const cx = r2(relX + node.width / 2);
    const cy = r2(relY + node.height / 2);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${r2(node.width / 2)}" ry="${r2(node.height / 2)}" ${fillStr}${strokeAttrs}${opacity}${filterAttr}/>`;
  }

  if (type === 'TEXT') {
    const chars = node.characters ?? '';
    // No content (old snapshot or empty node) → placeholder rect
    if (!chars.trim()) {
      return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(Math.max(node.height, node.fontSize ?? 14))}" fill="#888888" fill-opacity="0.25" rx="2"/>`;
    }
    const fs = node.fontSize ?? 14;
    const ff = node.fontFamily ? ` font-family="${escapeXml(node.fontFamily)}"` : '';
    // Avoid invisible white text: force dark fill when fill is very light or absent
    const isLightFill = fill && parseInt(fill.hex.slice(1), 16) > 0xCCCCCC;
    const textFill = (!fill || isLightFill) ? { hex: '#222222', opacity: 1 } : fill;
    const textFillStr = gradFill ?? fillAttrs(textFill);
    // Clip long text to width
    const maxChars = Math.max(5, Math.floor(node.width / (fs * 0.55)));
    const displayText = chars.length > maxChars ? chars.slice(0, maxChars) + '…' : chars;
    const textRotAttr = rot !== 0 ? ` transform="rotate(${rot} ${r2(relX + node.width / 2)} ${r2(relY + node.height / 2)})"` : '';
    return `<text x="${relX}" y="${r2(relY + fs * 0.85)}" font-size="${fs}"${ff} ${textFillStr}${opacity}${textRotAttr}>${escapeXml(displayText)}</text>`;
  }

  if (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(type)) {
    const children = (node.children ?? [])
      .map((child) => renderNode(child, node.x, node.y))
      .filter(s => s !== '')
      .join('\n');
    const rx = node.cornerRadius ? ` rx="${r2(node.cornerRadius)}" ry="${r2(node.cornerRadius)}"` : '';
    const renderBg = (fill || gradFill) && !['INSTANCE', 'COMPONENT'].includes(type);
    const bg = renderBg
      ? `<rect x="0" y="0" width="${r2(node.width)}" height="${r2(node.height)}" ${fillStr}${rx}${strokeAttrs}${filterAttr}/>`
      : '';
    const translate = relX !== 0 || relY !== 0 ? ` transform="translate(${relX},${relY})"` : '';
    return `<g${translate}${opacity}>\n${bg}\n${children}\n</g>`;
  }

  if (['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION'].includes(type)) {
    if (node.vectorPaths && node.vectorPaths.length > 0) {
      const paths = node.vectorPaths
        .map((vp) => `<path d="${vp.data}" fill-rule="${vp.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero'}" ${fillStr}${strokeAttrs}/>`)
        .join('\n');
      return `<g transform="translate(${relX},${relY})"${opacity}${rotAttr}>\n${paths}\n</g>`;
    }
    return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillStr}${strokeAttrs}${opacity}/>`;
  }

  return `<rect x="${relX}" y="${relY}" width="${r2(node.width)}" height="${r2(node.height)}" ${fillStr}${strokeAttrs}${opacity}/>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[^\x00-\x7E]/g, c => `&#x${c.codePointAt(0)!.toString(16).toUpperCase()};`);
}

export function generateSvgFromSnapshot(snapshot: FigmaSnapshot): string {
  const root = snapshot.root;
  const pad  = r2((root.strokeWeight ?? 0) / 2);
  const w    = r2(root.width  + pad * 2);
  const h    = r2(root.height + pad * 2);
  const allDefs = collectDefs(root);
  const defs = allDefs.length > 0 ? `<defs>\n${allDefs.join('\n')}\n</defs>\n` : '';
  const content = renderNode(root, r2(root.x - pad), r2(root.y - pad));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${defs}${content}\n</svg>`;
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
  const allDefs = collectDefs(node);
  const defs = allDefs.length > 0 ? `<defs>\n${allDefs.join('\n')}\n</defs>\n` : '';
  const content = renderNode(node, r2(node.x - pad), r2(node.y - pad));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${defs}${content}\n</svg>`;
}
