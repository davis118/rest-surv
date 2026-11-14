import type { Counters } from '../types';

const TILES: { key: keyof Counters; label: string }[] = [
  { key: 'inStore', label: 'Customers in store' },
  { key: 'employees', label: 'Employees on floor' },
  { key: 'cameIn', label: 'Came in' },
  { key: 'left', label: 'Left' },
];

/** The four live numbers the owner cares about. */
export function CounterTiles({ counters }: { counters: Counters }) {
  return (
    <div className="tiles">
      {TILES.map(({ key, label }) => (
        <div className={`box tile ${key}`} key={key}>
          <span>{label}</span>
          <b>{counters[key]}</b>
        </div>
      ))}
    </div>
  );
}
