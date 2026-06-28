import type { Version } from './store.js'

// ─── Types données ────────────────────────────────────────────────────────────

export interface PropertyChange { property: string; oldValue: unknown; newValue: unknown; delta?: string }
export interface NodeDelta { nodeId: string; nodeName: string; nodeType: string; changes: PropertyChange[] }
export interface DeltaJSON { modified: NodeDelta[]; added: NodeDelta[]; removed: NodeDelta[]; totalChanges: number }

// Miroir du ReadableChange backend (langage designer).
export type ReadableChange =
  | { kind: 'color';      label: string; from: string; to: string }
  | { kind: 'weight';     label: string; from: string; to: string }
  | { kind: 'text';       label: string; from: string; to: string }
  | { kind: 'rotation';   label: string; degrees: number }
  | { kind: 'move';       label: string; dx: number; dy: number }
  | { kind: 'resize';     label: string; dw: number; dh: number }
  | { kind: 'opacity';    label: string; from: number; to: number }
  | { kind: 'visibility'; label: string; visible: boolean }
  | { kind: 'generic';    label: string; detail: string }

export interface BlockMove { name: string; dx: number; dy: number; count: number }

export interface Bbox { x: number; y: number; w: number; h: number }

export interface NodeDiffVisual {
  nodeId: string; nodeName: string; nodeType: string;
  changes: PropertyChange[];
  readable?: ReadableChange[];
  kind: 'modified' | 'added' | 'removed';
  significance: 'notable' | 'minor';
  before_bbox: Bbox | null;
  after_bbox: Bbox | null;
}

export interface DiffData {
  version:            Version & { snapshot_json: unknown; analysis_json: DeltaJSON | null }
  prev_version:       (Version & { snapshot_json: unknown }) | null
  render_url:         string | null
  render_kind:        'svg' | 'png' | null
  render_source:      'blob' | 'legacy' | 'reconstruction' | null
  prev_render_url:    string | null
  prev_render_kind:   'svg' | 'png' | null
  prev_render_source: 'blob' | 'legacy' | 'reconstruction' | null
  node_diffs:         NodeDiffVisual[]
  block_moves?:       BlockMove[]
  current_frame:      { w: number; h: number } | null
  prev_frame:         { w: number; h: number } | null
}

// ─── État du reducer ──────────────────────────────────────────────────────────

export interface DiffState {
  data:            DiffData | null
  loading:         boolean
  err:             string | null
  heavyDone:       boolean
  status:          Version['status']
  statusBusy:      boolean
  restoring:       boolean
  applyingToFigma: boolean
  restoreMsg:      string | null
}

export type DiffAction =
  | { type: 'LOAD_SUCCESS';   data: DiffData }
  | { type: 'LOAD_ERROR';     err: string }
  | { type: 'STATUS_START' }
  | { type: 'STATUS_SUCCESS'; status: Version['status'] }
  | { type: 'STATUS_ERROR';   err: string }
  | { type: 'RESTORE_START' }
  | { type: 'RESTORE_ERROR';  err: string }
  | { type: 'APPLY_START' }
  | { type: 'APPLY_COMPLETE'; applied: number; skipped?: number; restoreMsg?: string }
  | { type: 'APPLY_ERROR';    err: string }
  | { type: 'HEAVY_LOADED';   data: DiffData }
  | { type: 'HEAVY_DONE' }
  | { type: 'CLEAR_MSG' }

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'LOAD_SUCCESS':   return { ...state, loading: false, data: action.data, heavyDone: false }
    case 'LOAD_ERROR':     return { ...state, loading: false, err: action.err }
    case 'STATUS_START':   return { ...state, statusBusy: true }
    case 'STATUS_SUCCESS': return { ...state, statusBusy: false, status: action.status }
    case 'STATUS_ERROR':   return { ...state, statusBusy: false, err: action.err }
    case 'RESTORE_START':  return { ...state, restoring: true }
    case 'RESTORE_ERROR':  return { ...state, restoring: false, err: action.err }
    case 'APPLY_START':    return { ...state, applyingToFigma: true, restoreMsg: null }
    case 'APPLY_COMPLETE': return {
      ...state, applyingToFigma: false,
      restoreMsg: action.restoreMsg ?? `✓ ${action.applied} nœud(s) restauré(s)${action.skipped ? ` · ${action.skipped} ignoré(s)` : ''}`,
    }
    case 'APPLY_ERROR':    return { ...state, applyingToFigma: false, err: action.err }
    // Le lourd (frames + vignettes) arrive en différé → fusion dans les données affichées.
    case 'HEAVY_LOADED':   return state.data ? { ...state, heavyDone: true, data: { ...state.data,
      render_url: action.data.render_url, render_kind: action.data.render_kind,
      render_source: action.data.render_source,
      prev_render_url: action.data.prev_render_url, prev_render_kind: action.data.prev_render_kind,
      prev_render_source: action.data.prev_render_source,
      node_diffs: action.data.node_diffs,
      current_frame: action.data.current_frame,
      prev_frame: action.data.prev_frame,
    } } : state
    case 'HEAVY_DONE':     return { ...state, heavyDone: true }
    case 'CLEAR_MSG':      return { ...state, restoreMsg: null }
    default: return state
  }
}

export function initialDiffState(status: Version['status']): DiffState {
  return {
    data: null, loading: true, err: null,
    heavyDone: false, status,
    statusBusy: false, restoring: false, applyingToFigma: false,
    restoreMsg: null,
  }
}
