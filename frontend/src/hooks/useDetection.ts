import { useCallback, useEffect, useRef, useState } from 'react';
import { socketUrl } from '../lib/backend';
import type { ApronRule, FrameResult, LinkStatus } from '../types';

const SEND_WIDTH = 640;
const JPEG_QUALITY = 0.75;

function configMessage(apron: ApronRule) {
  return JSON.stringify({
    type: 'config',
    apron: { share: apron.share, max_brightness: apron.maxBrightness },
  });
}

/**
 * The link to the backend: streams webcam frames out, hands detections back.
 *
 * One frame is in flight at a time: the next is sent when the result comes
 * back. The results therefore trail the live video by one round trip.
 */
export function useDetection(
  video: HTMLVideoElement | null,
  apron: ApronRule,
  onResult: (result: FrameResult) => void,
) {
  const [status, setStatus] = useState<LinkStatus>({ connected: false, fps: 0, ms: 0 });
  const socketRef = useRef<WebSocket | null>(null);
  const apronRef = useRef(apron);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Push settings to the backend whenever they change.
  const { share, maxBrightness } = apron;
  useEffect(() => {
    apronRef.current = { share, maxBrightness };
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(configMessage(apronRef.current));
  }, [share, maxBrightness]);

  useEffect(() => {
    if (!video) return;
    const source = video;
    const pending = document.createElement('canvas'); // the frame being sent
    const pendingCtx = pending.getContext('2d')!;
    let socket: WebSocket | null = null;
    let stopped = false;
    let inFlight = false;
    let framesThisSecond = 0;
    let lastMs = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function sendFrame() {
      const target = socket;
      if (inFlight || !target || target.readyState !== WebSocket.OPEN || !source.videoWidth) return;
      const scale = Math.min(1, SEND_WIDTH / source.videoWidth);
      pending.width = Math.round(source.videoWidth * scale);
      pending.height = Math.round(source.videoHeight * scale);
      pendingCtx.drawImage(source, 0, 0, pending.width, pending.height);
      inFlight = true;
      pending.toBlob(
        (blob) => {
          if (blob && target.readyState === WebSocket.OPEN) target.send(blob);
          else if (target === socket) inFlight = false;
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    }

    function connect() {
      const opened = new WebSocket(socketUrl('/ws'));
      socket = opened;
      socketRef.current = opened;
      opened.onopen = () => {
        inFlight = false;
        opened.send(configMessage(apronRef.current));
        sendFrame();
      };
      opened.onmessage = (e) => {
        const data = JSON.parse(e.data) as FrameResult | { error: string };
        inFlight = false;
        if (!('error' in data)) {
          framesThisSecond++;
          lastMs = data.ms;
          onResultRef.current(data);
        }
        sendFrame();
      };
      opened.onclose = () => {
        if (stopped || opened !== socket) return;
        inFlight = false;
        retry = setTimeout(connect, 1000);
      };
    }

    connect();
    // Starts the loop once the camera is ready, and restarts it after a hiccup.
    const kick = setInterval(sendFrame, 100);
    const stats = setInterval(() => {
      setStatus({
        connected: socket?.readyState === WebSocket.OPEN,
        fps: framesThisSecond,
        ms: lastMs,
      });
      framesThisSecond = 0;
    }, 1000);

    return () => {
      stopped = true;
      clearInterval(kick);
      clearInterval(stats);
      clearTimeout(retry);
      socket?.close();
    };
  }, [video]);

  /** Ask the backend to forget everyone, so IDs start again at 1. */
  const resetTracking = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'reset' }));
  }, []);

  return { status, resetTracking };
}
