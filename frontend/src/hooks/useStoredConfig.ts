import { useEffect, useState } from 'react';
import type { Config } from '../types';

const KEY = 'surveillance-config';
const DEFAULT: Config = {
  apron: { share: 0.35, maxBrightness: 60 },
  door: { axis: 'y', pos: 0.5, flip: false },
  counter: null,
};

function load(): Config {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved) return DEFAULT;
    return {
      apron: { ...DEFAULT.apron, ...saved.apron },
      door: { ...DEFAULT.door, ...saved.door },
      counter: saved.counter ?? null,
    };
  } catch {
    return DEFAULT;
  }
}

/** All settings, remembered across reloads in this browser. */
export function useStoredConfig() {
  const [config, setConfig] = useState<Config>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(config));
    } catch {
      // Storage can be unavailable (private window); the settings still work for this visit.
    }
  }, [config]);

  return [config, setConfig] as const;
}
