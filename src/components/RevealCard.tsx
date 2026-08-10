import { useEffect, useState } from 'react';
import { SIZE_LABELS, type SizeBucket, type Species } from '../game/types';

interface Props {
  species: Species;
  won: boolean;
  guessCount: number;
  sizeRanges: Record<SizeBucket, string>;
}

interface Photo {
  src: string;
  pageUrl: string;
}

/**
 * Photos come from Wikipedia at reveal time rather than being baked into the
 * dataset: image URLs rot, and fetching on demand keeps the shipped file small.
 * A failure here is silent — the card simply renders without a picture.
 */
function useWikipediaPhoto(title: string): Photo | null {
  const [photo, setPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhoto(null);

    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title.replace(/ /g, '_'),
    )}`;

    fetch(endpoint)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const src = data.thumbnail?.source ?? data.originalimage?.source;
        if (!src) return;
        setPhoto({
          src,
          pageUrl: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
        });
      })
      .catch(() => {
        /* offline or blocked; the card works without the photo */
      });

    return () => {
      cancelled = true;
    };
  }, [title]);

  return photo;
}

function massLabel(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(grams >= 10000 ? 0 : 1)} kg` : `${grams} g`;
}

export function RevealCard({ species, won, guessCount, sizeRanges }: Props) {
  const photo = useWikipediaPhoto(species.wiki);

  return (
    <section className="reveal" aria-live="polite">
      <div className={won ? 'reveal-banner' : 'reveal-banner is-loss'}>
        {won
          ? `Got it in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}`
          : "Out of guesses — today's bird was"}
      </div>

      {photo && (
        <img className="reveal-photo" src={photo.src} alt={species.name} loading="lazy" />
      )}

      <div className="reveal-body">
        <h2>{species.name}</h2>
        <p className="sci">{species.sci}</p>
        <p className="reveal-fact">{species.reveal.fact}</p>

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

      {photo && (
        <p className="photo-credit">
          Photo and article from{' '}
          <a href={photo.pageUrl} target="_blank" rel="noreferrer noopener">
            Wikipedia
          </a>
          , CC BY-SA.
        </p>
      )}
    </section>
  );
}
