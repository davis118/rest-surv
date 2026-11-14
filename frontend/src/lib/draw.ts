import type { Box, Config, Point, Scene, Status } from '../types';
import { facesIn } from './faces';

// Kept in step with the tile colours in styles.css.
const INK = '#111111';
const COLORS = {
  customer: '#2fe08a',
  employee: '#ff7ad9',
  counter: '#f4efe2',
  door: '#ff5a36',
  zone: '#5b8cff',
  pick: '#ffd60a',
} as const;

const TAG_HEIGHT = 22;
const TAG_PAD = 6;
const EDGE = 8; // gap between a label and the thing it names
const TITLES: Record<Status, string> = { customer: 'CUSTOMER', employee: 'EMPLOYEE', counter: 'AT COUNTER' };
const NAME_MAX = 14; // longer employee names are cut short in the box label

export interface Overlay {
  /** Size of the canvas on the page, in CSS pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  pixelRatio: number;
  /** Latest detections, in the pixel space of the frame that was sent. */
  scene: Scene | null;
  config: Config;
  /** A counter zone being dragged out, shown instead of the saved one. */
  draftZone: Box | null;
  /** While true, every visible face is spotlit so one can be clicked. */
  pickingFace: boolean;
}

/**
 * Paints the counter zone, door line, measured torsos, labelled boxes and (in pick mode) the
 * selectable faces on a transparent canvas that sits exactly over the live video.
 */
export function drawOverlay(canvas: HTMLCanvasElement, overlay: Overlay) {
  const { width, height, pixelRatio, scene, config, draftZone, pickingFace } = overlay;
  if (!width || !height) return;
  // Backing store in device pixels so lines and text stay sharp; resizing also clears it.
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.font = '700 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';

  drawZone(ctx, draftZone ?? config.counter, width, height);
  drawDoor(ctx, config, width, height);
  if (!scene) return;
  const scaleX = width / scene.w;
  const scaleY = height / scene.h;
  for (const { id, status, black, box, torso, employee } of scene.people) {
    if (torso)
      drawTorso(
        ctx,
        status,
        torso.map(([x, y]): Point => [x * scaleX, y * scaleY]),
      );
    const name = employee ? ` · ${clip(employee.name.trim().toUpperCase(), NAME_MAX)}` : '';
    const text = `${TITLES[status]} #${id}${name} · ${Math.round(black * 100)}% black`;
    drawPerson(ctx, status, text, [box[0] * scaleX, box[1] * scaleY, box[2] * scaleX, box[3] * scaleY], width);
  }
  if (pickingFace) {
    const faces = facesIn(scene).map(({ id, box }) => ({
      id,
      box: [box[0] * width, box[1] * height, box[2] * width, box[3] * height] as Box,
    }));
    drawFacePicker(ctx, faces, width, height);
  }
}

/** Cuts text to at most `max` characters, ending in an ellipsis when shortened. */
function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tagWidth(ctx: CanvasRenderingContext2D, text: string) {
  return ctx.measureText(text).width + TAG_PAD * 2;
}

/** A solid label block with its top-left corner at x, y. */
function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  const width = tagWidth(ctx, text);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, TAG_HEIGHT);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x, y, width, TAG_HEIGHT);
  ctx.fillStyle = INK;
  ctx.fillText(text, x + TAG_PAD, y + TAG_HEIGHT / 2 + 1);
}

/** Strokes the current path in colour over a wider black one, so it reads on any picture. */
function strokeOutlined(ctx: CanvasRenderingContext2D, color: string, lineWidth: number) {
  ctx.lineWidth = lineWidth + 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawZone(ctx: CanvasRenderingContext2D, zone: Box | null, w: number, h: number) {
  if (!zone) return;
  const [x1, y1, x2, y2] = [zone[0] * w, zone[1] * h, zone[2] * w, zone[3] * h];
  ctx.fillStyle = 'rgba(91, 140, 255, 0.22)';
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  ctx.beginPath();
  ctx.rect(x1, y1, x2 - x1, y2 - y1);
  ctx.setLineDash([10, 6]);
  strokeOutlined(ctx, COLORS.zone, 3);
  ctx.setLineDash([]);
  drawTag(ctx, 'COUNTER', x1, y1, COLORS.zone);
}

/** The line, with a label on the side that counts as inside. */
function drawDoor(ctx: CanvasRenderingContext2D, { door }: Config, w: number, h: number) {
  const { axis, pos, flip } = door;
  ctx.beginPath();
  if (axis === 'y') {
    ctx.moveTo(0, pos * h);
    ctx.lineTo(w, pos * h);
    strokeOutlined(ctx, COLORS.door, 4);
    const y = flip ? pos * h - EDGE - TAG_HEIGHT : pos * h + EDGE;
    drawTag(ctx, flip ? '▲ INSIDE' : '▼ INSIDE', EDGE, clamp(y, 0, h - TAG_HEIGHT), COLORS.door);
  } else {
    ctx.moveTo(pos * w, 0);
    ctx.lineTo(pos * w, h);
    strokeOutlined(ctx, COLORS.door, 4);
    const text = flip ? '◀ INSIDE' : 'INSIDE ▶';
    const x = flip ? pos * w - EDGE - tagWidth(ctx, text) : pos * w + EDGE;
    drawTag(ctx, text, clamp(x, 0, w - tagWidth(ctx, text)), EDGE, COLORS.door);
  }
}

/** The measured torso (already in canvas coordinates): a faint fill and thin dashed outline, secondary to the box. */
function drawTorso(ctx: CanvasRenderingContext2D, status: Status, points: Point[]) {
  if (points.length < 3) return;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = COLORS[status];
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.setLineDash([6, 4]);
  strokeOutlined(ctx, COLORS[status], 1.5);
  ctx.setLineDash([]);
}

/** One person's box (already in canvas coordinates) with its label above, or inside at the top edge. */
function drawPerson(ctx: CanvasRenderingContext2D, status: Status, text: string, box: Box, viewWidth: number) {
  const [x1, y1, x2, y2] = box;
  ctx.beginPath();
  ctx.rect(x1, y1, x2 - x1, y2 - y1);
  strokeOutlined(ctx, COLORS[status], 3);
  const x = clamp(x1 - 3, 0, Math.max(0, viewWidth - tagWidth(ctx, text)));
  drawTag(ctx, text, x, y1 >= TAG_HEIGHT + 3 ? y1 - TAG_HEIGHT - 3 : y1, COLORS[status]);
}

/** Pick mode: dims the picture except the faces (already in canvas coordinates) and frames each one. */
function drawFacePicker(ctx: CanvasRenderingContext2D, faces: { id: number; box: Box }[], w: number, h: number) {
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  for (const { box } of faces) ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  ctx.fillStyle = 'rgba(17, 17, 17, 0.55)';
  ctx.fill('evenodd');
  for (const { id, box } of faces) {
    const [x1, y1, x2, y2] = box;
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    strokeOutlined(ctx, COLORS.pick, 4);
    const text = `PICK #${id}`;
    const x = clamp(x1 - 3, 0, Math.max(0, w - tagWidth(ctx, text)));
    drawTag(ctx, text, x, y2 + TAG_HEIGHT + 4 <= h ? y2 + 4 : y2 - TAG_HEIGHT, COLORS.pick);
  }
}
