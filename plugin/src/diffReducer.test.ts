import { describe, it, expect } from 'vitest'
import { diffReducer, initialDiffState } from './diffReducer.js'
import type { DiffData } from './diffReducer.js'

const base = initialDiffState('draft')

// ─── État initial ─────────────────────────────────────────────────────────────

describe('initialDiffState', () => {
  it('produit le bon état initial pour draft', () => {
    expect(base.status).toBe('draft')
    expect(base.loading).toBe(true)
    expect(base.data).toBeNull()
    expect(base.err).toBeNull()
    expect(base.heavyDone).toBe(false)
    expect(base.statusBusy).toBe(false)
    expect(base.restoring).toBe(false)
    expect(base.applyingToFigma).toBe(false)
    expect(base.restoreMsg).toBeNull()
  })

  it('propage le statut initial', () => {
    expect(initialDiffState('approved').status).toBe('approved')
    expect(initialDiffState('review').status).toBe('review')
  })
})

// ─── Chargement ───────────────────────────────────────────────────────────────

describe('LOAD_SUCCESS', () => {
  it('arrête le loading et set data', () => {
    const data = { node_diffs: [] } as unknown as DiffData
    const next = diffReducer(base, { type: 'LOAD_SUCCESS', data })
    expect(next.loading).toBe(false)
    expect(next.data).toBe(data)
    expect(next.err).toBeNull()
  })

  it('ne modifie pas les autres champs et réinitialise heavyDone', () => {
    const data = {} as DiffData
    const withHeavy = { ...base, heavyDone: true }
    const next = diffReducer(withHeavy, { type: 'LOAD_SUCCESS', data })
    expect(next.status).toBe(base.status)
    expect(next.heavyDone).toBe(false)
  })
})

describe('LOAD_ERROR', () => {
  it('arrête le loading et set err', () => {
    const next = diffReducer(base, { type: 'LOAD_ERROR', err: 'timeout réseau' })
    expect(next.loading).toBe(false)
    expect(next.err).toBe('timeout réseau')
    expect(next.data).toBeNull()
  })
})

// ─── Chargement lourd (vignettes/frames) ─────────────────────────────────────

describe('HEAVY_LOADED', () => {
  it('met heavyDone à true et fusionne les champs render', () => {
    const data = { node_diffs: [] } as unknown as DiffData
    const withData = diffReducer(base, { type: 'LOAD_SUCCESS', data })
    const heavy = { render_url: 'https://x.com/img.png', render_kind: 'png', render_source: 'blob',
      prev_render_url: null, prev_render_kind: null, prev_render_source: null,
      node_diffs: [], current_frame: { w: 100, h: 200 }, prev_frame: null } as unknown as DiffData
    const next = diffReducer(withData, { type: 'HEAVY_LOADED', data: heavy })
    expect(next.heavyDone).toBe(true)
    expect(next.data?.render_url).toBe('https://x.com/img.png')
    expect(next.data?.current_frame).toEqual({ w: 100, h: 200 })
  })

  it('est sans effet si data est null', () => {
    const heavy = {} as unknown as DiffData
    const next = diffReducer(base, { type: 'HEAVY_LOADED', data: heavy })
    expect(next).toBe(base)
  })
})

describe('HEAVY_DONE', () => {
  it('met heavyDone à true sans modifier data', () => {
    const next = diffReducer(base, { type: 'HEAVY_DONE' })
    expect(next.heavyDone).toBe(true)
    expect(next.data).toBeNull()
  })

  it('permet de signaler un échec du chargement lourd', () => {
    const data = { node_diffs: [] } as unknown as DiffData
    const withData = diffReducer(base, { type: 'LOAD_SUCCESS', data })
    const next = diffReducer(withData, { type: 'HEAVY_DONE' })
    expect(next.heavyDone).toBe(true)
    expect(next.data).toBe(withData.data)
  })
})

// ─── Status cycle ─────────────────────────────────────────────────────────────

describe('STATUS_START / SUCCESS / ERROR', () => {
  it('START verrouille le bouton', () => {
    expect(diffReducer(base, { type: 'STATUS_START' }).statusBusy).toBe(true)
  })

  it('SUCCESS applique le nouveau statut et déverrouille', () => {
    const s = diffReducer(base, { type: 'STATUS_START' })
    const next = diffReducer(s, { type: 'STATUS_SUCCESS', status: 'approved' })
    expect(next.statusBusy).toBe(false)
    expect(next.status).toBe('approved')
  })

  it('ERROR déverrouille et set err', () => {
    const s = diffReducer(base, { type: 'STATUS_START' })
    const next = diffReducer(s, { type: 'STATUS_ERROR', err: 'forbidden' })
    expect(next.statusBusy).toBe(false)
    expect(next.err).toBe('forbidden')
    expect(next.status).toBe('draft')
  })

  it('cycle complet draft → review → approved → draft', () => {
    const statuses = ['review', 'approved', 'draft'] as const
    let s = base
    for (const expected of statuses) {
      s = diffReducer(diffReducer(s, { type: 'STATUS_START' }), { type: 'STATUS_SUCCESS', status: expected })
      expect(s.status).toBe(expected)
    }
  })
})

// ─── Restore checkpoint ───────────────────────────────────────────────────────

describe('RESTORE_START / ERROR', () => {
  it('START active restoring', () => {
    expect(diffReducer(base, { type: 'RESTORE_START' }).restoring).toBe(true)
  })

  it('ERROR désactive restoring et set err', () => {
    const s = diffReducer(base, { type: 'RESTORE_START' })
    const next = diffReducer(s, { type: 'RESTORE_ERROR', err: 'conflict' })
    expect(next.restoring).toBe(false)
    expect(next.err).toBe('conflict')
  })
})

// ─── Apply to Figma ───────────────────────────────────────────────────────────

describe('APPLY_START / COMPLETE / ERROR', () => {
  it('START active applyingToFigma et efface restoreMsg', () => {
    const s = { ...base, restoreMsg: 'ancien message' }
    const next = diffReducer(s, { type: 'APPLY_START' })
    expect(next.applyingToFigma).toBe(true)
    expect(next.restoreMsg).toBeNull()
  })

  it('COMPLETE désactive applyingToFigma et construit le message sans skipped', () => {
    const s = diffReducer(base, { type: 'APPLY_START' })
    const next = diffReducer(s, { type: 'APPLY_COMPLETE', applied: 5 })
    expect(next.applyingToFigma).toBe(false)
    expect(next.restoreMsg).toBe('✓ 5 nœud(s) restauré(s)')
  })

  it('COMPLETE inclut le compte skipped si présent', () => {
    const s = diffReducer(base, { type: 'APPLY_START' })
    const next = diffReducer(s, { type: 'APPLY_COMPLETE', applied: 3, skipped: 2 })
    expect(next.restoreMsg).toBe('✓ 3 nœud(s) restauré(s) · 2 ignoré(s)')
  })

  it('COMPLETE avec 0 skipped n\'affiche pas "ignoré"', () => {
    const s = diffReducer(base, { type: 'APPLY_START' })
    const next = diffReducer(s, { type: 'APPLY_COMPLETE', applied: 4, skipped: 0 })
    expect(next.restoreMsg).toBe('✓ 4 nœud(s) restauré(s)')
  })

  it('ERROR désactive applyingToFigma et set err', () => {
    const s = diffReducer(base, { type: 'APPLY_START' })
    const next = diffReducer(s, { type: 'APPLY_ERROR', err: 'node introuvable' })
    expect(next.applyingToFigma).toBe(false)
    expect(next.err).toBe('node introuvable')
  })
})

// ─── Clear message ────────────────────────────────────────────────────────────

describe('CLEAR_MSG', () => {
  it('efface restoreMsg', () => {
    const s = { ...base, restoreMsg: '✓ 3 nœud(s) restauré(s)' }
    expect(diffReducer(s, { type: 'CLEAR_MSG' }).restoreMsg).toBeNull()
  })

  it('est idempotent si restoreMsg est déjà null', () => {
    expect(diffReducer(base, { type: 'CLEAR_MSG' }).restoreMsg).toBeNull()
  })
})

// ─── Immutabilité ─────────────────────────────────────────────────────────────

describe('immutabilité', () => {
  it('chaque action retourne un nouvel objet', () => {
    const next = diffReducer(base, { type: 'HEAVY_DONE' })
    expect(next).not.toBe(base)
  })

  it('l\'état de base n\'est pas muté', () => {
    diffReducer(base, { type: 'STATUS_START' })
    expect(base.statusBusy).toBe(false)
  })
})
