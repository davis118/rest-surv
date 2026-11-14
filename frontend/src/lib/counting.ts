import type { Box, Config, Counters, Detection, DoorLine, FrameResult, Person, Scene, Status } from '../types';

const LINE_MARGIN = 0.02; // dead band around the door line, as a share of the frame
const FORGET_AFTER_MS = 60_000; // unseen for this long: drop what we knew about them

type Side = 'inside' | 'outside';

/** Which side of the door line a point is on, or null while it is within the dead band. */
function sideOf(door: DoorLine, x: number, y: number): Side | null {
  const offset = (door.axis === 'x' ? x : y) - door.pos;
  if (Math.abs(offset) < LINE_MARGIN) return null;
  return offset > 0 !== door.flip ? 'inside' : 'outside';
}

/** Whether a box and the counter zone (both as shares of the frame) overlap at all. */
function overlaps(zone: Box, [x1, y1, x2, y2]: Box) {
  return x1 < zone[2] && x2 > zone[0] && y1 < zone[3] && y2 > zone[1];
}

/**
 * Who someone is. A recognised face is always an employee. Otherwise an employee wears
 * black and, once a counter zone is drawn, is also at the counter; anyone else at the
 * counter is neither staff nor a customer.
 */
function statusOf(p: Detection, zone: Box | null, w: number, h: number): Status {
  if (p.employee) return 'employee';
  const inBlack = p.label === 'employee';
  if (!zone) return inBlack ? 'employee' : 'customer';
  const atCounter = overlaps(zone, [p.box[0] / w, p.box[1] / h, p.box[2] / w, p.box[3] / h]);
  if (!atCounter) return 'customer';
  return inBlack ? 'employee' : 'counter';
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/**
 * Turns per-frame detections into the four counters and the event log.
 *
 * "In store" and "employees" are who is visible right now. A crossing is counted once a
 * customer has been seen on both sides of the door line; nobody else's crossings count.
 */
export class DoorCounter {
  private cameIn = 0;
  private left = 0;
  private sides = new Map<number, Side>();
  private lastSeen = new Map<number, number>();

  ingest(result: FrameResult, config: Config): { scene: Scene; counters: Counters; events: string[] } {
    const { w, h } = result;
    const now = Date.now();

    const people: Person[] = result.people.map((p) => ({ ...p, status: statusOf(p, config.counter, w, h) }));
    const employees = people.filter((p) => p.status === 'employee').length;
    const inStore = people.filter((p) => p.status === 'customer').length;

    const events: string[] = [];
    for (const p of people) {
      this.lastSeen.set(p.id, now);
      const side = sideOf(config.door, (p.box[0] + p.box[2]) / 2 / w, (p.box[1] + p.box[3]) / 2 / h);
      if (!side) continue;
      const previous = this.sides.get(p.id);
      this.sides.set(p.id, side);
      if (!previous || previous === side || p.status !== 'customer') continue;
      if (side === 'inside') this.cameIn++;
      else this.left++;
      const action = side === 'inside' ? 'came in' : 'left   ';
      events.push(
        `[${timestamp()}] CUSTOMER #${p.id} ${action} | In store: ${inStore} | ` +
          `Came in: ${this.cameIn} | Left: ${this.left} | Employees: ${employees}`,
      );
    }

    for (const [id, seen] of this.lastSeen) {
      if (now - seen > FORGET_AFTER_MS) {
        this.lastSeen.delete(id);
        this.sides.delete(id);
      }
    }

    return { scene: { w, h, people }, counters: { inStore, cameIn: this.cameIn, left: this.left, employees }, events };
  }

  /** Call when the door line moves: old sides were measured against the old line. */
  forgetSides() {
    this.sides.clear();
  }

  reset() {
    this.cameIn = 0;
    this.left = 0;
    this.sides.clear();
    this.lastSeen.clear();
  }
}
