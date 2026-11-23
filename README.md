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

## Jetzt-Seite, Arztbericht und Cloud-Speicher

- **Jetzt** (`#/now`): Schnell-Check-in über den Tag – Ereignisse antippen (gegessen, Medikament, aufgestanden …)
  und Befinden auf 0 / 0,5 / 1 / 2 / 3. Neben jedem Wert steht der letzte Wert mit „▼ besser / ▲ schlechter“.
  Gespeichert werden nur ausgefüllte Felder; „aufgestanden“ setzt die Aufstehzeit des Tages. Der Check-in ist ein
  normaler Tracker (Vorlage „Befinden jetzt“) und im Baukasten frei änderbar.
- **Arztbericht** (`#/arzt`): alle gewählten Tracker eines Zeitraums – Übersicht je Beschwerde (Tage mit
  Beschwerden, Ø Tageshöchstwert, Höchstwert, Vergleich mit dem Zeitraum davor), Auffälligkeiten, Tagestabellen im
  Papier-Stil, Gesundheitsdaten. Drucken, als HTML-Datei speichern oder als Text kopieren.
- **Cloud-Speicher** (nur in claude.ai): Einträge werden zusätzlich im privaten Speicher der Seite gesichert
  (`diary/meta` + `entries/<Kalenderwoche>`), nur für die Eigentümerin/den Eigentümer lesbar. Erstes Öffnen lädt die
  lokalen Daten hoch, danach gleichen sich alle Geräte ab. Claude kann die Daten auf Wunsch auslesen.

## Ein Tracker für alles: „Mein Befinden“

Die Vorlage „Mein Befinden“ bündelt, was vorher getrennt war (Check-in, Bauchschmerztagebuch, Kälteempfinden) in
Abschnitten: Ereignisse & Essen · Bauch & Verdauung · Allgemein · Kälte · Notiz. Abschnitte sind ein normales
Feld-Attribut (`group`) und im Baukasten frei vergebbar; auf der Jetzt-Seite lassen sie sich auf- und zuklappen.
„Tracker zusammenführen“ (im Tracker unten oder als Hinweis auf der Jetzt-Seite) legt gleiche Felder zusammen,
vereinigt Optionen und Skalenstufen, hängt den Rest als Abschnitt an und verschiebt alle Einträge.

Design: ein heller Look (kein Dunkelmodus) mit kräftigem Blau, Serifen-Titeln (Playfair Display) und Montserrat;
die Schriften sind lokal eingebunden (keine Anfrage an Google).

## Erzählen statt tippen

Auf der Jetzt-Seite (`#/now/talk` direkt) frei erzählen – gesprochen oder getippt. In claude.ai wandelt Claude den
Text über den Baustein `sample` in Vorschläge für Einträge um (mit aufgelösten Zeitangaben wie „danach“, „vor 2
Stunden“); `core/narrative.ts` prüft jede Antwort streng gegen die Tracker-Felder (nur bekannte Felder, nur erlaubte
Werte, keine Zukunft) und zeigt alles zur Kontrolle, bevor gespeichert wird. Nicht Zuordenbares landet in der Notiz,
auf Wunsch zusätzlich der Originaltext. Ohne Claude: „Als Notiz speichern“.

Sprache: Baustein `dictation` (Chrome/Desktop), in der installierten App die Browser-Spracherkennung, auf dem iPhone
das Mikrofon der Tastatur. Essen wird als Liste erfasst („3 Eier, 3 Scheiben Toast, Hummus“) und für Auswertungen
ohne Mengen gezählt. Bestehende Check-ins können neue Vorlagen-Felder per Hinweis übernehmen.

## Baukasten-Werkzeuge

- **Felder ziehen** (⠿, mit Finger oder Maus; Pfeiltasten auf dem Griff), ebenso Auswahloptionen.
- **Ausblenden statt löschen**: Feld verschwindet aus dem Formular, die Daten bleiben (Tabelle, Bericht, Statistik).
- **Duplizieren**, **Feld-Bibliothek** („Fertige Felder“ aus allen Vorlagen) und **Live-Vorschau** des Formulars.
- **Freie Skalenstufen**: Wert + Bezeichnung je Stufe, „Zwischenstufe einfügen“ (z. B. 0,5 = sehr leicht),
  Schnellvorlagen (0–3, 0–3 mit „sehr leicht“, 1–5, 0–10).
- **Optionen umbenennen**: bestehende Einträge werden beim Speichern automatisch mit umbenannt.

## Apple Health & „seit dem Aufstehen“

Eine Web-App kann Apple Health nicht direkt lesen. Die Brücke ist ein **iPhone-Kurzbefehl**, der Aufwachzeit
(Ende der letzten Schlafanalyse), Schlafdauer, Schritte und Ruhepuls aus Health liest und als Text kopiert, z. B.
`BYOT-HEALTH {"date":"2026-11-23","wake":"06:42","sleep":450,"steps":4512,"ruhepuls":58}`. In den Einstellungen
einfügen – fertig (Anleitung in der App). Der Parser versteht auch Zeilenformat, Minuten, Tausenderpunkte und
ISO-Zeitstempel. In der installierten App kann der Kurzbefehl stattdessen `#/health?data=…` öffnen.

Ohne Health: „Ich bin aufgestanden“ auf der Übersicht. Genutzt wird die Aufstehzeit für
- den Baustein **Zeitraum**: Knopf „seit dem Aufstehen“ bzw. automatische Vorbelegung (Option im Baukasten),
- **„Wann tritt es auf?“** relativ zum Aufstehen (z. B. „meist 3–4 h nach dem Aufstehen“),
- **Vergleich und Erkenntnisse**: Health-Werte erscheinen als eigener Tracker „Gesundheitsdaten“.

Echtes, automatisches Lesen aus HealthKit erfordert eine native Hülle (z. B. Capacitor + HealthKit-Plugin).

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
