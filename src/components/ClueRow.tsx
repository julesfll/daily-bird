import { compassToDegrees } from '../game/clues';
import { SIZE_LABELS, type GuessResult, type SizeBucket, type Species } from '../game/types';

interface Props {
  result: GuessResult;
  species: Species;
  showColor: boolean;
  sizeRanges: Record<SizeBucket, string>;
}

type Tone = 'hit' | 'miss' | 'hint';

interface ChipProps {
  label: string;
  value: string;
  tone: Tone;
  /**
   * Symbol shown before the value so the state reads without colour. Omitted
   * where the value already carries its own symbol, such as the compass arrow.
   */
  mark?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}

function Chip({ label, value, tone, mark, title, children }: ChipProps) {
  const className =
    tone === 'hit' ? 'chip is-hit' : tone === 'hint' ? 'chip is-hint' : 'chip';
  return (
    <div className={className} title={title}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">
        {mark && (
          <span className="chip-mark" aria-hidden="true">
            {mark}
          </span>
        )}
        {children ?? value}
      </span>
    </div>
  );
}

/** A plain match/no-match clue. */
function matchChip(label: string, value: string, matched: boolean) {
  return (
    <Chip
      label={label}
      value={value}
      tone={matched ? 'hit' : 'miss'}
      mark={matched ? '✓' : '✗'}
      title={
        matched
          ? `${label} matches: ${value}`
          : `${label} is not ${value}`
      }
    />
  );
}

export function ClueRow({ result, species, showColor, sizeRanges }: Props) {
  const { region, size } = result;

  const regionChip = region.match ? (
    <Chip
      label="Region"
      value={region.continent}
      tone="hit"
      mark="✓"
      title={`Right region: ${region.continent}`}
    />
  ) : region.wideRange ? (
    <Chip
      label="Region"
      value="Worldwide"
      tone="hint"
      mark="🌍"
      title="Today's bird ranges across so much of the world that a direction would not narrow it down"
    />
  ) : (
    <Chip
      label="Region"
      value={region.compass}
      tone="hint"
      mark={
        <span
          className="arrow"
          style={{ transform: `rotate(${compassToDegrees(region.compass)}deg)` }}
        >
          ⬆
        </span>
      }
      title={`Wrong region — today's bird lives to the ${region.compass} of ${species.continent}`}
    />
  );

  const sizeCorrect = size.result === 'correct';

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
        {showColor && matchChip('Colour', species.color, result.color.match)}
        <Chip
          label="Size"
          value={SIZE_LABELS[size.value]}
          tone={sizeCorrect ? 'hit' : 'hint'}
          mark={sizeCorrect ? '✓' : size.result === 'bigger' ? '▲' : '▼'}
          title={
            sizeCorrect
              ? `Right size: ${SIZE_LABELS[size.value]} (${sizeRanges[size.value]})`
              : `Today's bird is ${size.result} than ${SIZE_LABELS[size.value]} (${
                  sizeRanges[size.value]
                })`
          }
        />
        {matchChip('Habitat', species.habitat, result.habitat.match)}
        {regionChip}
        {matchChip('Family', species.family, result.family.match)}
      </div>
    </div>
  );
}
