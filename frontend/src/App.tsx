import { useState } from 'react';
import { Controls } from './components/Controls';
import { CounterTiles } from './components/CounterTiles';
import { EventLog } from './components/EventLog';
import { RegisterEmployee } from './components/RegisterEmployee';
import { VideoStage } from './components/VideoStage';
import { useCamera } from './hooks/useCamera';
import { useCounting } from './hooks/useCounting';
import { useDetection } from './hooks/useDetection';
import { useRegistration } from './hooks/useRegistration';
import { useStoredConfig } from './hooks/useStoredConfig';
import type { Box, LinkStatus, PointerMode } from './types';

function statusLine(cameraError: string | null, status: LinkStatus, tracked: number) {
  if (cameraError) return { text: `Camera error: ${cameraError}`, bad: true };
  if (!status.connected) return { text: 'Connecting to the server…', bad: true };
  if (!status.fps) return { text: 'Waiting for video…', bad: false };
  return { text: `Live · detecting ${status.fps} fps · ${status.ms} ms per frame · ${tracked} tracked`, bad: false };
}

export function App() {
  const camera = useCamera();
  const [config, setConfig] = useStoredConfig();
  // Backend: boxes, apron labels and faces. Frontend: door counting and the counters.
  const counting = useCounting(config);
  const detection = useDetection(camera.video, config.apron, counting.ingest);
  // Zone drawing and face picking share the overlay's pointer: starting one ends the other.
  const [pointerMode, setPointerMode] = useState<PointerMode>('idle');
  const registration = useRegistration({
    video: camera.video,
    scene: counting.scene,
    picking: pointerMode === 'face',
    onPickingChange: (on) => setPointerMode((mode) => (on ? 'face' : mode === 'face' ? 'idle' : mode)),
  });

  function onZoneDrawn(zone: Box | null) {
    if (zone) setConfig({ ...config, counter: zone });
    setPointerMode('idle');
  }

  function resetAll() {
    counting.reset();
    detection.resetTracking();
  }

  const line = statusLine(camera.error, detection.status, counting.scene?.people.length ?? 0);

  return (
    <main>
      <header className="strip">
        <h1>
          Surveillance<em>.ai</em>
        </h1>
        <p className={line.bad ? 'status bad' : 'status'}>{line.text}</p>
      </header>

      <VideoStage
        videoRef={camera.videoRef}
        frameSize={camera.frameSize}
        scene={counting.scene}
        config={config}
        mode={pointerMode}
        onZoneDrawn={onZoneDrawn}
        onFacePicked={registration.select}
      />
      <CounterTiles counters={counting.counters} />
      <EventLog events={counting.events} />
      <RegisterEmployee registration={registration} />
      <Controls
        devices={camera.devices}
        deviceId={camera.deviceId}
        onSelectDevice={camera.selectDevice}
        config={config}
        onConfigChange={setConfig}
        drawingZone={pointerMode === 'zone'}
        onToggleDrawing={() => setPointerMode((mode) => (mode === 'zone' ? 'idle' : 'zone'))}
        onReset={resetAll}
      />
    </main>
  );
}
