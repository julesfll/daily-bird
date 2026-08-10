import { compassToDegrees } from '../game/clues';
import { SIZE_LABELS, type GuessResult, type SizeBucket, type Species } from '../game/types';

interface Props {
  result: GuessResult;
  species: Species;
  showColor: boolean;
  sizeRanges: Record<SizeBucket, string>;
}

interface ChipProps {
  label: string;
  value: string;
  tone: 'hit' | 'miss' | 'hint';
  title?: string;
  children?: React.ReactNode;
}

function Chip({ label, value, tone, title, children }: ChipProps) {
  const className = tone === 'hit' ? 'chip is-hit' : tone === 'hint' ? 'chip is-hint' : 'chip';
  return (
    <div className={className} title={title ?? `${label}: ${value}`}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">
        {children ?? value}
      </span>
    </div>
  );
}

export function ClueRow({ result, species, showColor, sizeRanges }: Props) {
  const { region, size } = result;

  const regionChip = region.match ? (
    <Chip label="Region" value={region.continent} tone="hit" />
  ) : region.wideRange ? (
    <Chip
      label="Region"
      value="Wide"
      tone="hint"
      title="The target ranges across so much of the world that a direction would not help"
    />
  ) : (
    <Chip
      label="Region"
      value={region.compass}
      tone="hint"
      title={`The target's range lies to the ${region.compass}`}
    >
      <span
        className="arrow"
        style={{ transform: `rotate(${compassToDegrees(region.compass)}deg)` }}
        aria-hidden="true"
      >
        ⬆
      </span>{' '}
      {region.compass}
    </Chip>
  );

  return (
    <div className={result.correct ? 'clue-row is-correct' : 'clue-row'}>
      <div className="clue-name">
        <span>
          {result.correct && '🎉 '}
          {species.name}
        </span>
        <span className="sci">{species.sci}</span>
      </div>
      <div className="chips" style={{ ['--chip-count' as string]: showColor ? 5 : 4 }}>
        {showColor && (
          <Chip
            label="Colour"
            value={species.color}
            tone={result.color.match ? 'hit' : 'miss'}
          />
        )}
        <Chip
          label="Size"
          value={SIZE_LABELS[size.value]}
          tone={size.result === 'correct' ? 'hit' : 'hint'}
          title={`${SIZE_LABELS[size.value]} (${sizeRanges[size.value]}) — the target is ${
            size.result === 'correct' ? 'the same size' : size.result
          }`}
        >
          {size.result === 'correct'
            ? SIZE_LABELS[size.value]
            : `${SIZE_LABELS[size.value]} ${size.result === 'bigger' ? '▲' : '▼'}`}
        </Chip>
        <Chip
          label="Habitat"
          value={species.habitat}
          tone={result.habitat.match ? 'hit' : 'miss'}
        />
        {regionChip}
        <Chip label="Family" value={species.family} tone={result.family.match ? 'hit' : 'miss'} />
      </div>
    </div>
  );
}
