import type { NodeDiffVisual } from '../../diffReducer.js';
import { NodeCrop } from './DiffCanvas.js';

export function NodeDetail({ node, renderUrl, prevRenderUrl, currentFrame, prevFrame }: {
  node: NodeDiffVisual | null;
  renderUrl: string | null; prevRenderUrl: string | null;
  currentFrame: { w: number; h: number } | null; prevFrame: { w: number; h: number } | null;
}) {
  if (!node) return (
    <div class="flex-1 flex items-center justify-center p-6 text-center">
      <p class="text-dg-text-3 text-[11px]">Clique un élément surligné pour voir son changement.</p>
    </div>
  );
  return (
    <div class="flex flex-col overflow-y-auto">
      <div class="px-4 py-3 border-b border-dg-border">
        <p class="text-[11px] font-medium text-dg-text truncate" title={node.nodeName}>{node.nodeName}
          <span class="text-dg-text-3 font-mono ml-1 text-[10px]">{node.nodeType}</span></p>
      </div>
      <div class="flex border-b border-dg-border">
        <div class="flex-1 min-h-[96px] max-h-32 p-2 border-r border-dg-border overflow-hidden flex flex-col items-center justify-center gap-1">
          {node.before_bbox && prevRenderUrl && prevFrame
            ? <NodeCrop url={prevRenderUrl} frameW={prevFrame.w} frameH={prevFrame.h} bbox={node.before_bbox} alt={`Aperçu avant de ${node.nodeName}`} />
            : <span class="text-dg-text-3 text-[11px]">—</span>}
          <span class="text-[10px] text-dg-text-3">avant</span>
        </div>
        <div class="flex-1 min-h-[96px] max-h-32 p-2 overflow-hidden flex flex-col items-center justify-center gap-1">
          {node.after_bbox && renderUrl && currentFrame
            ? <NodeCrop url={renderUrl} frameW={currentFrame.w} frameH={currentFrame.h} bbox={node.after_bbox} alt={`Aperçu après de ${node.nodeName}`} />
            : <span class="text-dg-text-3 text-[11px]">—</span>}
          <span class="text-[10px] text-dg-text-3">après</span>
        </div>
      </div>
      {(node.readable && node.readable.length > 0) ? (
        <div class="px-3 py-2 border-t border-dg-border flex flex-col gap-1">
          {node.readable.map((r, i) => (
            <div key={i} class="flex items-center gap-2 text-[11px]">
              <span class="text-dg-text-2 w-16 flex-shrink-0">{r.label}</span>
              <span class="text-dg-text flex items-center gap-1.5 leading-tight">
                {r.kind === 'color' ? (
                  <>
                    <span class="inline-block w-3 h-3 rounded-sm border border-dg-border" style={{ background: r.from }} />
                    <span class="font-mono text-dg-text-3">{r.from}</span>
                    <span class="text-dg-text-3">→</span>
                    <span class="inline-block w-3 h-3 rounded-sm border border-dg-border" style={{ background: r.to }} />
                    <span class="font-mono">{r.to}</span>
                  </>
                ) : (r.kind === 'weight' || r.kind === 'text') ? (
                  <span><span class="text-dg-text-3">{r.from}</span> → {r.to}</span>
                ) : r.kind === 'rotation' ? (
                  <span>↻ {r.degrees > 0 ? '+' : ''}{r.degrees}°</span>
                ) : r.kind === 'move' ? (
                  <span>↔ {r.dx}px, {r.dy}px</span>
                ) : r.kind === 'resize' ? (
                  <span>⤢ {r.dw > 0 ? '+' : ''}{r.dw}px, {r.dh > 0 ? '+' : ''}{r.dh}px</span>
                ) : r.kind === 'opacity' ? (
                  <span>{r.from}% → {r.to}%</span>
                ) : r.kind === 'visibility' ? (
                  <span>{r.visible ? 'Affiché' : 'Masqué'}</span>
                ) : (
                  <span class="font-mono text-dg-text-3">{r.detail}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : node.changes.length > 0 && (
        <div class="px-3 py-2 border-t border-dg-border flex flex-col gap-0.5">
          {node.changes.map((ch, i) => (
            <div key={i} class="flex items-start gap-2">
              <span class="text-[10px] font-mono text-dg-text-3 w-20 flex-shrink-0 truncate">{ch.property}</span>
              <span class="text-[10px] text-dg-accent-text font-mono leading-tight">{ch.delta ?? `${String(ch.oldValue)} → ${String(ch.newValue)}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
