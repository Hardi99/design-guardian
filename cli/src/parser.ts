import { parseStringPromise } from 'xml2js';
import { svgPathProperties } from 'svg-path-properties';
import type { ParsedSVG, SVGElement, Point, BoundingBox } from './types.js';

type ElementType = 'path' | 'rect' | 'circle' | 'ellipse';

export async function parseSVG(svgString: string): Promise<ParsedSVG> {
  const parsed = await parseStringPromise(svgString);
  const svgRoot = parsed.svg;

  if (!svgRoot) {
    throw new Error('Invalid SVG: no root <svg> element');
  }

  const metadata = {
    width: svgRoot.$?.width,
    height: svgRoot.$?.height,
  };

  const elements = await extractElements(svgRoot);

  return { metadata, elements };
}

async function extractElements(svgRoot: Record<string, unknown>): Promise<SVGElement[]> {
  const elements: SVGElement[] = [];
  let idCounter = 0;

  const types: ElementType[] = ['path', 'rect', 'circle', 'ellipse'];

  for (const type of types) {
    const nodes = svgRoot[type] as Array<{ $?: Record<string, string> }> | undefined;
    if (!nodes) continue;

    for (const node of nodes) {
      const attrs = node.$ || {};
      const id = attrs.id || `element_${idCounter++}`;
      const path = normalizeToPath(type, attrs);
      if (!path) continue;

      const geometry = analyzeGeometry(path);
      elements.push({ id, type, attributes: attrs, geometry });
    }
  }

  return elements;
}

function normalizeToPath(type: ElementType, attrs: Record<string, string>): string | null {
  switch (type) {
    case 'path':
      return attrs.d || null;
    case 'rect': {
      const x = Number(attrs.x) || 0;
      const y = Number(attrs.y) || 0;
      const w = Number(attrs.width) || 0;
      const h = Number(attrs.height) || 0;
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    }
    case 'circle': {
      const cx = Number(attrs.cx) || 0;
      const cy = Number(attrs.cy) || 0;
      const r = Number(attrs.r) || 0;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx - r} ${cy} Z`;
    }
    case 'ellipse': {
      const cx = Number(attrs.cx) || 0;
      const cy = Number(attrs.cy) || 0;
      const rx = Number(attrs.rx) || 0;
      const ry = Number(attrs.ry) || 0;
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z`;
    }
    default:
      return null;
  }
}

function analyzeGeometry(path: string): { path: string; points: Point[]; bbox: BoundingBox } {
  try {
    const props = new svgPathProperties(path);
    const length = props.getTotalLength();
    const points: Point[] = [];
    const samples = Math.min(50, Math.max(10, Math.floor(length / 10)));

    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * length;
      const pt = props.getPointAtLength(t);
      points.push({ x: pt.x, y: pt.y });
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const bbox: BoundingBox = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };

    return { path, points, bbox };
  } catch {
    return { path, points: [], bbox: { x: 0, y: 0, width: 0, height: 0 } };
  }
}
