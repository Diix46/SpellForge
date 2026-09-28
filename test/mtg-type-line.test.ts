import { describe, expect, it } from 'vitest'
import { normalizeFrTypeLine, translateTypeLine } from '../app/composables/useMtg'

describe('french type lines', () => {
  it('reads the same whatever the printing', () => {
    expect(normalizeFrTypeLine('Créature : humain et barbare')).toBe('Créature — Humain et Barbare')
    expect(normalizeFrTypeLine('Créature — gobelin et shamane')).toBe('Créature — Gobelin et Shamane')
    expect(normalizeFrTypeLine('Créature - Dragon')).toBe('Créature — Dragon')
    expect(normalizeFrTypeLine('Planeswalker légendaire : Jace')).toBe('Planeswalker légendaire — Jace')
  })

  it('leaves a line without subtypes as it is', () => {
    expect(normalizeFrTypeLine('Rituel')).toBe('Rituel')
    expect(normalizeFrTypeLine('Artefact légendaire')).toBe('Artefact légendaire')
  })

  it('matches the translator', () => {
    expect(normalizeFrTypeLine('Créature : dragon')).toBe(translateTypeLine('Creature — Dragon'))
  })
})
