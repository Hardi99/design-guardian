// La direction visuelle tient dans theme.css : aucune couleur Tailwind en dur dans l'UI,
// sinon un thème (clair/sombre Figma, ou autre direction) casse la lisibilité.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = /\b(?:bg|text|border|ring|placeholder|from|to|accent)-(?:gray|purple|green|amber|red|blue|white|black)\b/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('UI : couleurs via les jetons dg-*', () => {
  it('aucune couleur Tailwind en dur dans ui.tsx et ui/**', () => {
    const files = [join(here, '..', 'ui.tsx'), ...tsxFiles(here)];
    const offenders = files.flatMap(f => readFileSync(f, 'utf8').split('\n')
      .map((line, i) => (FORBIDDEN.test(line) ? `${f.slice(here.length - 2)}:${i + 1}: ${line.trim()}` : null))
      .filter((x): x is string => x !== null));
    expect(offenders).toEqual([]);
  });
});
