import { describe, expect, it } from 'vitest';
import { computeStats, recordResult, type Store } from './storage';
import type { GameState } from './game/types';

function store(history: Store['history']): Store {
  return { game: null, history };
}

function finished(date: string, status: 'won' | 'lost', guesses: number): GameState {
  return {
    date,
    status,
    guesses: Array.from({ length: guesses }, (_, i) => ({
      speciesId: i,
      correct: false,
      color: { match: false, value: 'brown' },
      size: { result: 'bigger', value: 'S' },
      habitat: { match: false, value: 'Forest' },
      region: { match: false, wideRange: true },
      family: { match: false, value: 'Finches' },
    })),
  };
}

describe('recordResult', () => {
  it('files a finished game under its puzzle date', () => {
    const next = recordResult(store({}), finished('2026-08-10', 'won', 3));
    expect(next.history['2026-08-10']).toEqual({ won: true, guesses: 3 });
  });

  it('ignores a game still in progress', () => {
    const inProgress: GameState = { date: '2026-08-10', status: 'in_progress', guesses: [] };
    expect(recordResult(store({}), inProgress).history).toEqual({});
  });
});

describe('computeStats', () => {
  it('reports zeroes for a first-time player', () => {
    const stats = computeStats(store({}), '2026-08-10');
    expect(stats).toMatchObject({ played: 0, wins: 0, winRate: 0, currentStreak: 0 });
  });

  it('counts wins into the guess distribution', () => {
    const stats = computeStats(
      store({
        '2026-08-08': { won: true, guesses: 2 },
        '2026-08-09': { won: true, guesses: 2 },
        '2026-08-10': { won: false, guesses: 6 },
      }),
      '2026-08-10',
    );
    expect(stats.played).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.winRate).toBe(67);
    expect(stats.distribution[1]).toBe(2); // two wins in two guesses
    expect(stats.distribution[5]).toBe(0); // the loss is not a win in six
  });

  it('counts a streak of consecutive winning days', () => {
    const stats = computeStats(
      store({
        '2026-08-08': { won: true, guesses: 3 },
        '2026-08-09': { won: true, guesses: 4 },
        '2026-08-10': { won: true, guesses: 2 },
      }),
      '2026-08-10',
    );
    expect(stats.currentStreak).toBe(3);
    expect(stats.maxStreak).toBe(3);
  });

  it('keeps the streak alive when today has not been played yet', () => {
    const stats = computeStats(
      store({
        '2026-08-08': { won: true, guesses: 3 },
        '2026-08-09': { won: true, guesses: 4 },
      }),
      '2026-08-10',
    );
    expect(stats.currentStreak).toBe(2);
  });

  it('breaks the streak on a missed day', () => {
    const stats = computeStats(
      store({
        '2026-08-05': { won: true, guesses: 3 },
        '2026-08-06': { won: true, guesses: 3 },
        '2026-08-10': { won: true, guesses: 3 },
      }),
      '2026-08-10',
    );
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(2);
  });

  it('breaks the streak on a loss', () => {
    const stats = computeStats(
      store({
        '2026-08-08': { won: true, guesses: 3 },
        '2026-08-09': { won: false, guesses: 6 },
        '2026-08-10': { won: true, guesses: 1 },
      }),
      '2026-08-10',
    );
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(1);
  });

  it('handles a streak spanning a month boundary', () => {
    const stats = computeStats(
      store({
        '2026-08-30': { won: true, guesses: 3 },
        '2026-08-31': { won: true, guesses: 3 },
        '2026-09-01': { won: true, guesses: 3 },
      }),
      '2026-09-01',
    );
    expect(stats.currentStreak).toBe(3);
  });
});
