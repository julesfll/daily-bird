import { useWikipediaSummary } from '../useWikipediaSummary';
import type { Species } from '../game/types';

interface Props {
  target: Species;
  used: boolean;
  onUse: () => void;
}

/**
 * Shows the day's bird before the game ends.
 *
 * Deliberately a one-way door: for a toucan or a flamingo the photo simply is
 * the answer, so it asks before spending itself and stays visible afterwards.
 * The article is only fetched once the player has asked for it, so declining
 * the hint costs no request.
 */
export function PhotoHint({ target, used, onUse }: Props) {
  const summary = useWikipediaSummary(used ? target.wiki : null);

  if (!used) {
    return (
      <div className="hint">
        <button className="hint-button" onClick={onUse}>
          🔍 Show me a photo
        </button>
        <p className="hint-note">This will probably give it away.</p>
      </div>
    );
  }

  return (
    <div className="hint is-used">
      {summary?.src ? (
        <img className="hint-photo" src={summary.src} alt="Today's bird" loading="lazy" />
      ) : (
        <p className="hint-note">
          {summary ? 'No photo available for this one.' : 'Loading photo…'}
        </p>
      )}
      <p className="hint-note">Hint used — your shared result will say so.</p>
    </div>
  );
}
