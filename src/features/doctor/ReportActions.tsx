import type { RefObject } from 'react';
import { notify } from '../../components/confirm';
import { CAN_PRINT } from '../../app/env';
import { copyText, saveFile, standaloneHtml } from '../../platform/save';

/** Drucken / als Datei speichern / als Text kopieren – für jeden Bericht. */
export function ReportActions({ title, filename, sheet, text }: { title: string; filename: string; sheet: RefObject<HTMLElement | null>; text: () => string }) {
  const saveHtml = async () => {
    if (!sheet.current) return;
    const outcome = await saveFile(`${filename}.html`, standaloneHtml(title, sheet.current), 'text/html;charset=utf-8');
    if (outcome === 'saved') {
      await notify('Gespeichert. Öffne die Datei auf dem Handy oder Computer und drucke sie von dort (Teilen → Drucken bzw. als PDF sichern).');
    } else if (outcome === 'unavailable') {
      await notify('Speichern ist hier nicht möglich. Nutze „Als Text kopieren“ oder öffne die App im Browser.');
    }
  };
  const copy = async () => {
    const t = text();
    if (await copyText(t)) await notify('Kopiert. Du kannst den Text jetzt z. B. in eine Nachricht, Notiz oder in den Chat mit Claude einfügen.');
    else await notify('Die Zwischenablage ist hier gesperrt. Markiere den Text und kopiere ihn selbst:', t);
  };
  return (
    <div className="report-actions">
      {CAN_PRINT && <button className="btn primary" onClick={() => window.print()}>🖨 Drucken / PDF</button>}
      <button className={`btn ${CAN_PRINT ? '' : 'primary'}`} onClick={saveHtml}>⤓ Als Datei speichern</button>
      <button className="btn" onClick={copy}>⧉ Als Text kopieren</button>
    </div>
  );
}
