import type { Version } from './store.js'

// ─── Types données ────────────────────────────────────────────────────────────

export interface PropertyChange { property: string; oldValue: unknown; newValue: unknown; delta?: string }
export interface NodeDelta { nodeId: string; nodeName: string; nodeType: string; changes: PropertyChange[] }
export interface DeltaJSON { modified: NodeDelta[]; added: NodeDelta[]; removed: NodeDelta[]; totalChanges: number }

export interface NodeDiffVisual {
  nodeId: string; nodeName: string; nodeType: string;
  changes: PropertyChange[];
  kind: 'modified' | 'added' | 'removed';
  before_svg_b64: string | null;
  after_svg_b64: string | null;
}

export interface DiffData {
  version:      Version & { snapshot_json: unknown; analysis_json: DeltaJSON | null }
  prev_version: (Version & { snapshot_json: unknown }) | null
  svg_b64:      string | null
  prev_svg_b64: string | null
  node_diffs:   NodeDiffVisual[]
}

// ─── État du reducer ──────────────────────────────────────────────────────────

export interface DiffState {
  data:            DiffData | null
  loading:         boolean
  err:             string | null
  mode:            'split' | 'overlay'
  status:          Version['status']
  statusBusy:      boolean
  restoring:       boolean
  applyingToFigma: boolean
  restoreMsg:      string | null
  view:            'nodes' | 'frame'
}

export type DiffAction =
  | { type: 'LOAD_SUCCESS';   data: DiffData }
  | { type: 'LOAD_ERROR';     err: string }
  | { type: 'SET_MODE';       mode: 'split' | 'overlay' }
  | { type: 'STATUS_START' }
  | { type: 'STATUS_SUCCESS'; status: Version['status'] }
  | { type: 'STATUS_ERROR';   err: string }
  | { type: 'RESTORE_START' }
  | { type: 'RESTORE_ERROR';  err: string }
  | { type: 'APPLY_START' }
  | { type: 'APPLY_COMPLETE'; applied: number; skipped?: number }
  | { type: 'APPLY_ERROR';    err: string }
  | { type: 'SET_VIEW';       view: 'nodes' | 'frame' }
  | { type: 'CLEAR_MSG' }

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'LOAD_SUCCESS':   return { ...state, loading: false, data: action.data }
    case 'LOAD_ERROR':     return { ...state, loading: false, err: action.err }
    case 'SET_MODE':       return { ...state, mode: action.mode }
    case 'STATUS_START':   return { ...state, statusBusy: true }
    case 'STATUS_SUCCESS': return { ...state, statusBusy: false, status: action.status }
    case 'STATUS_ERROR':   return { ...state, statusBusy: false, err: action.err }
    case 'RESTORE_START':  return { ...state, restoring: true }
    case 'RESTORE_ERROR':  return { ...state, restoring: false, err: action.err }
    case 'APPLY_START':    return { ...state, applyingToFigma: true, restoreMsg: null }
    case 'APPLY_COMPLETE': return {
      ...state, applyingToFigma: false,
      restoreMsg: `✓ ${action.applied} nœud(s) restauré(s)${action.skipped ? ` · ${action.skipped} ignoré(s)` : ''}`,
    }
    case 'APPLY_ERROR':    return { ...state, applyingToFigma: false, err: action.err }
    case 'SET_VIEW':       return { ...state, view: action.view }
    case 'CLEAR_MSG':      return { ...state, restoreMsg: null }
    default: return state
  }
}

export function initialDiffState(status: Version['status']): DiffState {
  return {
    data: null, loading: true, err: null,
    mode: 'split', status,
    statusBusy: false, restoring: false, applyingToFigma: false,
    restoreMsg: null, view: 'nodes',
  }
}
