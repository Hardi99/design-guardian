export interface View { scale: number; tx: number; ty: number }

/** Borne le facteur de zoom entre minScale (fit) et maxScale. Le pan reste libre. */
export function clampView(view: View, minScale: number, maxScale: number): View {
  const scale = Math.min(maxScale, Math.max(minScale, view.scale));
  return { scale, tx: view.tx, ty: view.ty };
}
