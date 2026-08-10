import { GUESS_LIMIT } from '../config';
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
  title: string,
  url: string,
  limit: number | null = GUESS_LIMIT,
): string {
  const used = state.guesses.length;
  const score =
    limit === null
      ? state.status === 'won'
        ? `${used} ${used === 1 ? 'guess' : 'guesses'}`
        : 'gave up'
      : state.status === 'won'
        ? `${used}/${limit}`
        : `X/${limit}`;
  const grid = state.guesses.map((g) => rowFor(g, file.clues.color)).join('\n');
  return [`${title} ${score}`, '', grid, '', url].join('\n');
}
