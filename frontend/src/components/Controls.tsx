import type { ApronRule, Config, DoorLine } from '../types';

interface Props {
  devices: MediaDeviceInfo[];
  deviceId: string;
  onSelectDevice: (id: string) => void;
  config: Config;
  onConfigChange: (config: Config) => void;
  drawingZone: boolean;
  onToggleDrawing: () => void;
  onReset: () => void;
}

const AXES: { axis: DoorLine['axis']; label: string }[] = [
  { axis: 'y', label: 'Horizontal' },
  { axis: 'x', label: 'Vertical' },
];

/** The config box: camera picker and reset, apron rule, and the door line with the counter zone. */
export function Controls({
  devices,
  deviceId,
  onSelectDevice,
  config,
  onConfigChange,
  drawingZone,
  onToggleDrawing,
  onReset,
}: Props) {
  const setDoor = (change: Partial<DoorLine>) => onConfigChange({ ...config, door: { ...config.door, ...change } });
  const setApron = (change: Partial<ApronRule>) => onConfigChange({ ...config, apron: { ...config.apron, ...change } });
  const sharePercent = Math.round(config.apron.share * 100);
  const doorPercent = Math.round(config.door.pos * 100);

  return (
    <section className="box config">
      <div className="box-head">
        <span>Config</span>
        <span>Saved in this browser</span>
      </div>
      <div className="groups">
        <fieldset>
          <legend>Camera</legend>
          <select aria-label="Camera" value={deviceId} onChange={(e) => onSelectDevice(e.target.value)}>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
          <button className="danger" onClick={onReset}>
            Reset counts
          </button>
        </fieldset>

        <fieldset>
          <legend>In black if torso is…</legend>
          <label className="slider">
            <span>At least this black</span>
            <output>{sharePercent}%</output>
            <input
              type="range"
              min={5}
              max={95}
              value={sharePercent}
              onChange={(e) => setApron({ share: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="slider">
            <span>Black = brightness up to</span>
            <output>{config.apron.maxBrightness}</output>
            <input
              type="range"
              min={10}
              max={150}
              value={config.apron.maxBrightness}
              onChange={(e) => setApron({ maxBrightness: Number(e.target.value) })}
            />
          </label>
        </fieldset>

        <fieldset className="split">
          <legend>Door line &amp; counter zone</legend>
          <div className="column">
            <div className="segments" role="group" aria-label="Door line direction">
              {AXES.map(({ axis, label }) => (
                <button
                  key={axis}
                  className={config.door.axis === axis ? 'active' : ''}
                  aria-pressed={config.door.axis === axis}
                  onClick={() => setDoor({ axis })}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="slider">
              <span>Line position</span>
              <output>{doorPercent}%</output>
              <input
                type="range"
                min={0}
                max={100}
                value={doorPercent}
                onChange={(e) => setDoor({ pos: Number(e.target.value) / 100 })}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={config.door.flip} onChange={(e) => setDoor({ flip: e.target.checked })} />
              Flip inside
            </label>
          </div>
          <div className="column">
            <button className={drawingZone ? 'active' : ''} aria-pressed={drawingZone} onClick={onToggleDrawing}>
              {drawingZone ? 'Drag on the video…' : 'Draw zone'}
            </button>
            <button disabled={!config.counter} onClick={() => onConfigChange({ ...config, counter: null })}>
              Clear zone
            </button>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
