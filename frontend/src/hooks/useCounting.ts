import { useCallback, useEffect, useRef, useState } from 'react';
import { DoorCounter } from '../lib/counting';
import type { Config, Counters, FrameResult, LogEvent, Scene } from '../types';

const ZERO: Counters = { inStore: 0, cameIn: 0, left: 0, employees: 0 };
const MAX_EVENTS = 200; // older log lines are dropped

/** Keeps the counters and the event log (newest first) up to date as detections arrive. */
export function useCounting(config: Config) {
  const [counter] = useState(() => new DoorCounter());
  const [scene, setScene] = useState<Scene | null>(null);
  const [counters, setCounters] = useState<Counters>(ZERO);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const nextEventId = useRef(1);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const { axis, pos, flip } = config.door;
  useEffect(() => {
    counter.forgetSides();
  }, [counter, axis, pos, flip]);

  /** Feed in one frame's detections from the backend. */
  const ingest = useCallback(
    (result: FrameResult) => {
      const update = counter.ingest(result, configRef.current);
      setScene(update.scene);
      setCounters(update.counters);
      if (!update.events.length) return;
      for (const event of update.events) console.log(event);
      const fresh = update.events.map((text): LogEvent => ({ id: nextEventId.current++, text })).reverse();
      setEvents((old) => [...fresh, ...old].slice(0, MAX_EVENTS));
    },
    [counter],
  );

  const reset = useCallback(() => {
    counter.reset();
    // The two live numbers stay; the next frame refreshes them anyway.
    setCounters((now) => ({ ...now, cameIn: 0, left: 0 }));
    setEvents([]);
  }, [counter]);

  return { scene, counters, events, ingest, reset };
}
