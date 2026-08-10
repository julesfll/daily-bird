import {
  SIZE_BUCKETS,
  type Compass,
  type GuessResult,
  type RegionClue,
  type SizeBucket,
  type SizeClue,
  type Species,
} from './types';

export const MAX_GUESSES = 6;

/** Mass thresholds (grams) separating the five size buckets. */
const SIZE_THRESHOLDS: Array<[SizeBucket, number]> = [
  ['XS', 20],
  ['S', 100],
  ['M', 500],
  ['L', 2000],
];

export function massToBucket(grams: number): SizeBucket {
  for (const [bucket, ceiling] of SIZE_THRESHOLDS) {
    if (grams < ceiling) return bucket;
  }
  return 'XL';
}

function sizeRank(bucket: SizeBucket): number {
  return SIZE_BUCKETS.indexOf(bucket);
}

function compareSize(guess: SizeBucket, target: SizeBucket): SizeClue {
  const delta = sizeRank(target) - sizeRank(guess);
  if (delta === 0) return 'correct';
  return delta > 0 ? 'bigger' : 'smaller';
}

const COMPASS_POINTS: Compass[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Signed shortest angular distance between two longitudes, in degrees. */
function lonDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Compass direction you would travel from the guess's range centroid to reach
 * the target's. Uses an equirectangular approximation, which is plenty for an
 * eight-way arrow and avoids great-circle bearings swinging wildly near poles.
 */
export function bearingBetween(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Compass {
  const meanLat = ((from.lat + to.lat) / 2) * (Math.PI / 180);
  const dy = to.lat - from.lat;
  const dx = lonDelta(from.lon, to.lon) * Math.cos(meanLat);

  // atan2(dx, dy) puts 0° at North and increases clockwise.
  const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;
  const normalized = (degrees + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return COMPASS_POINTS[index];
}

/** Degrees to rotate a north-pointing arrow so it faces the given direction. */
export function compassToDegrees(compass: Compass): number {
  return COMPASS_POINTS.indexOf(compass) * 45;
}

function evaluateRegion(guess: Species, target: Species): RegionClue {
  if (guess.continent === target.continent) {
    return { match: true, continent: target.continent };
  }
  if (target.wide) {
    return { match: false, wideRange: true };
  }
  return { match: false, wideRange: false, compass: bearingBetween(guess, target) };
}

/**
 * Compare a guess against the day's target. The target is never echoed back —
 * only the per-field verdicts a player is allowed to see.
 */
export function evaluateGuess(guess: Species, target: Species): GuessResult {
  return {
    speciesId: guess.id,
    correct: guess.id === target.id,
    color: { match: guess.color === target.color, value: guess.color },
    size: { result: compareSize(guess.size, target.size), value: guess.size },
    habitat: { match: guess.habitat === target.habitat, value: guess.habitat },
    region: evaluateRegion(guess, target),
    family: { match: guess.family === target.family, value: guess.family },
  };
}
