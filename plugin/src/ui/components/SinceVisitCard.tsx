import { useState, useEffect } from 'preact/hooks';
import type { SinceVisit } from '../../frameNav.js';
import { api } from '../api.js';
import { IconSparkle, IconChevron } from './icons.js';

// Un résumé par paire de versions et par session : revenir sur l'accueil ne rappelle pas l'IA.
const summaries = new Map<string, string | null>();
const SHOWN = 4;

// Le changement NET depuis la dernière version vue (diff direct vN → vM, un seul résumé IA),
// et qui a touché quoi : on rattrape plusieurs captures d'un coup d'œil.
export function SinceVisitCard({ since, apiKey, onOpen }: { since: SinceVisit; apiKey: string; onOpen: () => void }) {
  const pair = `${since.from.id}:${since.to.id}`;
  const [summary, setSummary] = useState<string | null | undefined>(summaries.get(pair));

  useEffect(() => {
    if (summaries.has(pair)) { setSummary(summaries.get(pair)); return; }
    setSummary(undefined);
    api<{ summary: string | null }>(apiKey, `/api/versions/compare?from=${since.from.id}&to=${since.to.id}`)
      .then(d => d.summary, () => null)
      .then(s => { summaries.set(pair, s); setSummary(s); });
  }, [pair, apiKey]);

  const rest = since.frames.length - SHOWN;
  return (
    <button onClick={onOpen}
      class="group mx-3 mt-3 p-3.5 text-left rounded-dg bg-dg-accent-soft border border-dg-accent-line hover:border-dg-accent transition-colors flex-shrink-0"
      aria-label={`Depuis ta dernière visite : ${since.count} nouvelles versions${summary ? ` — ${summary}` : ''}`}>
      <p class="flex items-center gap-1.5 text-[11px] font-semibold text-dg-accent-text">
        <IconSparkle /> Depuis ta dernière visite
        <span class="ml-auto text-dg-text-2 font-normal">v{since.from.version_number} → v{since.to.version_number} · {since.count} versions</span>
      </p>
      <p class="text-[13px] leading-snug mt-1.5 line-clamp-3">
        {summary === undefined ? 'L’IA résume les changements…' : summary ?? 'Résumé indisponible.'}
      </p>
      {since.frames.length > 0 && (
        <ul class="mt-2 text-[11px] text-dg-text-2 space-y-0.5">
          {since.frames.slice(0, SHOWN).map(f => (
            <li key={f.key} class="truncate">{f.name}{f.author ? ` · ${f.author}` : ''}</li>
          ))}
          {rest > 0 && <li>+ {rest} autre{rest > 1 ? 's' : ''}</li>}
        </ul>
      )}
      <p class="flex items-center gap-1 text-[11px] text-dg-text-2 mt-2">
        Voir la dernière version
        <span class="transition-transform group-hover:translate-x-0.5"><IconChevron /></span>
      </p>
    </button>
  );
}
