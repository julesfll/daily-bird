import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClueRow } from './components/ClueRow';
import { Countdown } from './components/Countdown';
import { GuessInput } from './components/GuessInput';
import { RevealCard } from './components/RevealCard';
import { StatsPanel } from './components/StatsPanel';
import { DAILY_MODE, GUESS_LIMIT } from './config';
import { puzzleNumber, randomTarget, targetForDate, todayUTC } from './game/daily';
import { giveUp, guessesRemaining, newGame, submitGuess } from './game/engine';
import { buildShareText } from './game/share';
import type { GameState, Species, SpeciesFile } from './game/types';
import { computeStats, load, recordResult, save, type Store } from './storage';

const SHARE_URL = 'https://julesfll.github.io/daily-bird/';

/**
 * History is keyed by puzzle date and its distribution assumes a guess cap, so
 * free-play rounds are deliberately not recorded — several a day would collide,
 * and an unlimited round has no bucket to land in.
 */
function finish(store: Store, state: GameState): Store {
  return DAILY_MODE ? recordResult(store, state) : store;
}

function Help() {
  return (
    <div className="help">
      <h2>How to play</h2>
      <p>
        {DAILY_MODE
          ? 'Everyone gets the same bird each day. '
          : 'Guess the mystery bird. '}
        {GUESS_LIMIT === null
          ? 'Guess as many times as you like — '
          : `You have ${GUESS_LIMIT} guesses — `}
        each one is scored against the answer on five traits.
      </p>
      <ul className="legend">
        <li>
          <span className="chip is-hit legend-chip">
            <span className="chip-mark">✓</span> match
          </span>
          the answer shares this trait with your guess
        </li>
        <li>
          <span className="chip is-hint legend-chip">
            <span className="chip-mark">▲</span> ▼ → 🌍
          </span>
          not a match, but the symbol points you towards the answer
        </li>
        <li>
          <span className="chip legend-chip">
            <span className="chip-mark">✗</span> no
          </span>
          the answer does not share this trait
        </li>
      </ul>
      <ul>
        <li>
          <strong>Size</strong> — ▲ the answer is bigger than your guess, ▼ smaller.
        </li>
        <li>
          <strong>Region</strong> — an arrow points from your guess’s range towards the
          answer’s. 🌍 means the answer lives across so much of the world that a direction
          would not narrow it down.
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

  // In daily mode a stored game from an earlier day is stale. In free play the
  // stored game is always the current one — it ends only when you start another.
  const game: GameState = useMemo(() => {
    if (store.game && (!DAILY_MODE || store.game.date === date)) return store.game;
    return newGame(date, DAILY_MODE || !file ? undefined : randomTarget(file).id);
  }, [store.game, date, file]);

  const target = useMemo(() => {
    if (!file) return null;
    if (DAILY_MODE) return targetForDate(file, date);
    return game.targetId === undefined ? null : file.species[game.targetId];
  }, [file, date, game.targetId]);

  const persist = useCallback((next: Store) => {
    setStore(next);
    save(next);
  }, []);

  const onNewBird = useCallback(() => {
    if (!file) return;
    setNote('');
    setShareLabel('Share');
    persist({ ...store, game: newGame(todayUTC(), randomTarget(file).id) });
  }, [file, persist, store]);

  const onGuess = useCallback(
    (guess: Species) => {
      if (!target) return;
      const outcome = submitGuess(game, guess, target);

      if (outcome.kind === 'duplicate') {
        setNote(`You already guessed ${guess.name}.`);
        return;
      }
      if (outcome.kind === 'rejected') {
        setNote(
          DAILY_MODE
            ? 'Today’s game is over — come back after midnight UTC.'
            : 'This round is over — start a new bird.',
        );
        return;
      }

      setNote('');
      persist(finish({ ...store, game: outcome.state }, outcome.state));
    },
    [game, target, persist, store],
  );

  const onGiveUp = useCallback(() => {
    const next = giveUp(game);
    setNote('');
    persist(finish({ ...store, game: next }, next));
  }, [game, persist, store]);

  const onRollover = useCallback(() => {
    const now = todayUTC();
    setDate((current) => (current === now ? current : now));
  }, []);

  const onShare = useCallback(async () => {
    if (!file) return;
    const title = DAILY_MODE
      ? `Daily Bird #${puzzleNumber(date, file.launchDate)}`
      : 'Daily Bird (practice)';
    const text = buildShareText(game, file, title, SHARE_URL);
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
  const remaining = guessesRemaining(game);
  const used = game.guesses.length;

  const counter =
    remaining === null
      ? used === 0
        ? 'Unlimited guesses'
        : `${used} ${used === 1 ? 'guess' : 'guesses'} so far`
      : `${remaining} ${remaining === 1 ? 'guess' : 'guesses'} left`;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Daily Bird</h1>
          <span className="puzzle-no">
            {DAILY_MODE ? `#${puzzleNumber(date, file.launchDate)} · ${date}` : 'Practice mode'}
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
          note={note || counter}
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
            {!DAILY_MODE && (
              <button className="primary" onClick={onNewBird}>
                New bird
              </button>
            )}
            <button className={DAILY_MODE ? 'primary' : ''} onClick={onShare}>
              {shareLabel}
            </button>
          </div>
          {DAILY_MODE && (
            <StatsPanel
              stats={stats}
              todayGuesses={game.status === 'won' ? game.guesses.length : null}
            />
          )}
        </>
      )}

      {!finished && game.guesses.length > 0 && (
        <div className="actions">
          <button onClick={onGiveUp}>Give up</button>
          {!DAILY_MODE && <button onClick={onNewBird}>Skip to a new bird</button>}
        </div>
      )}

      {DAILY_MODE && <Countdown onRollover={onRollover} />}

      <footer className="footer">
        <p>
          {DAILY_MODE
            ? 'A new bird every day at midnight UTC.'
            : 'Practice mode: a random bird, unlimited guesses.'}
        </p>
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
