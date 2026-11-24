import { useEffect, useRef, useState } from 'react';

/**
 * Eigene Bestätigungsabfrage statt window.confirm() – funktioniert auch in
 * eingebetteten Umgebungen, in denen Systemdialoge blockiert sind.
 */
interface Request {
  message: string;
  okLabel: string;
  danger: boolean;
  /** Nur Hinweis mit OK, ohne Abbrechen. */
  info?: boolean;
  /** Optionaler Text zum Markieren/Kopieren (Fallback, wenn die Zwischenablage gesperrt ist). */
  text?: string;
  resolve: (ok: boolean) => void;
}

let open: ((r: Request) => void) | null = null;

/** Hinweis mit OK-Knopf; optional mit markierbarem Text. */
export function notify(message: string, text?: string): Promise<void> {
  return new Promise((resolve) => {
    const req: Request = { message, okLabel: 'OK', danger: false, info: true, text, resolve: () => resolve() };
    if (open) open(req);
    else resolve();
  });
}

export function askConfirm(message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const req = { message, okLabel: opts.okLabel ?? 'Bestätigen', danger: opts.danger ?? true, resolve };
    if (open) open(req);
    else resolve(false);
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    open = setReq;
    return () => {
      open = null;
    };
  }, []);
  useEffect(() => {
    if (!req) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };
  return (
    <div className="dialog-backdrop" onClick={() => close(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-msg" onClick={(e) => e.stopPropagation()}>
        <p id="confirm-msg">{req.message}</p>
        {req.text !== undefined && (
          <textarea className="dialog-text" readOnly value={req.text} rows={10} onFocus={(e) => e.currentTarget.select()} aria-label="Text zum Kopieren" />
        )}
        <div className="actions">
          {!req.info && <button className="btn ghost" onClick={() => close(false)}>Abbrechen</button>}
          <button ref={okRef} className={`btn ${req.danger ? 'danger-solid' : 'primary'}`} onClick={() => close(true)}>
            {req.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
