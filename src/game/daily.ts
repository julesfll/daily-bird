import type { Species, SpeciesFile } from './types';

const MS_PER_DAY = 86_400_000;

/** Today's puzzle date (YYYY-MM-DD) at the UTC rollover. */
export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from `launchDate` to `date`, both YYYY-MM-DD in UTC. */
export function daysSinceLaunch(date: string, launchDate: string): number {
  const from = Date.parse(`${launchDate}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((to - from) / MS_PER_DAY);
}

/**
 * The puzzle number a player sees. Day one is #1; dates before launch clamp
 * to #1 so a clock skewed backwards still gets a real puzzle.
 */
export function puzzleNumber(date: string, launchDate: string): number {
  return Math.max(0, daysSinceLaunch(date, launchDate)) + 1;
}

/**
 * The target for a given date. The pool order is a fixed-seed shuffle baked
 * into the data file, so every player on every device resolves the same bird
 * with no server involved. The sequence wraps once the pool is exhausted.
 */
export function targetForDate(file: SpeciesFile, date: string): Species {
  const offset = Math.max(0, daysSinceLaunch(date, file.launchDate));
  const poolIndex = file.poolOrder[offset % file.poolOrder.length];
  const target = file.species[poolIndex];
  if (!target) {
    throw new Error(`pool_order points at missing species index ${poolIndex}`);
  }
  return target;
}

/** A bird at random, for free play. */
export function randomTarget(file: SpeciesFile): Species {
  return file.species[Math.floor(Math.random() * file.species.length)];
}

/** Milliseconds until the next UTC midnight, for the countdown. */
export function msUntilRollover(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
