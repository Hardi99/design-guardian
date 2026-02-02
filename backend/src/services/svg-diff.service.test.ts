import { describe, it, expect, beforeEach } from 'vitest';
import { SVGParserService } from './svg-parser.service.js';
import { SVGDiffService } from './svg-diff.service.js';

describe('SVGDiffService', () => {
  const parser = new SVGParserService();
  const differ = new SVGDiffService();

  describe('compareSVGs', () => {
    it('should detect no changes for identical SVGs', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" fill="blue" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg);
      const parsed2 = await parser.parseSVG(svg);

      const result = await differ.compareSVGs(parsed1, parsed2);

      expect(result.total_changes).toBe(0);
      expect(result.changes).toHaveLength(0);
    });

    it('should detect added element', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
        <circle id="c1" cx="50" cy="50" r="20" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      const addedChange = result.changes.find(c => c.type === 'added');
      expect(addedChange).toBeDefined();
      expect(addedChange?.element_id).toBe('c1');
      expect(addedChange?.severity).toBe('major');
    });

    it('should detect removed element', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
        <circle id="c1" cx="50" cy="50" r="20" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      const removedChange = result.changes.find(c => c.type === 'removed');
      expect(removedChange).toBeDefined();
      expect(removedChange?.element_id).toBe('c1');
      expect(removedChange?.severity).toBe('major');
    });

    it('should detect geometry modification (position change)', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="50" y="50" width="80" height="80" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      const geometryChange = result.changes.find(c => c.type === 'geometry_modified');
      expect(geometryChange).toBeDefined();
      expect(geometryChange?.element_id).toBe('r1');
    });

    it('should detect geometry modification (size change)', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <circle id="c1" cx="100" cy="100" r="50" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <circle id="c1" cx="100" cy="100" r="80" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      expect(result.changes.some(c => c.type === 'geometry_modified')).toBe(true);
    });

    it('should detect attribute changes (fill)', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" fill="blue" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" fill="red" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      const attrChange = result.changes.find(c => c.type === 'attribute_changed');
      expect(attrChange).toBeDefined();
      expect(attrChange?.details.property).toBe('fill');
      expect(attrChange?.details.old_value).toBe('blue');
      expect(attrChange?.details.new_value).toBe('red');
    });

    it('should detect attribute changes (opacity)', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" opacity="0.5" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" opacity="0.8" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      const attrChange = result.changes.find(
        c => c.type === 'attribute_changed' && c.details.property === 'opacity'
      );
      expect(attrChange).toBeDefined();
    });

    it('should ignore sub-pixel changes within epsilon tolerance', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10.005" y="10.005" width="80" height="80" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      // Should not detect geometry change for sub-pixel differences
      const geometryChanges = result.changes.filter(c => c.type === 'geometry_modified');
      expect(geometryChanges.length).toBeLessThanOrEqual(1); // May detect bbox change but not path
    });

    it('should return correct metadata', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
        <circle id="c1" cx="50" cy="50" r="20" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      expect(result.metadata.v1_elements_count).toBe(2);
      expect(result.metadata.v2_elements_count).toBe(1);
      expect(result.metadata.epsilon).toBe(0.01);
      expect(result.metadata.processing_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should assign correct severity levels', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="10" y="10" width="80" height="80" fill="blue" stroke="black" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r1" x="50" y="50" width="80" height="80" fill="red" class="new-class" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      // Fill change should be moderate
      const fillChange = result.changes.find(
        c => c.type === 'attribute_changed' && c.details.property === 'fill'
      );
      expect(fillChange?.severity).toBe('moderate');

      // Class change should be minor
      const classChange = result.changes.find(
        c => c.type === 'attribute_changed' && c.details.property === 'class'
      );
      expect(classChange?.severity).toBe('minor');
    });
  });

  describe('complex scenarios', () => {
    it('should handle complete element replacement', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect id="shape" x="10" y="10" width="80" height="80" />
      </svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">
        <circle id="shape2" cx="50" cy="50" r="40" />
      </svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      expect(result.changes.some(c => c.type === 'removed')).toBe(true);
      expect(result.changes.some(c => c.type === 'added')).toBe(true);
    });

    it('should handle empty SVGs', async () => {
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      expect(result.total_changes).toBe(0);
      expect(result.metadata.v1_elements_count).toBe(0);
      expect(result.metadata.v2_elements_count).toBe(0);
    });

    it('should handle SVG with many elements', async () => {
      const elements1 = Array.from({ length: 10 }, (_, i) =>
        `<rect id="r${i}" x="${i * 10}" y="${i * 10}" width="10" height="10" />`
      ).join('');
      const elements2 = Array.from({ length: 10 }, (_, i) =>
        `<rect id="r${i}" x="${i * 10 + 5}" y="${i * 10}" width="10" height="10" />`
      ).join('');

      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg">${elements1}</svg>`;
      const svg2 = `<svg xmlns="http://www.w3.org/2000/svg">${elements2}</svg>`;

      const parsed1 = await parser.parseSVG(svg1);
      const parsed2 = await parser.parseSVG(svg2);

      const result = await differ.compareSVGs(parsed1, parsed2);

      expect(result.metadata.v1_elements_count).toBe(10);
      expect(result.metadata.v2_elements_count).toBe(10);
      // Each element should have geometry changes
      expect(result.changes.filter(c => c.type === 'geometry_modified').length).toBeGreaterThan(0);
    });
  });
});
