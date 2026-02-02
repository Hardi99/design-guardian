import { describe, it, expect } from 'vitest';
import { SVGParserService } from './svg-parser.service.js';

describe('SVGParserService', () => {
  const parser = new SVGParserService();

  describe('parseSVG', () => {
    it('should parse a simple SVG with a rect', async () => {
      const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="blue" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.metadata.width).toBe('100');
      expect(result.metadata.height).toBe('100');
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]?.type).toBe('rect');
    });

    it('should parse SVG with circle', async () => {
      const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="50" fill="red" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]?.type).toBe('circle');
      expect(result.elements[0]?.attributes.cx).toBe('100');
      expect(result.elements[0]?.attributes.cy).toBe('100');
      expect(result.elements[0]?.attributes.r).toBe('50');
    });

    it('should parse SVG with path', async () => {
      const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 10 L90 10 L90 90 L10 90 Z" fill="green" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]?.type).toBe('path');
      expect(result.elements[0]?.geometry.path).toContain('M10 10');
    });

    it('should parse SVG with multiple elements', async () => {
      const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="50" height="50" />
        <circle cx="150" cy="50" r="30" />
        <ellipse cx="100" cy="150" rx="40" ry="20" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.elements).toHaveLength(3);
      expect(result.elements.map(e => e.type)).toEqual(['rect', 'circle', 'ellipse']);
    });

    it('should extract viewBox', async () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.viewBox).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    });

    it('should preserve element IDs', async () => {
      const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect id="my-rect" x="10" y="10" width="80" height="80" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.elements[0]?.id).toBe('my-rect');
    });

    it('should generate IDs for elements without explicit IDs', async () => {
      const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" />
      </svg>`;

      const result = await parser.parseSVG(svg);

      expect(result.elements[0]?.id).toMatch(/^element_\d+$/);
    });

    it('should throw error for invalid SVG', async () => {
      const invalidSvg = '<div>not an svg</div>';

      await expect(parser.parseSVG(invalidSvg)).rejects.toThrow('Invalid SVG');
    });

    it('should throw error for malformed XML', async () => {
      const malformed = '<svg><rect></svg>';

      await expect(parser.parseSVG(malformed)).rejects.toThrow();
    });
  });

  describe('geometry analysis', () => {
    it('should calculate bounding box for rect', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="30" width="100" height="50" />
      </svg>`;

      const result = await parser.parseSVG(svg);
      const bbox = result.elements[0]?.geometry.bbox;

      expect(bbox?.x).toBeCloseTo(20, 0);
      expect(bbox?.y).toBeCloseTo(30, 0);
      expect(bbox?.width).toBeCloseTo(100, 0);
      expect(bbox?.height).toBeCloseTo(50, 0);
    });

    it('should calculate geometry properties', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" />
      </svg>`;

      const result = await parser.parseSVG(svg);
      const props = result.elements[0]?.geometry.properties;

      expect(props?.perimeter).toBeGreaterThan(0);
      expect(props?.area).toBeGreaterThan(0);
      expect(props?.centroid).toBeDefined();
    });

    it('should sample points along path', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0 L100 0 L100 100 L0 100 Z" />
      </svg>`;

      const result = await parser.parseSVG(svg);
      const points = result.elements[0]?.geometry.points;

      expect(points?.length).toBeGreaterThan(0);
      expect(points?.[0]).toHaveProperty('x');
      expect(points?.[0]).toHaveProperty('y');
    });
  });
});
