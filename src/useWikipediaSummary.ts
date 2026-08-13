import { useEffect, useState } from 'react';

export interface Summary {
  src?: string;
  pageUrl: string;
  extract?: string;
}

/**
 * The photo and the blurb both come from Wikipedia on demand rather than being
 * baked into the dataset: image URLs rot, fetching keeps the shipped file
 * small, and at 1,200 species there is no hand-written trivia to ship anyway.
 * A failure here is silent — callers render without them.
 */
export function useWikipediaSummary(title: string | null): Summary | null {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    setSummary(null);
    if (!title) return;

    let cancelled = false;
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title.replace(/ /g, '_'),
    )}`;

    const fallback = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

    fetch(endpoint)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setSummary({
          src: data?.thumbnail?.source ?? data?.originalimage?.source,
          pageUrl: data?.content_urls?.desktop?.page ?? fallback,
          extract: data?.extract,
        });
      })
      .catch(() => {
        // Settle even on failure. Leaving this null would strand a caller
        // showing "loading" forever with no way to tell the difference.
        if (!cancelled) setSummary({ pageUrl: fallback });
      });

    return () => {
      cancelled = true;
    };
  }, [title]);

  return summary;
}
