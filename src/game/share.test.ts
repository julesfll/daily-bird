import { describe, expect, it } from 'vitest';
import { buildShareText } from './share';
import type { GameState, GuessResult, SpeciesFile } from './types';

const file: SpeciesFile = {
  launchDate: '2026-08-10',
  poolOrder: [0],
  clues: { color: false },
  sizeRanges: { XS: '', S: '', M: '', L: '', XL: '' },
  species: [],
};

function guess(correct: boolean): GuessResult {
  return {
    speciesId: 1,
    correct,
    color: { match: false, value: 'brown' },
    size: { result: 'correct', value: 'S' },
    habitat: { match: false, value: 'Forest' },
    region: { match: true, continent: 'Europe' },
    family: { match: false, value: 'Finches' },
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return { date: '2026-08-10', status: 'won', guesses: [guess(true)], ...overrides };
}

describe('share text', () => {
  it('omits the colour column when the dataset has no colour', () => {
    const rows = buildShareText(state(), file, 'Daily Bird #1', 'url', 6).split('\n');
    // Spread, not .length: emoji are surrogate pairs and would count double.
    expect([...rows[2]]).toHaveLength(4); // size, habitat, region, family
  });

  it('says nothing about a hint that was not taken', () => {
    expect(buildShareText(state(), file, 'Daily Bird #1', 'url', 6)).not.toContain('🔍');
  });

  it('flags a hint that was taken, so a shared grid stays honest', () => {
    const text = buildShareText(state({ hintUsed: true }), file, 'Daily Bird #1', 'url', 6);
    expect(text.split('\n')[0]).toBe('Daily Bird #1 1/6 🔍');
  });

  it('never names the bird', () => {
    const text = buildShareText(state({ hintUsed: true }), file, 'Daily Bird #1', 'url', 6);
    expect(text).not.toMatch(/[A-Z][a-z]+ (Eagle|Owl|Finch)/);
  });
});
