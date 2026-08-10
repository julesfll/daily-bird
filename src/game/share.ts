import { MAX_GUESSES } from './clues';
import type { GameState, GuessResult, SpeciesFile } from './types';

const COMPASS_ARROWS: Record<string, string> = {
  N: '⬆️',
  NE: '↗️',
  E: '➡️',
  SE: '↘️',
  S: '⬇️',
  SW: '↙️',
  W: '⬅️',
  NW: '↖️',
};

function regionEmoji(region: GuessResult['region']): string {
  if (region.match) return '🟩';
  if (region.wideRange) return '🌍';
  return COMPASS_ARROWS[region.compass] ?? '⬜';
}

function sizeEmoji(result: GuessResult['size']['result']): string {
  if (result === 'correct') return '🟩';
  return result === 'bigger' ? '🔼' : '🔽';
}

function rowFor(guess: GuessResult, showColor: boolean): string {
  const cells = [
    showColor ? (guess.color.match ? '🟩' : '⬜') : null,
    sizeEmoji(guess.size.result),
    guess.habitat.match ? '🟩' : '⬜',
    regionEmoji(guess.region),
    guess.family.match ? '🟩' : '⬜',
  ];
  return cells.filter((c): c is string => c !== null).join('');
}

/**
 * Wordle-style result grid. Carries no species names, so it stays spoiler-free
 * for anyone who has not played yet.
 */
export function buildShareText(
  state: GameState,
  file: SpeciesFile,
  puzzleNo: number,
  url: string,
): string {
  const score = state.status === 'won' ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const grid = state.guesses.map((g) => rowFor(g, file.clues.color)).join('\n');
  return [`Daily Bird #${puzzleNo} ${score}`, '', grid, '', url].join('\n');
}
