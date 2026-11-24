import { useState } from 'react';
import { dayKey, parseDayKey } from '../core/dates';
import { EXPERIMENT_CATEGORIES, EXPERIMENT_IDEAS, VERDICTS, experimentDay, experimentEffect } from '../core/experiments';
import { fmtLevel } from '../core/fieldTypes';
import { uid } from '../core/id';
import type { Experiment, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { askConfirm } from './confirm';

const fmtDate = (k: string) => parseDayKey(k).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
const round = (n: number) => fmtLevel(Math.round(n * 10) / 10);

/**
 * Ausprobieren: eine Liste von Dingen, die du testen willst, gerade testest oder schon
 * getestet hast. Während und nach einem Versuch vergleicht die App deine Beschwerden mit
 * den zwei Wochen davor.
 */
export function ExperimentsPage() {
  const { data, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const list = data.experiments ?? [];
  const tracker = data.trackers.find((t) => t.quick && !t.demo && !t.archived) ?? data.trackers.find((t) => t.quick);
  const today = dayKey(new Date());
  const save = (x: Experiment) => dispatch({ type: 'experiment/save', experiment: x });
  const add = (t: string, cat: string | undefined, start: boolean) => {
    const clean = t.trim();
    if (!clean) return;
    save({ id: uid(), title: clean, category: cat, status: start ? 'running' : 'idea', startedAt: start ? today : undefined, createdAt: new Date().toISOString() });
    setTitle('');
    setCategory(undefined);
  };
  const running = list.filter((x) => x.status === 'running');
  const ideas = list.filter((x) => x.status === 'idea');
  const done = list.filter((x) => x.status === 'done').sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  const have = new Set(list.map((x) => x.title.toLocaleLowerCase('de-DE')));

  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <h1>Ausprobieren</h1>
          <p className="hero-lead">Finde heraus, ob dir etwas wirklich hilft – z. B. laktosefrei essen oder das Handy früher weglegen.</p>
        </div>
      </section>

      <section className="card">
        <h2>So funktioniert’s</h2>
        <ol className="try-howto">
          <li>Schreib auf, was du testen willst – oder tipp eine Idee an.</li>
          <li>Tipp auf <b>Starten</b>, wenn du damit anfängst, und trag wie gewohnt ein, wie es dir geht.</li>
          <li>Die App vergleicht deine Beschwerden der 2 Wochen davor mit der Zeit seit dem Start.</li>
          <li>Nach 1–2 Wochen <b>Beenden</b> und festhalten, ob es geholfen hat. Am besten immer nur eine Sache gleichzeitig.</li>
        </ol>
      </section>

      <section className="card exp-add">
        <label htmlFor="exp-title" className="exp-add-label">Was möchtest du ausprobieren?</label>
        <input
          id="exp-title"
          value={title}
          placeholder="z. B. Laktosefreie Milch, früher schlafen gehen …"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add(title, category, false)}
        />
        <div className="chips">
          {EXPERIMENT_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip small ${category === c ? 'active' : ''}`} onClick={() => setCategory(category === c ? undefined : c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="actions start">
          <button className="btn" disabled={!title.trim()} onClick={() => add(title, category, false)}>Auf die Liste</button>
          <button className="btn primary" disabled={!title.trim()} onClick={() => add(title, category, true)}>Ab heute ausprobieren</button>
        </div>
        {EXPERIMENT_IDEAS.some((i) => !have.has(i.title.toLocaleLowerCase('de-DE'))) && (
          <div className="exp-ideas">
            <small className="muted">Ideen zum Antippen:</small>
            <div className="chips suggest">
              {EXPERIMENT_IDEAS.filter((i) => !have.has(i.title.toLocaleLowerCase('de-DE'))).map((i) => (
                <button key={i.title} type="button" className="chip small" onClick={() => add(i.title, i.category, false)}>
                  ＋ {i.title}
                </button>
              ))}
            </div>
            <small className="muted">Medikamente und Nahrungsergänzung besser vorher mit deiner Ärztin bzw. deinem Arzt besprechen.</small>
          </div>
        )}
      </section>

      <section className="exp-section">
        <h2>Läuft gerade</h2>
        {running.length ? (
          running.map((x) => <ExperimentCard key={x.id} x={x} tracker={tracker} />)
        ) : (
          <p className="muted small">Nichts läuft gerade. Starte etwas von deiner Liste – am besten immer nur eine Sache gleichzeitig, dann ist der Vergleich eindeutig.</p>
        )}
      </section>

      <section className="exp-section">
        <h2>Möchte ich ausprobieren</h2>
        {ideas.length ? (
          <ul className="exp-list">
            {ideas.map((x) => (
              <li key={x.id}>
                <span className="exp-title">
                  {x.title}
                  {x.category && <small className="muted"> · {x.category}</small>}
                </span>
                <span className="inline">
                  <button className="btn small primary" onClick={() => save({ ...x, status: 'running', startedAt: today, endedAt: undefined })}>Starten</button>
                  <button
                    className="btn small ghost danger icon-btn"
                    aria-label={`„${x.title}“ entfernen`}
                    onClick={async () => (await askConfirm(`„${x.title}“ von der Liste nehmen?`, { okLabel: 'Entfernen' })) && dispatch({ type: 'experiment/delete', id: x.id })}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Noch nichts auf der Liste.</p>
        )}
      </section>

      <section className="exp-section">
        <h2>Schon ausprobiert</h2>
        {done.length ? done.map((x) => <ExperimentCard key={x.id} x={x} tracker={tracker} />) : <p className="muted small">Noch nichts abgeschlossen.</p>}
      </section>
    </div>
  );
}

function ExperimentCard({ x, tracker }: { x: Experiment; tracker?: Tracker }) {
  const { data, dispatch } = useStore();
  const [ending, setEnding] = useState(false);
  const now = new Date();
  const day = experimentDay(x, now);
  const effects = tracker ? experimentEffect(x, tracker, data.entries, now).slice(0, 4) : [];
  const save = (patch: Partial<Experiment>) => dispatch({ type: 'experiment/save', experiment: { ...x, ...patch } });
  return (
    <article className={`card exp-card ${x.status}`}>
      <div className="exp-head">
        <div>
          <strong>{x.title}</strong>
          <small className="muted">
            {x.category ? `${x.category} · ` : ''}
            {x.startedAt ? `seit ${fmtDate(x.startedAt)}` : ''}
            {x.endedAt ? ` bis ${fmtDate(x.endedAt)}` : ''}
            {day ? ` · ${x.status === 'done' ? `${day} Tage` : `Tag ${day}`}` : ''}
          </small>
        </div>
        {x.verdict && <span className={`pill ${x.verdict === 'helped' ? 'good' : x.verdict === 'no' ? 'bad-pill' : ''}`}>{VERDICTS[x.verdict]}</span>}
      </div>
      {effects.length > 0 ? (
        <ul className="exp-effects">
          {effects.map((e) => (
            <li key={e.field.id} className={e.direction}>
              <span>{e.field.label}</span>
              <b>
                Ø {round(e.before)} → {round(e.during)}
              </b>
              <small>{e.direction === 'better' ? '▼ besser' : e.direction === 'worse' ? '▲ schlechter' : '≈ gleich'}</small>
            </li>
          ))}
          <li className="exp-basis muted">Tageshöchstwerte: 2 Wochen davor vs. {x.status === 'done' ? 'Versuch' : 'seit dem Start'}</li>
        </ul>
      ) : (
        x.startedAt && <p className="muted small">Der Vergleich erscheint, sobald es je mindestens 3 Tage mit Einträgen vorher und seit dem Start gibt.</p>
      )}
      <textarea
        className="exp-note"
        rows={2}
        value={x.note ?? ''}
        placeholder="Notiz – z. B. was dir aufgefallen ist"
        aria-label={`Notiz zu ${x.title}`}
        onChange={(e) => save({ note: e.target.value || undefined })}
      />
      {x.status === 'running' &&
        (ending ? (
          <div className="exp-verdict">
            <small className="muted">Wie war es?</small>
            <div className="chips">
              {(Object.keys(VERDICTS) as (keyof typeof VERDICTS)[]).map((v) => (
                <button key={v} className="chip small" onClick={() => save({ status: 'done', endedAt: dayKey(now), verdict: v })}>
                  {VERDICTS[v]}
                </button>
              ))}
              <button className="chip small" onClick={() => setEnding(false)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="actions start">
            <button className="btn small" onClick={() => setEnding(true)}>Beenden</button>
          </div>
        ))}
      {x.status === 'done' && (
        <div className="actions start">
          <button className="btn small ghost" onClick={() => save({ status: 'running', startedAt: dayKey(now), endedAt: undefined, verdict: undefined })}>
            Nochmal ausprobieren
          </button>
          <button
            className="btn small ghost danger"
            onClick={async () => (await askConfirm(`„${x.title}“ löschen?`, { okLabel: 'Löschen' })) && dispatch({ type: 'experiment/delete', id: x.id })}
          >
            Löschen
          </button>
        </div>
      )}
    </article>
  );
}
