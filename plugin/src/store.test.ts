import { describe, it, expect, beforeEach } from 'vitest'
import { appStore, resetStore, INITIAL_STATE } from './store.js'
import type { PluginAuthor } from './types.js'

const { getState } = appStore

beforeEach(() => resetStore())

// ─── État initial ──────────────────────────────────────────────────────────────

describe('état initial', () => {
  it('screen = loading', () => {
    expect(getState().screen).toBe('loading')
  })

  it('toutes les données sont nulles / valeurs par défaut', () => {
    const s = getState()
    expect(s.apiKey).toBeNull()
    expect(s.plan).toBe('free')
    expect(s.author).toBeNull()
    expect(s.asset).toBeNull()
    expect(s.branch).toBe('main')
    expect(s.snapshot).toBeNull()
    expect(s.renderSvgB64).toBeUndefined()
    expect(s.initErr).toBeNull()
    expect(s.diffVersion).toBeNull()
  })
})

// ─── Setters ──────────────────────────────────────────────────────────────────

describe('setScreen', () => {
  it('passe à assets', () => {
    getState().setScreen('assets')
    expect(getState().screen).toBe('assets')
  })

  it('cycle complet loading → assets → home → diff → checkpoint → loading', () => {
    const screens = ['assets', 'home', 'diff', 'checkpoint', 'loading'] as const
    for (const s of screens) {
      getState().setScreen(s)
      expect(getState().screen).toBe(s)
    }
  })
})

describe('setApiKey', () => {
  it('enregistre la clé', () => {
    getState().setApiKey('sk-test-abc123')
    expect(getState().apiKey).toBe('sk-test-abc123')
  })
})

describe('setPlan', () => {
  it('passe à pro', () => {
    getState().setPlan('pro')
    expect(getState().plan).toBe('pro')
  })

  it('passe à team', () => {
    getState().setPlan('team')
    expect(getState().plan).toBe('team')
  })
})

describe('setAuthor', () => {
  it('enregistre l\'auteur', () => {
    const author: PluginAuthor = { figma_id: 'u1', name: 'Alice', avatar_url: 'https://x.com/a.png' }
    getState().setAuthor(author)
    expect(getState().author).toEqual(author)
  })
})

describe('setAsset', () => {
  it('enregistre l\'asset', () => {
    getState().setAsset({ id: 'a1', name: 'Home screen', asset_type: 'ui' })
    expect(getState().asset?.id).toBe('a1')
  })

  it('accepte null pour désélectionner', () => {
    getState().setAsset({ id: 'a1', name: 'Home', asset_type: 'ui' })
    getState().setAsset(null)
    expect(getState().asset).toBeNull()
  })
})

describe('setBranch', () => {
  it('change la branche', () => {
    getState().setBranch('feat/dark-mode')
    expect(getState().branch).toBe('feat/dark-mode')
  })
})

describe('setSnapshot', () => {
  it('enregistre snapshot et svg ensemble', () => {
    const snap = { figmaNodeId: 'n1', figmaNodeName: 'Card', capturedAt: '2026-01-01', root: {} as never }
    getState().setSnapshot(snap, 'abc==')
    expect(getState().snapshot?.figmaNodeId).toBe('n1')
    expect(getState().renderSvgB64).toBe('abc==')
  })

  it('snapshot sans svg laisse renderSvgB64 undefined', () => {
    const snap = { figmaNodeId: 'n2', figmaNodeName: 'Button', capturedAt: '2026-01-01', root: {} as never }
    getState().setSnapshot(snap)
    expect(getState().renderSvgB64).toBeUndefined()
  })
})

describe('setInitErr', () => {
  it('enregistre un message d\'erreur', () => {
    getState().setInitErr('Impossible de joindre le serveur.')
    expect(getState().initErr).toBe('Impossible de joindre le serveur.')
  })

  it('efface l\'erreur avec null', () => {
    getState().setInitErr('erreur')
    getState().setInitErr(null)
    expect(getState().initErr).toBeNull()
  })
})

describe('setDiffVersion', () => {
  it('enregistre la version cible', () => {
    const v = { id: 'v1', version_number: 3, branch_name: 'main', parent_id: null, status: 'draft' as const, ai_summary: null, created_at: '2026-01-01', author_name: null, author_avatar_url: null }
    getState().setDiffVersion(v)
    expect(getState().diffVersion?.id).toBe('v1')
    expect(getState().diffVersion?.version_number).toBe(3)
  })
})

// ─── resetStore ───────────────────────────────────────────────────────────────

describe('resetStore', () => {
  it('remet toutes les données à l\'état initial', () => {
    // Polluer l'état
    getState().setScreen('diff')
    getState().setApiKey('sk-polluted')
    getState().setPlan('team')
    getState().setBranch('feat/test')
    getState().setInitErr('boom')

    resetStore()

    const s = getState()
    expect(s.screen).toBe(INITIAL_STATE.screen)
    expect(s.apiKey).toBe(INITIAL_STATE.apiKey)
    expect(s.plan).toBe(INITIAL_STATE.plan)
    expect(s.branch).toBe(INITIAL_STATE.branch)
    expect(s.initErr).toBe(INITIAL_STATE.initErr)
  })

  it('les actions restent fonctionnelles après reset', () => {
    resetStore()
    getState().setScreen('home')
    expect(getState().screen).toBe('home')
  })

  it('plusieurs resets successifs sont idempotents', () => {
    getState().setApiKey('key')
    resetStore()
    resetStore()
    resetStore()
    expect(getState().apiKey).toBeNull()
    expect(getState().screen).toBe('loading')
  })
})

// ─── Isolation entre tests ────────────────────────────────────────────────────

describe('isolation', () => {
  it('test A modifie l\'état', () => {
    getState().setApiKey('from-test-A')
    expect(getState().apiKey).toBe('from-test-A')
  })

  it('test B repart de zéro (beforeEach reset)', () => {
    expect(getState().apiKey).toBeNull()
  })
})
