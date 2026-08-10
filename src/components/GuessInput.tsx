import { useMemo, useRef, useState } from 'react';
import type { Species } from '../game/types';

interface Props {
  species: Species[];
  /** Species already guessed today; shown but flagged so the player can tell. */
  usedIds: Set<number>;
  disabled: boolean;
  onGuess: (species: Species) => void;
  note: string;
}

const MAX_SUGGESTIONS = 8;

/** Lowercase and strip accents, so "adelie" matches "Adélie". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function GuessInput({ species, usedIds, disabled, onGuess, note }: Props) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return [];

    // Names that start with the query are what people usually mean, so they
    // rank above mid-word matches.
    const starts: Species[] = [];
    const contains: Species[] = [];
    for (const s of species) {
      const name = normalize(s.name);
      const sci = normalize(s.sci);
      if (name.startsWith(needle) || sci.startsWith(needle)) starts.push(s);
      else if (name.includes(needle) || sci.includes(needle)) contains.push(s);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query, species]);

  function choose(choice: Species) {
    onGuess(choice);
    setQuery('');
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
      setOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      setOpen(true);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const choice = suggestions[highlight];
    if (choice) choose(choice);
  }

  const showSuggestions = open && suggestions.length > 0 && !disabled;

  return (
    <form className="guess-form" onSubmit={onSubmit} role="search">
      <div className="guess-row">
        <input
          ref={inputRef}
          className="guess-input"
          type="text"
          value={query}
          disabled={disabled}
          placeholder={disabled ? 'Game over for today' : 'Name a bird…'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Guess a bird species"
          aria-expanded={showSuggestions}
          aria-controls="suggestion-list"
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on a suggestion lands before the list unmounts.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <button className="submit-button" type="submit" disabled={disabled || !suggestions.length}>
          Guess
        </button>
      </div>

      {showSuggestions && (
        <ul className="suggestions" id="suggestion-list" role="listbox">
          {suggestions.map((s, index) => (
            <li
              key={s.id}
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
            >
              <span>
                {s.name}
                {usedIds.has(s.id) && ' ✓'}
              </span>
              <span className="sci">{s.sci}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="form-note" role="status">
        {note}
      </p>
    </form>
  );
}
