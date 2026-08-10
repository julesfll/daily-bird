export const SIZE_BUCKETS = ['XS', 'S', 'M', 'L', 'XL'] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

export const SIZE_LABELS: Record<SizeBucket, string> = {
  XS: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Huge',
};

export type Continent =
  | 'North America'
  | 'South America'
  | 'Europe'
  | 'Africa'
  | 'Asia'
  | 'Oceania'
  | 'Antarctica';

export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface Reveal {
  /** Trophic niche / diet, e.g. "Invertivore". */
  diet: string;
  /** Migration behaviour label. */
  migration: string;
  /** IUCN Red List category, e.g. "Least Concern". */
  status: string;
  /** One-line piece of trivia shown on the reveal card. */
  fact: string;
}

export interface Species {
  id: number;
  /** Scientific (binomial) name. */
  sci: string;
  /** English common name. */
  name: string;
  /** Player-facing family label, e.g. "Owls". */
  family: string;
  /** Bucketed dominant plumage colour. */
  color: string;
  /** Body mass in grams. */
  mass: number;
  size: SizeBucket;
  habitat: string;
  continent: Continent;
  /** Range centroid. */
  lat: number;
  lon: number;
  /**
   * True when the species' range is so large that a centroid-to-centroid
   * compass bearing would be misleading. Suppresses the direction sub-clue.
   */
  wide: boolean;
  /** English Wikipedia article title, used to fetch a photo at reveal time. */
  wiki: string;
  reveal: Reveal;
}

export interface SpeciesFile {
  /** ISO date the puzzle sequence starts from. */
  launchDate: string;
  /** Deterministic play order; values are indices into `species`. */
  poolOrder: number[];
  /** Which clues this dataset can support (a clue is hidden if unavailable). */
  clues: { color: boolean };
  /**
   * Mass range each bucket covers, as display copy. The pipeline picks the
   * thresholds from the pool's own distribution and emits the labels here, so
   * the client never hardcodes a number that could drift out of date.
   */
  sizeRanges: Record<SizeBucket, string>;
  species: Species[];
}

export type SizeClue = 'correct' | 'bigger' | 'smaller';

export type RegionClue =
  | { match: true; continent: Continent }
  | { match: false; wideRange: true }
  | { match: false; wideRange: false; compass: Compass };

export interface GuessResult {
  speciesId: number;
  correct: boolean;
  color: { match: boolean; value: string };
  size: { result: SizeClue; value: SizeBucket };
  habitat: { match: boolean; value: string };
  region: RegionClue;
  family: { match: boolean; value: string };
}

export type GameStatus = 'in_progress' | 'won' | 'lost';

export interface GameState {
  date: string;
  guesses: GuessResult[];
  status: GameStatus;
}
