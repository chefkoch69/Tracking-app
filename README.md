# Build Your Own Tracker

Ein persönliches Datensystem: Nutzer:innen bekommen keinen fertigen Tracker vorgesetzt, sondern **bauen sich ihren eigenen** –
aus denselben universellen Bausteinen. Ein Liegestütz-Zähler, ein Symptomtagebuch und ein Morgen-Check-in unterscheiden sich nur
durch ihre Konfiguration, nicht durch ihren Code.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests der Kernlogik
npm run build    # Produktions-Build nach dist/ (statisch hostbar, PWA)
```

## Produktlogik

**Baukasten in 5 Schritten:** Was? → Welche Daten? → Wann? → Auswertung → Starten.
Starten mit leerem Baukasten oder einer Vorlage (Bauchschmerztagebuch, Liegestütze, Morgen-Check-in, Ernährung, Fitness, Schlaf, Kälteempfinden, Lesen).

| Baustein | Beispiel | Auswertung |
|---|---|---|
| Zahlenfeld | Anzahl Liegestütze | Diagramm, Summen, Rekorde |
| Messwert mit Einheit | Raumtemperatur °C | Diagramm, Durchschnitt, Vergleich |
| Bewertungsskala | Übelkeit 0–3 | Verlauf, Durchschnitt, Vergleich |
| Textfeld | Lebensmittel | Häufigkeiten (einzeilig) |
| Auswahlfeld / Mehrfachauswahl | Mahlzeit, Symptome | Häufigkeiten |
| Checkbox | Heute gelesen? | Quote, Summe |
| Datum/Uhrzeit | Eingeschlafen um | Verlauf |
| Zeitraum (von–bis) | Dauer der Beschwerden | Dauer in Minuten: Summe, Ø, Vergleich |
| Körperkarte / Lokalisation | Bauchschema 1–6, Ganzkörper | Häufigkeit als eingefärbte Körperkarte |

Bewertungen haben eine **Polarität** („höher ist besser/schlechter/neutral“). Daraus ergeben sich Ampelfarben
in Eingabe und Verlauf sowie die Richtung „besser/schlechter“ in den Erkenntnissen.

**Zeitplan:** manuell, feste Uhrzeiten, Intervalle (mit Zeitfenster), Wochentage, Wiederholung nach X Minuten falls unerledigt,
Schlummern (+15 Min) und Überspringen.

**Ansichten (pro Tracker wählbar):** Verlauf · Diagramm (Einzelwerte/Tag/Woche/Monat) · Kalender-Heatmap mit Erfüllungsquote ·
Statistiken (Summe, Ø, Min/Max, Rekorde, Serien, Trend, Wochen/Monate, Häufigkeiten) · Tagesübersicht ·
Vergleich zweier beliebiger Messgrößen (auch trackerübergreifend, mit Zeitversatz, Pearson-Korrelation) ·
**Bericht**: druckbare Tabelle wie ein Papiertagebuch (Felder als Zeilen, Einträge als Spalten, Legenden, Lokalisationsschema) –
als PDF speicherbar für Ärztin/Arzt.

**„Was hilft wirklich?“** – automatische Erkenntnisse auf dem Dashboard: Trends (letzte 14 Tage vs. davor),
Einflussfaktoren (z. B. „nach der Mahlzeit → Bauchschmerz schlechter“, „Buscopan → Dauer kürzer“) und
Zusammenhänge zwischen Messgrößen, auch über Tracker hinweg und mit Folgetag-Versatz.

**Daten:** Seite „Daten“ mit allen Einträgen aller Tracker als Tabelle (Suche, Zeitraum, Sortieren nach jeder Spalte,
CSV-Export der gefilterten Daten) und Tab „Tabelle“ in jedem Tracker.

### Ideen aus Open-Source-Projekten (eigene Umsetzung, kein übernommener Code)

| Idee | Vorbild | Umsetzung hier |
|---|---|---|
| Regelmäßigkeits-/Stärke-Score | Loop Habit Tracker, Table Habit (mhabit) | exponentiell geglätteter Erfüllungsgrad (Halbwertszeit 14 Tage), Ring auf jeder Karte, Verlauf in der Statistik |
| Zeit-Histogramm, Ø Abstand | Track & Graph | „Wann tritt es auf?“ nach Uhrzeit/Wochentag, optional gewichtet (z. B. nach Schmerzstärke) |
| Im Kalender nachtragen | Table Habit (mhabit) | Tag im Erfüllungskalender antippen → „Eintrag für diesen Tag“ |
| Gruppen | Table Habit (mhabit) | Dashboard gruppiert Tracker nach Kategorie |

## Vorschau als claude.ai-Artifact

`npm run build:artifact` erzeugt `dist-artifact/tracker.html` – die ganze App als eine Seite. Dort sind Drucken,
Downloads und Systembenachrichtigungen blockiert; die App blendet diese Funktionen dann aus und startet mit
gekennzeichneten Beispieldaten.

## Architektur

```
src/core/          reine, getestete Logik – kein UI
  types.ts         Datenmodell: Tracker = Felder + Zeitplan + Ansichten; Entry = Zeitstempel + Werte je Feld-ID
  fieldTypes.ts    Feldtyp-Registry: Validierung, Formatierung, numeric/categorical, Standard-Aggregation
  schedule.ts      Erinnerungs-Engine: Slots, Erledigt-Fenster, Wiederholungen, Schlummern
  analytics.ts     generische Auswertungen (Serien, Buckets, Statistiken, Häufigkeiten, Korrelation)
  insights.ts      automatische Erkenntnisse (Trends, Einflussfaktoren, Zusammenhänge)
  bodyMaps.ts      Lokalisationsschemata (Regionen als Daten)
  templates.ts     Vorlagen – nur vorausgefüllte Konfiguration
  storage.ts       Persistenz-Adapter (localStorage), Import/Export JSON & CSV
src/ui/
  fieldInputs.tsx  UI-Hälfte der Registry: Eingabe + Konfigurationseditor je Feldtyp
  TrackerBuilder   5-Schritte-Assistent
  EntryForm        generisches Eingabeformular
  views/           die sechs Auswertungsansichten
```

**Einen neuen Baustein hinzufügen:** Typ in `types.ts` ergänzen, Eintrag in `FIELD_TYPES` und `FIELD_UI` anlegen.
TypeScript erzwingt über `Record<FieldType, …>`, dass beides vorhanden ist. Alle Ansichten funktionieren dann automatisch.

## Bekannte Grenzen

- Daten liegen lokal im Browser (localStorage). Backup per JSON-Export; Sync/Konten sind noch nicht umgesetzt.
- Erinnerungen werden ausgelöst, solange die App (oder ein Tab) geöffnet ist. Zuverlässige Push-Erinnerungen bei
  geschlossener App benötigen Web Push mit Server oder eine native Hülle (z. B. Capacitor).
