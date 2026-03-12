import OpenAI from 'openai';
import type { DeltaJSON } from '../types/figma.js';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generatePatchNote(delta: DeltaJSON, authorName: string): Promise<string> {
    if (delta.totalChanges === 0) {
      return 'Aucune modification détectée. Les éléments sont identiques.';
    }

    const prompt = this.buildPrompt(delta, authorName);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Tu es un assistant spécialisé dans l\'analyse de fichiers de design Figma. ' +
              'Ton rôle est de générer des patch notes concises et factuelles, style changelog Git, ' +
              'à partir de données techniques de diff vectoriel. ' +
              'Format : liste d\'actions courtes, design-oriented, en français. ' +
              'Ne jamais inventer de données. Utiliser uniquement ce qui est fourni.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 250,
      });

      return response.choices[0]?.message?.content?.trim() ?? this.generateFallback(delta, authorName);
    } catch {
      return this.generateFallback(delta, authorName);
    }
  }

  private buildPrompt(delta: DeltaJSON, authorName: string): string {
    const lines: string[] = [
      `Auteur du checkpoint : ${authorName}`,
      `Total changements : ${delta.totalChanges}`,
      '',
    ];

    if (delta.modified.length > 0) {
      lines.push('Éléments modifiés :');
      for (const node of delta.modified.slice(0, 8)) {
        const changeList = node.changes.map(c => `  - ${c.property} : ${c.delta ?? `${String(c.oldValue)} -> ${String(c.newValue)}`}`).join('\n');
        lines.push(`• "${node.nodeName}" (${node.nodeType}) :\n${changeList}`);
      }
    }

    if (delta.added.length > 0) {
      lines.push(`\nÉléments ajoutés : ${delta.added.map(n => `"${n.nodeName}"`).join(', ')}`);
    }

    if (delta.removed.length > 0) {
      lines.push(`\nÉléments supprimés : ${delta.removed.map(n => `"${n.nodeName}"`).join(', ')}`);
    }

    lines.push(
      '\nGénère un patch note en français, style changelog, format :',
      '@[Auteur] a modifié X propriété(s) :',
      '- [propriété] : [ancienne valeur] -> [nouvelle valeur]',
      'Maximum 5 lignes. Factuel et précis.',
    );

    return lines.join('\n');
  }

  private generateFallback(delta: DeltaJSON, authorName: string): string {
    const parts: string[] = [];
    if (delta.modified.length > 0) parts.push(`${delta.modified.length} élément(s) modifié(s)`);
    if (delta.added.length > 0) parts.push(`${delta.added.length} élément(s) ajouté(s)`);
    if (delta.removed.length > 0) parts.push(`${delta.removed.length} élément(s) supprimé(s)`);
    return `@${authorName} — ${parts.join(', ')}.`;
  }
}
