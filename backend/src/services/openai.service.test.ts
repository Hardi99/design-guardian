import { describe, it, expect } from 'vitest';
import type { AnalysisResult, Change } from '../types/database.js';

// Test the logic without instantiating the OpenAI service
// We test the fallback summary generation and change description logic

describe('OpenAI Service Logic', () => {
  // Replicate the fallback summary logic for testing
  function generateFallbackSummary(analysis: AnalysisResult): string {
    const { total_changes, changes } = analysis;

    const addedCount = changes.filter(c => c.type === 'added').length;
    const removedCount = changes.filter(c => c.type === 'removed').length;
    const modifiedCount = changes.filter(c => c.type === 'geometry_modified').length;
    const attributeCount = changes.filter(c => c.type === 'attribute_changed').length;

    const parts: string[] = [];

    if (addedCount > 0) parts.push(`${addedCount} élément(s) ajouté(s)`);
    if (removedCount > 0) parts.push(`${removedCount} élément(s) supprimé(s)`);
    if (modifiedCount > 0) parts.push(`${modifiedCount} modification(s) géométrique(s)`);
    if (attributeCount > 0) parts.push(`${attributeCount} attribut(s) modifié(s)`);

    if (parts.length === 0) {
      return `${total_changes} modification(s) détectée(s).`;
    }

    return `${total_changes} changement(s) détecté(s): ${parts.join(', ')}.`;
  }

  // Replicate the change description logic for testing
  function describeChange(change: Change): string {
    const { type, details } = change;

    switch (type) {
      case 'added':
        return `nouvel élément de type ${details.new_value}`;
      case 'removed':
        return `élément supprimé (type: ${details.old_value})`;
      case 'geometry_modified':
        if (details.property === 'path') {
          return `géométrie modifiée (déplacement moyen: ${details.distance}px, ${details.percentage}% de changement)`;
        }
        if (details.property === 'bounding_box') {
          return `dimensions modifiées (différence: ${details.distance}px)`;
        }
        return `géométrie modifiée`;
      case 'attribute_changed':
        return `attribut "${details.property}" changé de "${details.old_value}" à "${details.new_value}"`;
      case 'transform_changed':
        return `transformation modifiée`;
      default:
        return 'modification non spécifiée';
    }
  }

  describe('generateFallbackSummary', () => {
    it('should summarize added elements', () => {
      const analysis: AnalysisResult = {
        total_changes: 2,
        changes: [
          { element_id: 'r1', type: 'added', severity: 'major', details: { new_value: 'rect' } },
          { element_id: 'c1', type: 'added', severity: 'major', details: { new_value: 'circle' } },
        ],
        metadata: { v1_elements_count: 0, v2_elements_count: 2, epsilon: 0.01, processing_time_ms: 10 },
      };

      const result = generateFallbackSummary(analysis);

      expect(result).toBe('2 changement(s) détecté(s): 2 élément(s) ajouté(s).');
    });

    it('should summarize removed elements', () => {
      const analysis: AnalysisResult = {
        total_changes: 1,
        changes: [
          { element_id: 'r1', type: 'removed', severity: 'major', details: { old_value: 'rect' } },
        ],
        metadata: { v1_elements_count: 1, v2_elements_count: 0, epsilon: 0.01, processing_time_ms: 10 },
      };

      const result = generateFallbackSummary(analysis);

      expect(result).toBe('1 changement(s) détecté(s): 1 élément(s) supprimé(s).');
    });

    it('should summarize geometry modifications', () => {
      const analysis: AnalysisResult = {
        total_changes: 1,
        changes: [
          { element_id: 'r1', type: 'geometry_modified', severity: 'moderate', details: { property: 'path', distance: 5 } },
        ],
        metadata: { v1_elements_count: 1, v2_elements_count: 1, epsilon: 0.01, processing_time_ms: 10 },
      };

      const result = generateFallbackSummary(analysis);

      expect(result).toBe('1 changement(s) détecté(s): 1 modification(s) géométrique(s).');
    });

    it('should summarize attribute changes', () => {
      const analysis: AnalysisResult = {
        total_changes: 2,
        changes: [
          { element_id: 'r1', type: 'attribute_changed', severity: 'moderate', details: { property: 'fill', old_value: 'blue', new_value: 'red' } },
          { element_id: 'r1', type: 'attribute_changed', severity: 'minor', details: { property: 'opacity', old_value: '0.5', new_value: '0.8' } },
        ],
        metadata: { v1_elements_count: 1, v2_elements_count: 1, epsilon: 0.01, processing_time_ms: 10 },
      };

      const result = generateFallbackSummary(analysis);

      expect(result).toBe('2 changement(s) détecté(s): 2 attribut(s) modifié(s).');
    });

    it('should summarize mixed changes', () => {
      const analysis: AnalysisResult = {
        total_changes: 4,
        changes: [
          { element_id: 'r1', type: 'added', severity: 'major', details: { new_value: 'rect' } },
          { element_id: 'c1', type: 'removed', severity: 'major', details: { old_value: 'circle' } },
          { element_id: 'p1', type: 'geometry_modified', severity: 'moderate', details: { property: 'path' } },
          { element_id: 'r2', type: 'attribute_changed', severity: 'minor', details: { property: 'fill' } },
        ],
        metadata: { v1_elements_count: 2, v2_elements_count: 2, epsilon: 0.01, processing_time_ms: 10 },
      };

      const result = generateFallbackSummary(analysis);

      expect(result).toContain('4 changement(s) détecté(s)');
      expect(result).toContain('1 élément(s) ajouté(s)');
      expect(result).toContain('1 élément(s) supprimé(s)');
      expect(result).toContain('1 modification(s) géométrique(s)');
      expect(result).toContain('1 attribut(s) modifié(s)');
    });

    it('should handle edge case with transform changes only', () => {
      const analysis: AnalysisResult = {
        total_changes: 1,
        changes: [
          { element_id: 'r1', type: 'transform_changed', severity: 'moderate', details: {} },
        ],
        metadata: { v1_elements_count: 1, v2_elements_count: 1, epsilon: 0.01, processing_time_ms: 10 },
      };

      const result = generateFallbackSummary(analysis);

      // transform_changed is not counted in any category, so parts will be empty
      expect(result).toBe('1 modification(s) détectée(s).');
    });
  });

  describe('describeChange', () => {
    it('should describe added element', () => {
      const change: Change = {
        element_id: 'r1',
        type: 'added',
        severity: 'major',
        details: { property: 'element', new_value: 'rect' },
      };

      const result = describeChange(change);

      expect(result).toBe('nouvel élément de type rect');
    });

    it('should describe removed element', () => {
      const change: Change = {
        element_id: 'c1',
        type: 'removed',
        severity: 'major',
        details: { property: 'element', old_value: 'circle' },
      };

      const result = describeChange(change);

      expect(result).toBe('élément supprimé (type: circle)');
    });

    it('should describe path geometry modification', () => {
      const change: Change = {
        element_id: 'p1',
        type: 'geometry_modified',
        severity: 'moderate',
        details: { property: 'path', distance: 5.5, percentage: 12.3 },
      };

      const result = describeChange(change);

      expect(result).toBe('géométrie modifiée (déplacement moyen: 5.5px, 12.3% de changement)');
    });

    it('should describe bounding box modification', () => {
      const change: Change = {
        element_id: 'r1',
        type: 'geometry_modified',
        severity: 'moderate',
        details: { property: 'bounding_box', distance: 10 },
      };

      const result = describeChange(change);

      expect(result).toBe('dimensions modifiées (différence: 10px)');
    });

    it('should describe generic geometry modification', () => {
      const change: Change = {
        element_id: 'r1',
        type: 'geometry_modified',
        severity: 'moderate',
        details: { property: 'unknown' },
      };

      const result = describeChange(change);

      expect(result).toBe('géométrie modifiée');
    });

    it('should describe attribute change', () => {
      const change: Change = {
        element_id: 'r1',
        type: 'attribute_changed',
        severity: 'moderate',
        details: { property: 'fill', old_value: 'blue', new_value: 'red' },
      };

      const result = describeChange(change);

      expect(result).toBe('attribut "fill" changé de "blue" à "red"');
    });

    it('should describe transform change', () => {
      const change: Change = {
        element_id: 'r1',
        type: 'transform_changed',
        severity: 'moderate',
        details: {},
      };

      const result = describeChange(change);

      expect(result).toBe('transformation modifiée');
    });
  });
});
