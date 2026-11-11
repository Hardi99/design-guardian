import { useState, useEffect, useRef } from 'preact/hooks';
import type { Highlight } from '../../diffHighlights.js';
import { clampView, type View } from '../../canvasView.js';
import { svgCache } from './DiffScreen.js';

export function NodeCrop({ url, frameW, frameH, bbox, alt }: { url: string; frameW: number; frameH: number; bbox: { x: number; y: number; w: number; h: number }; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const pad = 4;
  const scale = box.w > 0 && bbox.w > 0 && bbox.h > 0 ? Math.min((box.w - pad * 2) / bbox.w, (box.h - pad * 2) / bbox.h) : 0;
  const left = (box.w - bbox.w * scale) / 2 - bbox.x * scale;
  const top  = (box.h - bbox.h * scale) / 2 - bbox.y * scale;
  return (
    <div ref={ref} class="relative w-full h-full overflow-hidden">
      {scale > 0 && <img src={url} alt={alt} style={{ position: 'absolute', width: `${frameW * scale}px`, height: `${frameH * scale}px`, left: `${left}px`, top: `${top}px`, maxWidth: 'none', pointerEvents: 'none' }} />}
    </div>
  );
}

// ─── Frame-hero components (T2–T5) ───────────────────────────────────────────

export function FrameImage({ url, kind, onReady }: { url: string; kind: 'svg' | 'png'; onReady?: () => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== 'svg') { setSvg(null); return; }
    const hit = svgCache.get(url);
    if (hit !== undefined) { setSvg(hit); return; }
    let alive = true;
    setSvg(null);
    fetch(url).then(r => r.text()).then(t => {
      const out = t.replace(/(<svg[^>]*)\s+(?:width|height)="[^"]*"/g, '$1')
                   .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"');
      svgCache.set(url, out);
      if (alive) setSvg(out);
    }).catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [url, kind]);
  useEffect(() => { if (kind === 'svg' && svg) onReady?.(); }, [svg, kind]);
  if (kind === 'png') return <img src={url} alt="Rendu de la frame" draggable={false} onLoad={() => onReady?.()} class="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />;
  if (svg === null) return <div class="w-full h-full animate-pulse bg-dg-hover/40" />;
  if (!svg) return <p class="text-dg-text-2 text-[12px]">Rendu indisponible</p>;
  return <div class="w-full h-full" style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const TONE_CLASS: Record<Highlight['tone'], string> = {
  modified: 'border-dg-info',
  added:    'border-dg-success',
  removed:  'border-dg-danger',
  derived:  'border-dg-text-3/50',
};
// Le type de changement ne passe pas que par la couleur (daltonisme) : style du trait + libellé.
const TONE_STYLE: Record<Highlight['tone'], { border: string; label: string }> = {
  modified: { border: 'solid',  label: 'modifié' },
  added:    { border: 'solid',  label: 'ajouté' },
  removed:  { border: 'dashed', label: 'supprimé' },
  derived:  { border: 'dotted', label: 'déplacé par son parent' },
};

export function HighlightCanvas({ url, kind, frame, highlights, selectedId, onSelect }: {
  url: string; kind: 'svg' | 'png'; frame: { w: number; h: number };
  highlights: Highlight[]; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const fit = box.w > 0 && frame.w > 0 && frame.h > 0 ? Math.min(box.w / frame.w, box.h / frame.h) : 0;
  const [view, setView] = useState<View>({ scale: 0, tx: 0, ty: 0 });
  // (re)cadre au fit quand le conteneur/frame change tant qu'on n'a pas zoomé
  const fitView = (): View => ({ scale: fit, tx: (box.w - frame.w * fit) / 2, ty: (box.h - frame.h * fit) / 2 });
  useEffect(() => { setView(fitView()); }, [fit, frame.w, frame.h, box.w, box.h]);
  // Surlignages affichés seulement une fois le rendu de la frame chargé (sinon encadrés « flottants » sur un canvas vide).
  // URL de l'image prête (et non un booléen) : changer d'image invalide seul l'état, sans course
  // entre un onLoad instantané (PNG en cache) et un reset par useEffect, qui arrive après.
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const imgReady = readyUrl === url;

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; onBg: boolean; captured: boolean } | null>(null);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = clampView({ scale: view.scale * factor, tx: 0, ty: 0 }, fit, fit * 8);
    const k = next.scale / view.scale;
    // zoom centré sur le curseur : conserve le point sous le curseur
    setView({ scale: next.scale, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k });
  };
  const onPointerDown = (e: PointerEvent) => {
    // NE PAS capturer le pointeur ici : sinon les <button> de surlignage ne reçoivent
    // plus leur 'click' (crops jamais affichés). Capture différée au 1er déplacement réel.
    const onBg = !(e.target as HTMLElement).closest('button');
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, onBg, captured: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      d.moved = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); d.captured = true; } catch { /* best-effort */ }
    }
    if (d.moved) setView(v => ({ scale: v.scale, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved && d.onBg) onSelect(null); // clic net sur le FOND = déselection (pas sur un surlignage)
  };

  return (
    <div ref={ref} class="relative flex-1 min-h-0 overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onDblClick={() => setView(fitView())}>
      <div class="absolute top-0 left-0 origin-top-left"
        style={{ width: `${frame.w}px`, height: `${frame.h}px`, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        <div class="absolute inset-0"><FrameImage url={url} kind={kind} onReady={() => setReadyUrl(url)} /></div>
        {imgReady && view.scale > 0 && highlights.map(hl => (
          <button key={hl.nodeId}
            aria-label={`Voir l'élément ${TONE_STYLE[hl.tone].label}`}
            onClick={(e) => { e.stopPropagation(); onSelect(hl.nodeId); }}
            class={`absolute rounded-sm transition-colors ${TONE_CLASS[hl.tone]} ${selectedId === hl.nodeId ? 'ring-2 ring-dg-text/70 bg-dg-text/5' : 'hover:bg-dg-text/5'}`}
            style={{ left: `${hl.bbox.x}px`, top: `${hl.bbox.y}px`, width: `${Math.max(6, hl.bbox.w)}px`, height: `${Math.max(6, hl.bbox.h)}px`, borderWidth: `${2 / view.scale}px`, borderStyle: TONE_STYLE[hl.tone].border }}
          />
        ))}
      </div>
      <button aria-label="Réinitialiser la vue" onClick={() => setView(fitView())}
        class="chip absolute bottom-2 right-2 z-10 py-1 bg-dg-raised/90 border border-dg-border text-dg-text-2 hover:text-dg-text hover:bg-dg-hover">Réinitialiser la vue</button>
    </div>
  );
}
