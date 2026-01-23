import { parseStringPromise } from 'xml2js';
import { svgPathProperties } from 'svg-path-properties';
import type {
  ParsedSVG,
  SVGElement,
  SVGElementType,
  Geometry,
  Point,
  BoundingBox,
  GeometryProperties,
  ViewBox,
  SVGMetadata
} from '../types/svg.js';

export class SVGParserService {
  /**
   * Parse SVG string into structured data
   */
  async parseSVG(svgString: string): Promise<ParsedSVG> {
    try {
      const parsed = await parseStringPromise(svgString);
      const svgRoot = parsed.svg;

      if (!svgRoot) {
        throw new Error('Invalid SVG: no root <svg> element');
      }

      const metadata = this.extractMetadata(svgRoot);
      const viewBox = this.extractViewBox(svgRoot);
      const elements = await this.extractElements(svgRoot);

      return {
        metadata,
        viewBox,
        elements
      };
    } catch (error) {
      throw new Error(`SVG parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract SVG metadata
   */
  private extractMetadata(svgRoot: any): SVGMetadata {
    const attrs = svgRoot.$ || {};
    return {
      width: attrs.width,
      height: attrs.height,
      xmlns: attrs.xmlns
    };
  }

  /**
   * Extract viewBox attribute
   */
  private extractViewBox(svgRoot: any): ViewBox | null {
    const viewBoxAttr = svgRoot.$?.viewBox;
    if (!viewBoxAttr) return null;

    const parts = viewBoxAttr.split(/\s+/).map(Number);
    if (parts.length !== 4) return null;

    return {
      x: parts[0]!,
      y: parts[1]!,
      width: parts[2]!,
      height: parts[3]!
    };
  }

  /**
   * Extract and normalize all SVG elements
   */
  private async extractElements(svgRoot: any): Promise<SVGElement[]> {
    const elements: SVGElement[] = [];
    let idCounter = 0;

    const processElement = async (element: any, type: SVGElementType): Promise<void> => {
      const attrs = element.$ || {};
      const id = attrs.id || `element_${idCounter++}`;

      // Normalize element to path
      const path = this.normalizeToPath(type, attrs);
      if (!path) return;

      const geometry = await this.analyzeGeometry(path);

      elements.push({
        id,
        type,
        attributes: attrs,
        geometry
      });
    };

    // Process all supported element types
    if (svgRoot.path) {
      for (const path of svgRoot.path) {
        await processElement(path, 'path');
      }
    }
    if (svgRoot.rect) {
      for (const rect of svgRoot.rect) {
        await processElement(rect, 'rect');
      }
    }
    if (svgRoot.circle) {
      for (const circle of svgRoot.circle) {
        await processElement(circle, 'circle');
      }
    }
    if (svgRoot.ellipse) {
      for (const ellipse of svgRoot.ellipse) {
        await processElement(ellipse, 'ellipse');
      }
    }

    return elements;
  }

  /**
   * Normalize any SVG shape to an absolute path
   */
  private normalizeToPath(type: SVGElementType, attrs: Record<string, string>): string | null {
    switch (type) {
      case 'path':
        return this.normalizePathCommands(attrs.d || '');

      case 'rect': {
        const x = Number(attrs.x) || 0;
        const y = Number(attrs.y) || 0;
        const w = Number(attrs.width) || 0;
        const h = Number(attrs.height) || 0;
        const rx = Number(attrs.rx) || 0;
        const ry = Number(attrs.ry) || rx;

        if (rx > 0 || ry > 0) {
          // Rounded rectangle (simplified - full implementation would include arcs)
          return `M ${x + rx} ${y} L ${x + w - rx} ${y} L ${x + w} ${y + ry} L ${x + w} ${y + h - ry} L ${x + w - rx} ${y + h} L ${x + rx} ${y + h} L ${x} ${y + h - ry} L ${x} ${y + ry} Z`;
        }
        return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      }

      case 'circle': {
        const cx = Number(attrs.cx) || 0;
        const cy = Number(attrs.cy) || 0;
        const r = Number(attrs.r) || 0;
        // Simplified circle as path (in production, use proper arc commands)
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

  /**
   * Normalize path commands to absolute coordinates
   * (Simplified version - full implementation would handle all SVG path commands)
   */
  private normalizePathCommands(d: string): string {
    // This is a simplified version. In production, use a proper path parser
    // For now, we assume paths are already absolute or use a library like 'svg-path-parser'
    return d.trim();
  }

  /**
   * Analyze geometry properties of a path
   */
  private async analyzeGeometry(path: string): Promise<Geometry> {
    try {
      const properties = new svgPathProperties(path);
      const length = properties.getTotalLength();

      // Sample points along the path
      const points: Point[] = [];
      const sampleCount = Math.min(100, Math.max(10, Math.floor(length / 5)));

      for (let i = 0; i <= sampleCount; i++) {
        const t = (i / sampleCount) * length;
        const point = properties.getPointAtLength(t);
        points.push({ x: point.x, y: point.y });
      }

      const bbox = this.calculateBoundingBox(points);
      const geometryProps = this.calculateGeometryProperties(points, length);

      return {
        type: 'path',
        path,
        points,
        bbox,
        properties: geometryProps
      };
    } catch (error) {
      // Fallback for invalid paths
      return {
        type: 'path',
        path,
        points: [],
        bbox: { x: 0, y: 0, width: 0, height: 0 },
        properties: {}
      };
    }
  }

  /**
   * Calculate bounding box from points
   */
  private calculateBoundingBox(points: Point[]): BoundingBox {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Calculate geometric properties
   */
  private calculateGeometryProperties(points: Point[], perimeter: number): GeometryProperties {
    if (points.length < 3) {
      return { perimeter };
    }

    // Calculate area using shoelace formula
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      area += p1.x * p2.y - p2.x * p1.y;
    }
    area = Math.abs(area) / 2;

    // Calculate centroid
    let cx = 0;
    let cy = 0;
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    const centroid = {
      x: cx / points.length,
      y: cy / points.length
    };

    return { area, perimeter, centroid };
  }
}
