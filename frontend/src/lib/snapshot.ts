import type { Box } from '../types';

const MAX_WIDTH = 1280; // the snapshot keeps the camera's own resolution up to this width
const JPEG_QUALITY = 0.92;
const THUMB_SIZE = 192;
const THUMB_MARGIN = 0.25; // extra picture around the face in the thumbnail, as a share of its size

export interface Snapshot {
  /** The whole video frame as a JPEG. */
  image: Blob;
  /** A small square JPEG around the chosen face, for showing who was picked. */
  thumb: Blob;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the snapshot.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Captures the frame the video is showing right now, plus a thumbnail of one face in it.
 * The frame is copied before anything asynchronous happens; `face` is in shares of the frame.
 */
export async function takeSnapshot(video: HTMLVideoElement, face: Box): Promise<Snapshot> {
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const frame = document.createElement('canvas');
  frame.width = Math.round(video.videoWidth * scale);
  frame.height = Math.round(video.videoHeight * scale);
  frame.getContext('2d')!.drawImage(video, 0, 0, frame.width, frame.height);

  const faceWidth = (face[2] - face[0]) * frame.width;
  const faceHeight = (face[3] - face[1]) * frame.height;
  const side = Math.max(1, Math.min(Math.max(faceWidth, faceHeight) * (1 + 2 * THUMB_MARGIN), frame.width, frame.height));
  const left = Math.min(Math.max(0, ((face[0] + face[2]) / 2) * frame.width - side / 2), frame.width - side);
  const top = Math.min(Math.max(0, ((face[1] + face[3]) / 2) * frame.height - side / 2), frame.height - side);
  const thumb = document.createElement('canvas');
  thumb.width = thumb.height = Math.min(THUMB_SIZE, Math.round(side));
  thumb.getContext('2d')!.drawImage(frame, left, top, side, side, 0, 0, thumb.width, thumb.height);

  const [image, thumbBlob] = await Promise.all([toJpeg(frame), toJpeg(thumb)]);
  return { image, thumb: thumbBlob };
}
