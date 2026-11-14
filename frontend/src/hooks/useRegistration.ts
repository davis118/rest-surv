import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, listEmployees, registerEmployee, removeEmployee, type Employee } from '../lib/employees';
import { facesIn } from '../lib/faces';
import { takeSnapshot } from '../lib/snapshot';
import type { Box, Scene } from '../types';

/** The face chosen for registration. Held in memory only. */
export interface Selection {
  /** The camera frame at the moment of selection, as a JPEG. */
  image: Blob;
  /** The chosen face, as shares of that frame. */
  box: Box;
  /** Object URL of a small crop around the face. */
  thumbUrl: string;
}

export interface Notice {
  tone: 'ok' | 'bad';
  text: string;
}

export interface Roster {
  status: 'loading' | 'ready' | 'unavailable';
  employees: Employee[];
}

export interface EmployeeDetails {
  name: string;
  role: string;
  notes: string;
}

interface Options {
  video: HTMLVideoElement | null;
  scene: Scene | null;
  /** Whether the overlay is in pick mode; owned by the caller, which also arbitrates other pointer modes. */
  picking: boolean;
  onPickingChange: (picking: boolean) => void;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Registering an employee by face: choosing a face from the live scene, the snapshot
 * taken at that moment, sending it with the details, and the list of who is registered.
 */
export function useRegistration({ video, scene, picking, onPickingChange }: Options) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [roster, setRoster] = useState<Roster>({ status: 'loading', employees: [] });
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const latestPick = useRef(0);

  // The thumbnail's object URL lives exactly as long as its selection.
  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.thumbUrl);
  }, [selection]);

  // A snapshot still being encoded when the page goes away is dropped.
  useEffect(() => {
    const picks = latestPick;
    return () => {
      picks.current++;
    };
  }, []);

  /** One request per call; a failure is shown as "unavailable" until the user retries. */
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const employees = await listEmployees(signal);
      setRoster({ status: 'ready', employees });
    } catch {
      if (!signal?.aborted) setRoster({ status: 'unavailable', employees: [] });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Selects a face (shares of the frame) and snapshots the video as it is right now. */
  async function select(face: Box) {
    onPickingChange(false);
    if (!video?.videoWidth) {
      setPickNote('The camera is not ready yet.');
      return;
    }
    const pick = ++latestPick.current;
    setPickNote(null);
    setNotice(null);
    try {
      const { image, thumb } = await takeSnapshot(video, face);
      if (pick !== latestPick.current) return;
      setSelection({ image, box: face, thumbUrl: URL.createObjectURL(thumb) });
    } catch (err) {
      if (pick === latestPick.current) setPickNote(messageOf(err));
    }
  }

  /** The "Pick face" action: selects the only visible face, or lets the user click one of several. */
  function pick() {
    if (picking) {
      onPickingChange(false);
      return;
    }
    const faces = facesIn(scene);
    if (faces.length === 0) {
      setPickNote('No face visible right now. Face the camera and try again.');
    } else if (faces.length === 1) {
      void select(faces[0].box);
    } else {
      setPickNote(null);
      onPickingChange(true);
    }
  }

  /** Sends the selected face with the details. Resolves true once the employee is registered. */
  async function submit(details: EmployeeDetails): Promise<boolean> {
    if (!selection || sending) return false;
    setSending(true);
    setNotice(null);
    try {
      const employee = await registerEmployee({ image: selection.image, box: selection.box, ...details });
      setSelection(null);
      setNotice({ tone: 'ok', text: `Registered ${employee.name}.` });
      void load();
      return true;
    } catch (err) {
      setNotice({ tone: 'bad', text: messageOf(err) });
      return false;
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    setRemoveError(null);
    try {
      await removeEmployee(id);
    } catch (err) {
      // 404: already gone, so the fresh list below is the whole answer.
      if (!(err instanceof ApiError && err.status === 404)) setRemoveError(messageOf(err));
    }
    await load();
    setRemoving(null);
  }

  return {
    picking,
    selection,
    pickNote,
    notice,
    sending,
    roster,
    removing,
    removeError,
    pick,
    select,
    submit,
    remove,
    retry: () => {
      setRoster({ status: 'loading', employees: [] });
      void load();
    },
  };
}

export type Registration = ReturnType<typeof useRegistration>;
