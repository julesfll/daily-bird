import { MAX_GUESSES } from './game/clues';
import type { GameState } from './game/types';

const KEY = 'dailybird:v1';

export interface DayRecord {
  won: boolean;
  /** Guesses used. For a loss this is however many were spent. */
  guesses: number;
}

export interface Store {
  /** The in-flight game, kept so a refresh resumes where the player left off. */
  game: GameState | null;
  /** Finished games, keyed by puzzle date. */
  history: Record<string, DayRecord>;
}

const EMPTY: Store = { game: null, history: {} };

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      game: parsed.game ?? null,
      history: parsed.history ?? {},
    };
  } catch {
    // Corrupt or unavailable storage (private mode, quota, hand-edited JSON)
    // should cost the player their history, not the whole game.
    return EMPTY;
  }
}

export function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Nothing useful to do; the game still works for this session.
  }
}

export function recordResult(store: Store, state: GameState): Store {
  if (state.status === 'in_progress') return store;
  return {
    ...store,
    history: {
      ...store.history,
      [state.date]: { won: state.status === 'won', guesses: state.guesses.length },
    },
  };
}

export interface Stats {
  played: number;
  wins: number;
  winRate: number;
  currentStreak: number;
  maxStreak: number;
  /** Index 0 = won in one guess ... index MAX_GUESSES-1 = won in six. */
  distribution: number[];
}

const MS_PER_DAY = 86_400_000;

function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Streaks walk backwards day by day from today. Today being unplayed does not
 * break the streak — the player may simply not have got to it yet — but any
 * earlier gap does.
 */
export function computeStats(store: Store, today: string): Stats {
  const dates = Object.keys(store.history).sort();
  const played = dates.length;
  const wins = dates.filter((d) => store.history[d].won).length;

  const distribution = Array(MAX_GUESSES).fill(0) as number[];
  for (const date of dates) {
    const record = store.history[date];
    if (record.won && record.guesses >= 1 && record.guesses <= MAX_GUESSES) {
      distribution[record.guesses - 1] += 1;
    }
  }

  let currentStreak = 0;
  let cursor = store.history[today]?.won === undefined ? previousDay(today) : today;
  while (store.history[cursor]?.won) {
    currentStreak += 1;
    cursor = previousDay(cursor);
  }

  let maxStreak = 0;
  let running = 0;
  let expected: string | null = null;
  for (const date of dates) {
    if (!store.history[date].won) {
      running = 0;
      expected = null;
      continue;
    }
    running = expected === date ? running + 1 : 1;
    maxStreak = Math.max(maxStreak, running);
    expected = new Date(Date.parse(`${date}T00:00:00Z`) + MS_PER_DAY).toISOString().slice(0, 10);
  }

  return {
    played,
    wins,
    winRate: played ? Math.round((wins / played) * 100) : 0,
    currentStreak,
    maxStreak: Math.max(maxStreak, currentStreak),
    distribution,
  };
}
