import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useElementSize } from '../hooks/useElementSize';
import { drawOverlay } from '../lib/draw';
import { faceAt, facesIn } from '../lib/faces';
import type { Box, Config, FrameSize, PointerMode, Scene } from '../types';

interface Props {
  /** Receives the <video> that plays the camera. */
  videoRef: (video: HTMLVideoElement | null) => void;
  /** The camera's resolution, once known: it sets the shape of the stage. */
  frameSize: FrameSize | null;
  scene: Scene | null;
  config: Config;
  /** 'zone': dragging on the video draws the counter zone. 'face': clicking a face picks it. */
  mode: PointerMode;
  onZoneDrawn: (zone: Box | null) => void;
  /** Called with the clicked face, as shares of the frame. */
  onFacePicked: (face: Box) => void;
}

const HEAD: Record<Exclude<PointerMode, 'idle'>, string> = {
  zone: 'Drag to draw the counter zone',
  face: 'Click a face to pick it',
};

const MIN_ZONE = 0.02; // smaller drags are treated as a stray click

function normalise([ax, ay, bx, by]: Box): Box {
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/**
 * The live camera, with boxes, door line and counter zone on a transparent
 * canvas over it. Both fill one box that has the camera's aspect ratio, so
 * the overlay lines up with the picture at any size.
 */
export function VideoStage({ videoRef, frameSize, scene, config, mode, onZoneDrawn, onFacePicked }: Props) {
  const stage = useRef<HTMLElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const { width, height } = useElementSize(canvas);
  const [drag, setDrag] = useState<Box | null>(null);

  useEffect(() => {
    if (!canvas) return;
    drawOverlay(canvas, {
      width,
      height,
      pixelRatio: window.devicePixelRatio || 1,
      scene,
      config,
      draftZone: drag && normalise(drag),
      pickingFace: mode === 'face',
    });
  }, [canvas, width, height, scene, config, drag, mode]);

  // Picking needs the picture on screen; the button that starts it may be far below.
  useEffect(() => {
    if (mode === 'face') stage.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [mode]);

  function position(e: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height)];
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const [x, y] = position(e);
    if (mode === 'face') {
      const face = faceAt(facesIn(scene), x, y);
      if (face) onFacePicked(face.box);
    } else if (mode === 'zone') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag([x, y, x, y]);
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const [x, y] = position(e);
    setDrag([drag[0], drag[1], x, y]);
  }

  function onPointerUp() {
    if (!drag) return;
    const zone = normalise(drag);
    setDrag(null);
    const bigEnough = zone[2] - zone[0] > MIN_ZONE && zone[3] - zone[1] > MIN_ZONE;
    onZoneDrawn(bigEnough ? zone : null);
  }

  return (
    <section className="box stage" ref={stage}>
      <div className="box-head">
        <span>Camera</span>
        <span>
          {mode !== 'idle' ? HEAD[mode] : frameSize ? `${frameSize.w}×${frameSize.h}` : 'No signal'}
        </span>
      </div>
      <div
        className={mode === 'zone' ? 'view drawing' : mode === 'face' ? 'view picking' : 'view'}
        style={frameSize ? { aspectRatio: `${frameSize.w} / ${frameSize.h}` } : undefined}
      >
        <video ref={videoRef} muted playsInline autoPlay />
        <canvas
          ref={setCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        />
      </div>
    </section>
  );
}
