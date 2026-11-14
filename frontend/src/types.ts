/** x1, y1, x2, y2 */
export type Box = [number, number, number, number];

/** x, y */
export type Point = [number, number];

/** The backend's apron verdict: 'employee' means wearing black, nothing more. */
export type Role = 'customer' | 'employee';

/** What the frontend makes of someone; 'counter' is at the counter but neither staff nor a customer. */
export type Status = 'customer' | 'employee' | 'counter';

/** A picture's size in pixels. */
export interface FrameSize {
  w: number;
  h: number;
}

// ---- settings ---------------------------------------------------------------

export interface DoorLine {
  /** 'y' is a horizontal line, 'x' a vertical one. */
  axis: 'x' | 'y';
  /** Where the line sits, as a share of the frame (0 to 1). */
  pos: number;
  /** By default inside is below (y) or right of (x) the line. */
  flip: boolean;
}

/** The only settings the backend needs: how the apron check decides. */
export interface ApronRule {
  /** Share of the torso that must be black to be an employee (0 to 1). */
  share: number;
  /** Pixels at or below this brightness (0 to 255) count as black. */
  maxBrightness: number;
}

export interface Config {
  apron: ApronRule;
  door: DoorLine;
  /** Counter zone as shares of the frame, or null when none is drawn. */
  counter: Box | null;
}

// ---- what the backend sends back, per frame ---------------------------------

/** A registered employee recognised by their face. */
export interface EmployeeMatch {
  id: string;
  name: string;
  /** Similarity to the registered face (0 to 1). */
  score: number;
}

export interface Detection {
  id: number;
  /** From the apron check alone. */
  label: Role;
  /** Share of the torso that is black (0 to 1). */
  black: number;
  /** In pixels of the frame that was sent (w × h of the result). */
  box: Box;
  /**
   * Outline of the area the black share was measured on (3 or more points, same
   * pixel space as the box). Null or absent when no torso was found.
   */
  torso?: Point[] | null;
  /** This person's face, in the same pixel space as the box. Null or absent when none was found. */
  face?: Box | null;
  /** Set when the face matched a registered employee. */
  employee?: EmployeeMatch | null;
}

export interface FrameResult {
  w: number;
  h: number;
  people: Detection[];
  ms: number;
}

// ---- what the frontend works out from it -----------------------------------

export interface Counters {
  /** Customers visible in the current frame. */
  inStore: number;
  /** Door-line crossings by customers since the last reset. */
  cameIn: number;
  left: number;
  /** Employees visible in the current frame. */
  employees: number;
}

/** A detection with the frontend's verdict on who they are. */
export interface Person extends Detection {
  status: Status;
}

/** One line of the event log. */
export interface LogEvent {
  /** Unique within this page visit; newer events have higher numbers. */
  id: number;
  text: string;
}

/** One processed frame's detections, ready to draw over the live video. */
export interface Scene {
  w: number;
  h: number;
  people: Person[];
}

/** What the pointer does on the video overlay; only one of these at a time. */
export type PointerMode = 'idle' | 'zone' | 'face';

export interface LinkStatus {
  connected: boolean;
  fps: number;
  ms: number;
}
