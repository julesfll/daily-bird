import { describe, expect, it } from 'vitest';
import { MAX_GUESSES } from './clues';
import { giveUp, guessesRemaining, markHintUsed, newGame, submitGuess } from './engine';
import { daysSinceLaunch, msUntilRollover, puzzleNumber, targetForDate, todayUTC } from './daily';
import type { GameState, Species, SpeciesFile } from './types';

function species(id: number, overrides: Partial<Species> = {}): Species {
  return {
    id,
    sci: `Testus s${id}`,
    name: `Bird ${id}`,
    family: 'Finches',
    color: 'brown',
    mass: 30,
    size: 'S',
    habitat: 'Woodland',
    continent: 'Europe',
    lat: 50,
    lon: 10,
    wide: false,
    wiki: `Bird_${id}`,
    reveal: { diet: 'Granivore', migration: 'Sedentary', status: 'Least Concern', fact: '' },
    ...overrides,
  };
}

const target = species(99, { name: 'The Answer', continent: 'Asia', lat: 30, lon: 100 });

/**
 * The limit is passed explicitly throughout so both the capped and uncapped
 * rules stay covered whatever GUESS_LIMIT in config.ts is currently set to.
 */
function playWrong(state: GameState, count: number, limit: number | null): GameState {
  let current = state;
  for (let i = 0; i < count; i++) {
    const outcome = submitGuess(current, species(i + 1), target, limit);
    if (outcome.kind !== 'accepted') throw new Error(`guess ${i} was ${outcome.kind}`);
    current = outcome.state;
  }
  return current;
}

describe('submitGuess with a guess cap', () => {
  it('records a wrong guess and keeps the game open', () => {
    const outcome = submitGuess(newGame('2026-08-10'), species(1), target, MAX_GUESSES);
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') return;
    expect(outcome.state.status).toBe('in_progress');
    expect(outcome.state.guesses).toHaveLength(1);
    expect(guessesRemaining(outcome.state, MAX_GUESSES)).toBe(MAX_GUESSES - 1);
  });

  it('wins immediately on the right species', () => {
    const outcome = submitGuess(newGame('2026-08-10'), target, target, MAX_GUESSES);
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') return;
    expect(outcome.state.status).toBe('won');
    expect(outcome.result.correct).toBe(true);
  });

  it('loses after six wrong guesses', () => {
    const state = playWrong(newGame('2026-08-10'), MAX_GUESSES, MAX_GUESSES);
    expect(state.status).toBe('lost');
    expect(guessesRemaining(state, MAX_GUESSES)).toBe(0);
  });

  it('does not spend an attempt on a repeated species', () => {
    const first = submitGuess(newGame('2026-08-10'), species(1), target, MAX_GUESSES);
    if (first.kind !== 'accepted') throw new Error('expected acceptance');

    const repeat = submitGuess(first.state, species(1), target, MAX_GUESSES);
    expect(repeat.kind).toBe('duplicate');
    expect(repeat.state.guesses).toHaveLength(1);
    if (repeat.kind === 'duplicate') {
      expect(repeat.result).toEqual(first.result);
    }
  });

  it('rejects guesses once the game is over', () => {
    const lost = playWrong(newGame('2026-08-10'), MAX_GUESSES, MAX_GUESSES);
    const outcome = submitGuess(lost, species(1234), target, MAX_GUESSES);
    expect(outcome.kind).toBe('rejected');
    expect(outcome.state.guesses).toHaveLength(MAX_GUESSES);
  });

  it('give up ends the game without adding a guess', () => {
    const state = giveUp(playWrong(newGame('2026-08-10'), 2, MAX_GUESSES));
    expect(state.status).toBe('lost');
    expect(state.guesses).toHaveLength(2);
    expect(giveUp(state)).toBe(state);
  });
});

describe('submitGuess with no guess cap', () => {
  it('keeps accepting guesses well past the usual limit', () => {
    const state = playWrong(newGame('2026-08-10'), MAX_GUESSES * 3, null);
    expect(state.status).toBe('in_progress');
    expect(state.guesses).toHaveLength(MAX_GUESSES * 3);
  });

  it('reports no remaining count when uncapped', () => {
    expect(guessesRemaining(newGame('2026-08-10'), null)).toBeNull();
  });

  it('still ends on a win', () => {
    const played = playWrong(newGame('2026-08-10'), 10, null);
    const outcome = submitGuess(played, target, target, null);
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') return;
    expect(outcome.state.status).toBe('won');
  });

  it('still ends on give up', () => {
    expect(giveUp(playWrong(newGame('2026-08-10'), 9, null)).status).toBe('lost');
  });

  it('still refuses a repeated species', () => {
    const played = playWrong(newGame('2026-08-10'), 3, null);
    const repeat = submitGuess(played, species(1), target, null);
    expect(repeat.kind).toBe('duplicate');
    expect(repeat.state.guesses).toHaveLength(3);
  });
});

describe('photo hint', () => {
  it('records that the hint was taken', () => {
    const state = markHintUsed(newGame('2026-08-10'));
    expect(state.hintUsed).toBe(true);
  });

  it('is unset until asked for', () => {
    expect(newGame('2026-08-10').hintUsed).toBeUndefined();
  });

  it('is idempotent and costs no guess', () => {
    const once = markHintUsed(newGame('2026-08-10'));
    expect(markHintUsed(once)).toBe(once);
    expect(once.guesses).toHaveLength(0);
    expect(guessesRemaining(once, MAX_GUESSES)).toBe(MAX_GUESSES);
  });

  it('survives a guess, so a refresh keeps the photo visible', () => {
    const outcome = submitGuess(markHintUsed(newGame('2026-08-10')), species(1), target, null);
    if (outcome.kind !== 'accepted') throw new Error('expected acceptance');
    expect(outcome.state.hintUsed).toBe(true);
  });
});

describe('free-play target', () => {
  it('remembers its bird so a refresh resumes the same round', () => {
    const state = newGame('2026-08-10', 42);
    expect(state.targetId).toBe(42);
    const outcome = submitGuess(state, species(1), target, null);
    if (outcome.kind !== 'accepted') throw new Error('expected acceptance');
    expect(outcome.state.targetId).toBe(42);
  });

  it('leaves the target unset for a daily game', () => {
    expect(newGame('2026-08-10').targetId).toBeUndefined();
  });
});

describe('daily rotation', () => {
  const file: SpeciesFile = {
    launchDate: '2026-08-10',
    poolOrder: [2, 0, 1],
    clues: { color: true },
    sizeRanges: { XS: '', S: '', M: '', L: '', XL: '' },
    species: [species(10), species(11), species(12)],
  };

  it('walks the pool order one bird per day', () => {
    expect(targetForDate(file, '2026-08-10').id).toBe(12);
    expect(targetForDate(file, '2026-08-11').id).toBe(10);
    expect(targetForDate(file, '2026-08-12').id).toBe(11);
  });

  it('wraps around when the pool runs out', () => {
    expect(targetForDate(file, '2026-08-13').id).toBe(12);
  });

  it('clamps dates before launch to the first puzzle', () => {
    expect(targetForDate(file, '2026-01-01').id).toBe(12);
    expect(puzzleNumber('2026-01-01', file.launchDate)).toBe(1);
  });

  it('numbers puzzles from one', () => {
    expect(puzzleNumber('2026-08-10', file.launchDate)).toBe(1);
    expect(puzzleNumber('2026-08-20', file.launchDate)).toBe(11);
  });

  it('counts days across month and year boundaries', () => {
    expect(daysSinceLaunch('2026-09-01', '2026-08-31')).toBe(1);
    expect(daysSinceLaunch('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysSinceLaunch('2028-03-01', '2028-02-28')).toBe(2); // 2028 is a leap year
  });

  it('rolls over at midnight UTC regardless of local zone', () => {
    expect(todayUTC(new Date('2026-08-10T23:59:59Z'))).toBe('2026-08-10');
    expect(todayUTC(new Date('2026-08-11T00:00:00Z'))).toBe('2026-08-11');
    expect(msUntilRollover(new Date('2026-08-10T23:00:00Z'))).toBe(3_600_000);
    expect(msUntilRollover(new Date('2026-08-10T00:00:00Z'))).toBe(86_400_000);
  });
});
