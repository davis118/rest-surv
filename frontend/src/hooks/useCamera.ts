import { useEffect, useState } from 'react';
import type { FrameSize } from '../types';

const CONSTRAINTS = { width: { ideal: 1280 }, height: { ideal: 720 } };

/**
 * Opens the webcam, plays it in the <video> given to `videoRef` and lists the
 * available cameras. The browser paints that element at the camera's own rate.
 */
export function useCamera() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frameSize, setFrameSize] = useState<FrameSize | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: MediaStream | null = null;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser blocks the camera here. Open the page on localhost or over HTTPS.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { ...CONSTRAINTS, deviceId: { exact: deviceId } } : CONSTRAINTS,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        opened = stream;
        setStream(stream);
        // Camera names are only available once permission has been granted.
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(all.filter((d) => d.kind === 'videoinput'));
        setDeviceId((current) => current || stream.getVideoTracks()[0]?.getSettings().deviceId || '');
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
    }

    start();
    return () => {
      cancelled = true;
      opened?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  useEffect(() => {
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [video, stream]);

  // The camera decides its own resolution, and may change it when switched.
  useEffect(() => {
    if (!video) return;
    const measure = () => {
      if (video.videoWidth) setFrameSize({ w: video.videoWidth, h: video.videoHeight });
    };
    video.addEventListener('loadedmetadata', measure);
    video.addEventListener('resize', measure);
    return () => {
      video.removeEventListener('loadedmetadata', measure);
      video.removeEventListener('resize', measure);
    };
  }, [video]);

  return { video, videoRef: setVideo, frameSize, devices, deviceId, selectDevice: setDeviceId, error };
}
