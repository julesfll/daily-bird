import { SIZE_LABELS, type SizeBucket, type Species } from '../game/types';
import { useWikipediaSummary } from '../useWikipediaSummary';

interface Props {
  species: Species;
  won: boolean;
  guessCount: number;
  sizeRanges: Record<SizeBucket, string>;
}

function massLabel(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(grams >= 10000 ? 0 : 1)} kg` : `${grams} g`;
}

export function RevealCard({ species, won, guessCount, sizeRanges }: Props) {
  const summary = useWikipediaSummary(species.wiki);
  // Hand-written trivia where it exists, Wikipedia's opening line otherwise.
  const blurb = species.reveal.fact || summary?.extract;

  return (
    <section className="reveal" aria-live="polite">
      <div className={won ? 'reveal-banner' : 'reveal-banner is-loss'}>
        {won
          ? `Got it in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}`
          : "Out of guesses — today's bird was"}
      </div>

      {summary?.src && (
        <img className="reveal-photo" src={summary.src} alt={species.name} loading="lazy" />
      )}

      <div className="reveal-body">
        <h2>{species.name}</h2>
        <p className="sci">{species.sci}</p>
        {blurb && <p className="reveal-fact">{blurb}</p>}

        <dl className="facts">
          <div>
            <dt>Family</dt>
            <dd>{species.family}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {SIZE_LABELS[species.size]} · {massLabel(species.mass)}
            </dd>
          </div>
          <div>
            <dt>Habitat</dt>
            <dd>{species.habitat}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{species.continent}</dd>
          </div>
          <div>
            <dt>Diet</dt>
            <dd>{species.reveal.diet}</dd>
          </div>
          <div>
            <dt>Movement</dt>
            <dd>{species.reveal.migration}</dd>
          </div>
          <div>
            <dt>Conservation</dt>
            <dd>{species.reveal.status}</dd>
          </div>
          <div>
            <dt>Typical mass</dt>
            <dd>{sizeRanges[species.size]}</dd>
          </div>
        </dl>
      </div>

      {(summary?.src || blurb) && summary && (
        <p className="photo-credit">
          Photo and article from{' '}
          <a href={summary.pageUrl} target="_blank" rel="noreferrer noopener">
            Wikipedia
          </a>
          , CC BY-SA.
        </p>
      )}
    </section>
  );
}
