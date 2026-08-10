import type { Stats } from '../storage';

interface Props {
  stats: Stats;
  /** Highlights today's bar. Null when today was a loss or is unfinished. */
  todayGuesses: number | null;
}

export function StatsPanel({ stats, todayGuesses }: Props) {
  const peak = Math.max(1, ...stats.distribution);

  return (
    <section className="stats">
      <h3>Your statistics</h3>

      <div className="stat-grid">
        <div>
          <div className="value">{stats.played}</div>
          <div className="label">Played</div>
        </div>
        <div>
          <div className="value">{stats.winRate}%</div>
          <div className="label">Win rate</div>
        </div>
        <div>
          <div className="value">{stats.currentStreak}</div>
          <div className="label">Streak</div>
        </div>
        <div>
          <div className="value">{stats.maxStreak}</div>
          <div className="label">Best</div>
        </div>
      </div>

      <h3>Guess distribution</h3>
      {stats.distribution.map((count, index) => (
        <div className="dist-row" key={index}>
          <span>{index + 1}</span>
          <div
            className={todayGuesses === index + 1 ? 'dist-bar is-today' : 'dist-bar'}
            style={{ width: `${Math.max(8, (count / peak) * 100)}%` }}
          >
            {count}
          </div>
        </div>
      ))}
      {stats.played === 0 && (
        <p className="label" style={{ marginTop: '0.5rem' }}>
          Finish today’s bird to start your streak.
        </p>
      )}
    </section>
  );
}
