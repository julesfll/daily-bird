import { useEffect, useState } from 'react';
import { msUntilRollover } from '../game/daily';

interface Props {
  /** Fired at midnight UTC so the page rolls to the new bird without a reload. */
  onRollover: () => void;
}

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export function Countdown({ onRollover }: Props) {
  const [remaining, setRemaining] = useState(() => msUntilRollover());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = msUntilRollover();
      setRemaining(next);
      if (next >= 86_400_000 - 1500) onRollover();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onRollover]);

  return <p className="countdown">Next bird in {format(remaining)}</p>;
}
