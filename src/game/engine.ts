import { GUESS_LIMIT } from '../config';
import { evaluateGuess } from './clues';
import type { GameState, GuessResult, Species } from './types';

export type SubmitOutcome =
  | { kind: 'accepted'; state: GameState; result: GuessResult }
  | { kind: 'duplicate'; state: GameState; result: GuessResult }
  | { kind: 'rejected'; state: GameState; reason: 'finished' };

export function newGame(date: string, targetId?: number): GameState {
  return { date, guesses: [], status: 'in_progress', targetId };
}

/** Guesses left, or null when there is no cap. */
export function guessesRemaining(
  state: GameState,
  limit: number | null = GUESS_LIMIT,
): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - state.guesses.length);
}

/**
 * Apply a guess. Re-guessing a species returns the earlier verdict without
 * spending an attempt, which also makes a retried network-flaky submit safe.
 *
 * `limit` is a parameter rather than a constant so both the capped and
 * uncapped rules stay exercised by tests regardless of the current config.
 */
export function submitGuess(
  state: GameState,
  guess: Species,
  target: Species,
  limit: number | null = GUESS_LIMIT,
): SubmitOutcome {
  if (state.status !== 'in_progress') {
    return { kind: 'rejected', state, reason: 'finished' };
  }

  const previous = state.guesses.find((g) => g.speciesId === guess.id);
  if (previous) {
    return { kind: 'duplicate', state, result: previous };
  }

  const result = evaluateGuess(guess, target);
  const guesses = [...state.guesses, result];
  const outOfGuesses = limit !== null && guesses.length >= limit;
  const status: GameState['status'] = result.correct
    ? 'won'
    : outOfGuesses
      ? 'lost'
      : 'in_progress';

  return { kind: 'accepted', state: { ...state, guesses, status }, result };
}

/** Give up: ends the game as a loss without adding a guess. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'in_progress') return state;
  return { ...state, status: 'lost' };
}
