import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClueRow } from './components/ClueRow';
import { Countdown } from './components/Countdown';
import { GuessInput } from './components/GuessInput';
import { RevealCard } from './components/RevealCard';
import { StatsPanel } from './components/StatsPanel';
import { MAX_GUESSES } from './game/clues';
import { puzzleNumber, targetForDate, todayUTC } from './game/daily';
import { giveUp, newGame, submitGuess } from './game/engine';
import { buildShareText } from './game/share';
import type { GameState, Species, SpeciesFile } from './game/types';
import { computeStats, load, recordResult, save, type Store } from './storage';

const SHARE_URL = 'https://julesfll.github.io/daily-bird/';

function Help() {
  return (
    <div className="help">
      <h2>How to play</h2>
      <p>
        Everyone gets the same bird each day. You have {MAX_GUESSES} guesses; each one is scored
        against today’s bird on five traits.
      </p>
      <ul>
        <li>
          <strong>Colour, Habitat, Family</strong> — green when they match.
        </li>
        <li>
          <strong>Size</strong> — ▲ means today’s bird is bigger than your guess, ▼ smaller.
        </li>
        <li>
          <strong>Region</strong> — green on the right continent, otherwise an arrow pointing the
          way. Birds found across much of the world show <em>Wide</em> instead, because a direction
          would be meaningless.
        </li>
      </ul>
    </div>
  );
}

export function App() {
  const [file, setFile] = useState<SpeciesFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [store, setStore] = useState<Store>(() => load());
  const [date, setDate] = useState(() => todayUTC());
  const [note, setNote] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [shareLabel, setShareLabel] = useState('Share');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/species.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setFile)
      .catch(() => setFailed(true));
  }, []);

  const target = useMemo(
    () => (file ? targetForDate(file, date) : null),
    [file, date],
  );

  // A stored game from an earlier day is stale: start the new one instead.
  const game: GameState =
    store.game && store.game.date === date ? store.game : newGame(date);

  const persist = useCallback((next: Store) => {
    setStore(next);
    save(next);
  }, []);

  const onGuess = useCallback(
    (guess: Species) => {
      if (!target) return;
      const outcome = submitGuess(game, guess, target);

      if (outcome.kind === 'duplicate') {
        setNote(`You already guessed ${guess.name}.`);
        return;
      }
      if (outcome.kind === 'rejected') {
        setNote('Today’s game is over — come back after midnight UTC.');
        return;
      }

      setNote('');
      persist(recordResult({ ...store, game: outcome.state }, outcome.state));
    },
    [game, target, persist, store],
  );

  const onGiveUp = useCallback(() => {
    const next = giveUp(game);
    setNote('');
    persist(recordResult({ ...store, game: next }, next));
  }, [game, persist, store]);

  const onRollover = useCallback(() => {
    const now = todayUTC();
    setDate((current) => (current === now ? current : now));
  }, []);

  const onShare = useCallback(async () => {
    if (!file) return;
    const text = buildShareText(game, file, puzzleNumber(date, file.launchDate), SHARE_URL);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareLabel('Copied!');
    } catch {
      setShareLabel('Copy failed');
    }
    window.setTimeout(() => setShareLabel('Share'), 2000);
  }, [file, game, date]);

  if (failed) {
    return (
      <div className="app">
        <p className="error">
          Could not load today’s bird. Check your connection and refresh.
        </p>
      </div>
    );
  }

  if (!file || !target) {
    return (
      <div className="app">
        <p className="loading">Loading today’s bird…</p>
      </div>
    );
  }

  const finished = game.status !== 'in_progress';
  const stats = computeStats(store, date);
  const usedIds = new Set(game.guesses.map((g) => g.speciesId));
  const remaining = MAX_GUESSES - game.guesses.length;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Daily Bird</h1>
          <span className="puzzle-no">
            #{puzzleNumber(date, file.launchDate)} · {date}
          </span>
        </div>
        <button
          className="icon-button"
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
          aria-label="How to play"
        >
          ?
        </button>
      </header>

      {showHelp && <Help />}

      {!finished && (
        <GuessInput
          species={file.species}
          usedIds={usedIds}
          disabled={finished}
          onGuess={onGuess}
          note={note || `${remaining} ${remaining === 1 ? 'guess' : 'guesses'} left`}
        />
      )}

      <div className="guess-list">
        {game.guesses.map((result) => (
          <ClueRow
            key={result.speciesId}
            result={result}
            species={file.species[result.speciesId]}
            showColor={file.clues.color}
            sizeRanges={file.sizeRanges}
          />
        ))}
      </div>

      {finished && (
        <>
          <RevealCard
            species={target}
            won={game.status === 'won'}
            guessCount={game.guesses.length}
            sizeRanges={file.sizeRanges}
          />
          <div className="actions">
            <button className="primary" onClick={onShare}>
              {shareLabel}
            </button>
          </div>
          <StatsPanel
            stats={stats}
            todayGuesses={game.status === 'won' ? game.guesses.length : null}
          />
        </>
      )}

      {!finished && game.guesses.length > 0 && (
        <div className="actions">
          <button onClick={onGiveUp}>Give up</button>
        </div>
      )}

      <Countdown onRollover={onRollover} />

      <footer className="footer">
        <p>A new bird every day at midnight UTC.</p>
        <p>
          Bird photos and articles from{' '}
          <a href="https://en.wikipedia.org" target="_blank" rel="noreferrer noopener">
            Wikipedia
          </a>
          . Trait framework after{' '}
          <a href="https://doi.org/10.6084/m9.figshare.16586228" target="_blank" rel="noreferrer noopener">
            AVONET
          </a>{' '}
          (Tobias et al. 2022, CC BY 4.0).
        </p>
        <p>
          <a href="https://github.com/julesfll/daily-bird" target="_blank" rel="noreferrer noopener">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
