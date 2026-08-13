import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIZE_BUCKETS } from './types';
import type { SpeciesFile } from './types';
import { targetForDate } from './daily';

/**
 * Guards the committed dataset rather than the code: a bad pipeline run should
 * fail CI before it ever reaches a player.
 */
const file: SpeciesFile = JSON.parse(
  readFileSync(new URL('../../public/data/species.json', import.meta.url), 'utf-8'),
);

describe('shipped dataset', () => {
  it('has a usable pool', () => {
    expect(file.species.length).toBeGreaterThan(100);
    expect(file.launchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives every species the fields the clues depend on', () => {
    for (const s of file.species) {
      expect(s.name, `species ${s.id}`).toBeTruthy();
      expect(s.sci, s.name).toBeTruthy();
      expect(s.family, s.name).toBeTruthy();
      // Colour is only present when the dataset can support that clue.
      if (file.clues.color) expect(s.color, s.name).toBeTruthy();
      expect(s.habitat, s.name).toBeTruthy();
      expect(s.continent, s.name).toBeTruthy();
      expect(s.wiki, s.name).toBeTruthy();
      expect(SIZE_BUCKETS, s.name).toContain(s.size);
      expect(typeof s.wide, s.name).toBe('boolean');
      expect(Math.abs(s.lat), s.name).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lon), s.name).toBeLessThanOrEqual(180);
      expect(s.mass, s.name).toBeGreaterThan(0);
      expect(s.reveal.status, s.name).toBeTruthy();
      expect(s.reveal.diet, s.name).toBeTruthy();
      // reveal.fact is deliberately optional: at pool sizes past a few
      // hundred there is no hand-written trivia, and the reveal card falls
      // back to the Wikipedia extract it already fetches for the photo.
    }
  });

  it('uses ids that match array positions, so pool order resolves', () => {
    file.species.forEach((s, index) => expect(s.id).toBe(index));
  });

  it('has no duplicate species', () => {
    const names = new Set(file.species.map((s) => s.sci));
    expect(names.size).toBe(file.species.length);
  });

  it('ships a size-range label for every bucket', () => {
    for (const bucket of SIZE_BUCKETS) {
      expect(file.sizeRanges[bucket]).toBeTruthy();
    }
  });

  it('never repeats an answer before the sequence wraps', () => {
    expect([...new Set(file.poolOrder)].length).toBe(file.poolOrder.length);
  });

  it('draws answers from the shipped species', () => {
    // Not every species need be answer-eligible — a large pool keeps obscure
    // birds guessable without ever making one the puzzle — but every entry in
    // the order must point at a real species.
    expect(file.poolOrder.length).toBeGreaterThan(100);
    expect(file.poolOrder.length).toBeLessThanOrEqual(file.species.length);
    for (const index of file.poolOrder) {
      expect(file.species[index]).toBeDefined();
    }
  });

  it('resolves a real bird for a year of dates', () => {
    const start = Date.parse(`${file.launchDate}T00:00:00Z`);
    for (let day = 0; day < 365; day++) {
      const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
      expect(targetForDate(file, date).name, date).toBeTruthy();
    }
  });
});
