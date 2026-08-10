import { MAX_GUESSES, evaluateGuess } from './clues';
import type { GameState, GuessResult, Species } from './types';

export type SubmitOutcome =
  | { kind: 'accepted'; state: GameState; result: GuessResult }
  | { kind: 'duplicate'; state: GameState; result: GuessResult }
  | { kind: 'rejected'; state: GameState; reason: 'finished' };

export function newGame(date: string): GameState {
  return { date, guesses: [], status: 'in_progress' };
}

export function guessesRemaining(state: GameState): number {
  return Math.max(0, MAX_GUESSES - state.guesses.length);
}

/**
 * Apply a guess. Re-guessing a species returns the earlier verdict without
 * spending an attempt, which also makes a retried network-flaky submit safe.
 */
export function submitGuess(
  state: GameState,
  guess: Species,
  target: Species,
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
  const status: GameState['status'] = result.correct
    ? 'won'
    : guesses.length >= MAX_GUESSES
      ? 'lost'
      : 'in_progress';

  return { kind: 'accepted', state: { ...state, guesses, status }, result };
}

/** Give up: burns the remaining attempts and ends the game as a loss. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'in_progress') return state;
  return { ...state, status: 'lost' };
}
