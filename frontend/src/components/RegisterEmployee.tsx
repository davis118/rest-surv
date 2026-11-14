import { useState, type FormEvent } from 'react';
import type { EmployeeDetails, Registration } from '../hooks/useRegistration';

const BLANK: EmployeeDetails = { name: '', role: '', notes: '' };

/** The register box: pick a face from the stream, name it, and see who is already registered. */
export function RegisterEmployee({ registration }: { registration: Registration }) {
  const { picking, selection, pickNote, notice, sending, roster, removing, removeError } = registration;
  const [details, setDetails] = useState(BLANK);
  const name = details.name.trim();
  const set = (change: Partial<EmployeeDetails>) => setDetails({ ...details, ...change });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const done = await registration.submit({ name, role: details.role.trim(), notes: details.notes.trim() });
    if (done) setDetails(BLANK);
  }

  const hint = picking
    ? 'Click one of the outlined faces on the video.'
    : selection
      ? 'This face will be registered.'
      : 'Have the person face the camera, then pick.';

  return (
    <section className="box register">
      <div className="box-head">
        <span>Register employee</span>
        <span>Snapshot kept in memory until sent</span>
      </div>
      <div className="groups">
        <fieldset>
          <legend>1 · Face</legend>
          <div className="face">
            {selection ? (
              <img className="thumb" src={selection.thumbUrl} alt="The selected face" />
            ) : (
              <div className="thumb empty" aria-hidden="true">
                ?
              </div>
            )}
            <div className="column">
              <button type="button" className={picking ? 'active' : ''} aria-pressed={picking} onClick={registration.pick}>
                {picking ? 'Cancel picking' : selection ? 'Pick again' : 'Pick face'}
              </button>
              <p className={pickNote ? 'note bad' : 'note'} role="status">
                {pickNote ?? hint}
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>2 · Details</legend>
          <form className="column" onSubmit={onSubmit}>
            <label className="field">
              <span>Name</span>
              <input type="text" required maxLength={80} value={details.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>Role (optional)</span>
              <input type="text" maxLength={80} value={details.role} onChange={(e) => set({ role: e.target.value })} />
            </label>
            <label className="field">
              <span>Notes (optional)</span>
              <textarea rows={2} maxLength={500} value={details.notes} onChange={(e) => set({ notes: e.target.value })} />
            </label>
            <button type="submit" className="primary" disabled={!selection || !name || sending}>
              {sending ? 'Registering…' : 'Register'}
            </button>
            <p className={notice ? `note ${notice.tone}` : 'note'} role="status">
              {notice?.text ?? (selection ? (name ? 'Ready to register.' : 'Enter a name.') : 'Pick a face first.')}
            </p>
          </form>
        </fieldset>

        <fieldset className="roster">
          <legend>Registered{roster.status === 'ready' ? ` (${roster.employees.length})` : ''}</legend>
          {roster.status === 'loading' && <p className="note">Loading…</p>}
          {roster.status === 'unavailable' && (
            <div className="unavailable">
              <p className="note">List unavailable: the employee service is not answering.</p>
              <button type="button" onClick={registration.retry}>
                Retry
              </button>
            </div>
          )}
          {roster.status === 'ready' && roster.employees.length === 0 && <p className="note">Nobody registered yet.</p>}
          {roster.employees.length > 0 && (
            <ul>
              {roster.employees.map(({ id, name, role }) => (
                <li key={id}>
                  <span className="who">
                    <b title={name}>{name}</b>
                    {role && <small title={role}>{role}</small>}
                  </span>
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Remove ${name}`}
                    disabled={removing !== null}
                    onClick={() => registration.remove(id)}
                  >
                    {removing === id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {removeError && (
            <p className="note bad" role="status">
              {removeError}
            </p>
          )}
        </fieldset>
      </div>
    </section>
  );
}
