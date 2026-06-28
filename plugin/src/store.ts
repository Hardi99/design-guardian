import { createStore } from 'zustand/vanilla'
import type { FigmaSnapshot, PluginAuthor } from './types.js'

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface Asset { id: string; name: string; asset_type: string }

export interface Version {
  id: string; version_number: number; branch_name: string; parent_id: string | null;
  status: 'draft' | 'review' | 'approved';
  ai_summary: string | null; created_at: string;
  author_name: string | null; author_avatar_url: string | null;
}

export type Screen = 'loading' | 'assets' | 'home' | 'checkpoint' | 'diff'
export type Plan   = 'free' | 'pro' | 'team'

// ─── Store shape ──────────────────────────────────────────────────────────────

// Données pures — utilisées pour INITIAL_STATE et resetStore (typage strict)
interface AppData {
  screen:       Screen
  apiKey:       string | null
  plan:         Plan
  author:       PluginAuthor | null
  asset:        Asset | null
  branch:       string
  snapshot:     FigmaSnapshot | null
  renderSvgB64: string | undefined
  renderKind:   'svg' | 'png' | undefined
  initErr:      string | null
  diffVersion:  Version | null
  siblings:     Version[]   // versions de la branche courante (ordre ancien→récent) pour la nav ◀▶ du diff
}

// État complet = données + actions
export interface AppState extends AppData {
  setScreen:      (s: Screen)                             => void
  setApiKey:      (key: string)                           => void
  setPlan:        (p: Plan)                               => void
  setAuthor:      (a: PluginAuthor)                       => void
  setAsset:       (a: Asset | null)                       => void
  setBranch:      (b: string)                             => void
  setSnapshot:    (s: FigmaSnapshot | null, svg?: string, kind?: 'svg' | 'png') => void
  setInitErr:     (e: string | null)                      => void
  setDiffVersion: (v: Version | null)                     => void
  setSiblings:    (v: Version[])                          => void
}

// ─── Initial state ────────────────────────────────────────────────────────────
// Typé AppData (pas Partial) : tout nouveau champ dans AppData est obligatoire ici.

export const INITIAL_STATE: AppData = {
  screen:       'loading',
  apiKey:       null,
  plan:         'free',
  author:       null,
  asset:        null,
  branch:       'main',
  snapshot:     null,
  renderSvgB64: undefined,
  renderKind:   undefined,
  initErr:      null,
  diffVersion:  null,
  siblings:     [],
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const appStore = createStore<AppState>()((set) => ({
  ...INITIAL_STATE,

  setScreen:      (screen)                 => set({ screen }),
  setApiKey:      (apiKey)                 => set({ apiKey }),
  setPlan:        (plan)                   => set({ plan }),
  setAuthor:      (author)                 => set({ author }),
  // Changer d'asset réinitialise la branche : les branches sont PAR-asset, pas
  // globales. Sans ça, un nouvel asset hérite de la branche de l'ancien (bug fantôme).
  setAsset:       (asset)                  => set({ asset, branch: 'main' }),
  setBranch:      (branch)                 => set({ branch }),
  setSnapshot:    (snapshot, renderSvgB64, renderKind) => set({ snapshot, renderSvgB64, renderKind }),
  setInitErr:     (initErr)                => set({ initErr }),
  setDiffVersion: (diffVersion)            => set({ diffVersion }),
  setSiblings:    (siblings)               => set({ siblings }),
}))

// Remet les données à zéro entre chaque test (beforeEach(() => resetStore()))
export function resetStore() {
  appStore.setState(INITIAL_STATE)
}
