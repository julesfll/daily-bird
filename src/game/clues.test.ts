import { describe, expect, it } from 'vitest';
import { bearingBetween, compassToDegrees, evaluateGuess } from './clues';
import type { Species } from './types';

function species(overrides: Partial<Species> = {}): Species {
  return {
    id: 1,
    sci: 'Testus avis',
    name: 'Test Bird',
    family: 'Finches',
    color: 'brown',
    mass: 30,
    size: 'S',
    habitat: 'Woodland',
    continent: 'Europe',
    lat: 50,
    lon: 10,
    wide: false,
    wiki: 'Test_bird',
    reveal: { diet: 'Granivore', migration: 'Sedentary', status: 'Least Concern', fact: '' },
    ...overrides,
  };
}

describe('bearingBetween', () => {
  const origin = { lat: 0, lon: 0 };

  it('resolves the four cardinal directions', () => {
    expect(bearingBetween(origin, { lat: 20, lon: 0 })).toBe('N');
    expect(bearingBetween(origin, { lat: 0, lon: 20 })).toBe('E');
    expect(bearingBetween(origin, { lat: -20, lon: 0 })).toBe('S');
    expect(bearingBetween(origin, { lat: 0, lon: -20 })).toBe('W');
  });

  it('resolves the intercardinal directions', () => {
    expect(bearingBetween(origin, { lat: 20, lon: 20 })).toBe('NE');
    expect(bearingBetween(origin, { lat: -20, lon: 20 })).toBe('SE');
    expect(bearingBetween(origin, { lat: -20, lon: -20 })).toBe('SW');
    expect(bearingBetween(origin, { lat: 20, lon: -20 })).toBe('NW');
  });

  it('crosses the antimeridian by the short way round', () => {
    // 170°E to 170°W is 20° east, not 340° west.
    expect(bearingBetween({ lat: 0, lon: 170 }, { lat: 0, lon: -170 })).toBe('E');
    expect(bearingBetween({ lat: 0, lon: -170 }, { lat: 0, lon: 170 })).toBe('W');
  });

  it('maps compass points to arrow rotations clockwise from north', () => {
    expect(compassToDegrees('N')).toBe(0);
    expect(compassToDegrees('E')).toBe(90);
    expect(compassToDegrees('S')).toBe(180);
    expect(compassToDegrees('NW')).toBe(315);
  });
});

describe('evaluateGuess', () => {
  const target = species({
    id: 42,
    name: 'Target Bird',
    family: 'Owls',
    color: 'brown',
    size: 'L',
    habitat: 'Forest',
    continent: 'Africa',
    lat: -5,
    lon: 20,
  });

  it('flags the correct species', () => {
    const result = evaluateGuess(target, target);
    expect(result.correct).toBe(true);
    expect(result.size.result).toBe('correct');
    expect(result.region).toEqual({ match: true, continent: 'Africa' });
  });

  it('reports whether the target is bigger or smaller', () => {
    expect(evaluateGuess(species({ size: 'S' }), target).size.result).toBe('bigger');
    expect(evaluateGuess(species({ size: 'XL' }), target).size.result).toBe('smaller');
    expect(evaluateGuess(species({ size: 'L' }), target).size.result).toBe('correct');
  });

  it('matches colour, habitat and family independently', () => {
    const result = evaluateGuess(
      species({ color: 'brown', habitat: 'Desert', family: 'Owls' }),
      target,
    );
    expect(result.color.match).toBe(true);
    expect(result.habitat.match).toBe(false);
    expect(result.family.match).toBe(true);
  });

  it('gives a compass bearing when continents differ', () => {
    // Central Europe to central Africa is almost due south.
    const result = evaluateGuess(species({ continent: 'Europe', lat: 50, lon: 10 }), target);
    expect(result.region).toEqual({ match: false, wideRange: false, compass: 'S' });
  });

  it('points diagonally when the target is offset on both axes', () => {
    // From eastern North America the African target lies to the south-east.
    const result = evaluateGuess(
      species({ continent: 'North America', lat: 40, lon: -80 }),
      target,
    );
    expect(result.region).toEqual({ match: false, wideRange: false, compass: 'SE' });
  });

  it('suppresses the bearing for wide-ranging targets', () => {
    const roamer = species({ ...target, id: 43, wide: true });
    const result = evaluateGuess(species({ continent: 'Europe' }), roamer);
    expect(result.region).toEqual({ match: false, wideRange: true });
  });

  it('still reports a continent match for a wide-ranging target', () => {
    const roamer = species({ ...target, id: 43, wide: true });
    const result = evaluateGuess(species({ continent: 'Africa' }), roamer);
    expect(result.region).toEqual({ match: true, continent: 'Africa' });
  });

  it('never echoes the target back to the caller', () => {
    const serialized = JSON.stringify(evaluateGuess(species({ id: 7 }), target));
    expect(serialized).not.toContain('Target Bird');
    expect(serialized).not.toContain('"speciesId":42');
  });
});
