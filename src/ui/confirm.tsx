import { useEffect, useRef, useState } from 'react';

/**
 * Eigene Bestätigungsabfrage statt window.confirm() – funktioniert auch in
 * eingebetteten Umgebungen, in denen Systemdialoge blockiert sind.
 */
interface Request {
  message: string;
  okLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

let open: ((r: Request) => void) | null = null;

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
        <div className="actions">
          <button className="btn ghost" onClick={() => close(false)}>Abbrechen</button>
          <button ref={okRef} className={`btn ${req.danger ? 'danger-solid' : 'primary'}`} onClick={() => close(true)}>
            {req.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
