import type { LogEvent } from '../types';

/** Every door crossing as one line, newest first, scrolling inside the box. */
export function EventLog({ events }: { events: LogEvent[] }) {
  return (
    <section className="box log">
      <div className="box-head">
        <span>Event log</span>
        <span>{events.length ? 'Newest first' : 'Nothing yet'}</span>
      </div>
      {events.length ? (
        <ol aria-label="Events, newest first" tabIndex={0}>
          {events.map(({ id, text }) => (
            <li key={id}>{text}</li>
          ))}
        </ol>
      ) : (
        <p className="quiet">No crossings yet. A line appears each time a customer crosses the door line.</p>
      )}
    </section>
  );
}
