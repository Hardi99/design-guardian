import OpenAI from 'openai';
import type { AnalysisResult } from '../types/database.js';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate natural language summary from technical analysis
   */
  async generateSummary(analysis: AnalysisResult): Promise<string> {
    if (analysis.total_changes === 0) {
      return 'Aucune modification détectée. Les fichiers sont identiques.';
    }

    const prompt = this.buildPrompt(analysis);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Tu es un assistant spécialisé dans l\'analyse de fichiers SVG pour designers. ' +
              'Ton rôle est de traduire des données techniques de comparaison géométrique en langage naturel clair et concis. ' +
              'Reste factuel et précis. Utilise le français.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const summary = response.choices[0]?.message?.content?.trim();
      return summary || 'Impossible de générer un résumé.';
    } catch (error) {
      console.error('OpenAI API error:', error);
      return this.generateFallbackSummary(analysis);
    }
  }

  /**
   * Build prompt for OpenAI from analysis data
   */
  private buildPrompt(analysis: AnalysisResult): string {
    const { total_changes, changes, metadata } = analysis;

    let prompt = `Analyse de différences entre deux versions d'un fichier SVG:\n\n`;
    prompt += `Nombre total de changements: ${total_changes}\n`;
    prompt += `Éléments version 1: ${metadata.v1_elements_count}\n`;
    prompt += `Éléments version 2: ${metadata.v2_elements_count}\n\n`;
    prompt += `Détails des changements:\n`;

    // Limit to top 10 most significant changes
    const sortedChanges = [...changes].sort((a, b) => {
      const severityOrder = { major: 3, moderate: 2, minor: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    const topChanges = sortedChanges.slice(0, 10);

    for (const change of topChanges) {
      prompt += `- Élément "${change.element_id}": ${this.describeChange(change)}\n`;
    }

    prompt += `\nGénère un résumé en français, en 2-3 phrases maximum, compréhensible par un designer.`;

    return prompt;
  }

  /**
   * Describe a single change in French
   */
  private describeChange(change: Change): string {
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

  /**
   * Generate fallback summary when OpenAI fails
   */
  private generateFallbackSummary(analysis: AnalysisResult): string {
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
}

// Import type for change
import type { Change } from '../types/database.js';
