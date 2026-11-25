# Mein Befinden – Körper-Tagebuch

Ein persönliches Gesundheits-Tagebuch fürs iPhone (Web-App auf dem Home-Bildschirm):
Aufstehen und Schlaf, Essen und Trinken, Beschwerden (Bauch, Kopf, Tinnitus, Erschöpfung, Kälte),
Medikamente, Abendroutine – mit Auswertung, „Ausprobieren“-Liste und Arztbericht.

## Bedienkonzept

Vier Bereiche in der Tab-Leiste:

| Tab | Zweck |
| --- | --- |
| **Heute** | Hier wird eingetragen – direkt auf der Seite, ohne Unterseiten. Oben der passende Moment (morgens „Aufgestanden“, abends „Schlafen gehen“), dann „Wie geht’s dir gerade?“ und Knöpfe für Essen, Medikament, Erzählen. Details zu einer Beschwerde klappen auf, sobald man sie angibt. |
| **Verlauf** | Tage als Karten, Monatskalender, Tagesseite mit „Wie war der Tag?“, „Was auffällt“. |
| **Ausprobieren** | Dinge testen (z. B. laktosefrei) – Vergleich der Beschwerden vorher/währenddessen. |
| **Einstellungen** | Felder anpassen, Apple Health & Armband, Arztbericht, Daten & Sicherung. |

Unterseiten haben oben eine Leiste mit „‹ Zurück“.

**Leicht-Modus:** Oben auf „Heute“ eine einzige Frage mit fünf Gesichtern (ein Tipp speichert),
danach große Kacheln für Beschwerden (jeder Tipp = stärker) oder „Keine Beschwerden“.

**Erinnerungen:** Web Push vom Worker (Cron alle 15 Minuten, Zeiten in den Einstellungen), nur wenn seit
90 Minuten nichts eingetragen wurde; die Mitteilung kommt ohne Inhalt, den Text wählt der Service Worker.
Solange heute nichts eingetragen ist, zeigt das App-Symbol eine 1 (Badging API). Privater VAPID-Schlüssel als
Cloudflare-Secret `VAPID_PRIVATE`.

**Erzählen:** frei sprechen (Mikrofon oder Tastatur-Diktat). Der Text wird direkt in der App
ausgewertet (`core/diary/speech.ts`, ohne Server und ohne KI); die Punkte haken sich live ab.

## Projektstruktur

```
src/
  main.tsx                 Einstieg
  app/                     App-Rahmen: Seitenwahl, Tab-Leiste, Routen, Build-Ziel
  state/                   Zentraler Zustand (Store, Aktionen)
  platform/                Anbindungen: Cloud-Speicher, Server-API, Apple-Health-Eingang,
                           Erinnerungen, Diktat, Dateien
  components/              Gemeinsame UI-Bausteine: Feldeingaben, Körperkarte, Diagramme,
                           Tagesrhythmus, Bestätigungsdialog
  features/                Ein Ordner je Bereich der App
    today/                 Heute: Moment-Karten zum direkten Eintragen
    entry/                 Eintragen (alle Felder, Nachtragen), Eintrag bearbeiten, Erzählen
    history/               Verlauf: Tage, Monat, Auswertungen, Tabelle
    experiments/           Ausprobieren
    settings/              Einstellungen, Apple Health
    doctor/                Arzttermin & Bericht
    builder/               Tracker-Baukasten und Tracker-Ansichten
  core/                    Reine Logik ohne Oberfläche (getestet)
    model/                 Datentypen, Speicherformat, Datum, IDs
    fields/                Feldtypen, Vorlagen („Mein Befinden“), Vorlagen-Updates, Körperkarten
    diary/                 Momente, Fragen-Texte, Sprach-Auswertung, Health, Favoriten, Ausprobieren
    analysis/              Statistik, Erkenntnisse, Lebensmittelgruppen, Bericht
    __tests__/             Tests (vitest)
  styles/                  CSS in fester Reihenfolge (index.css bindet alles ein)
scripts/                   Build-Skripte (Cloudflare-Worker, claude.ai-Artifact)
public/                    Icons, Manifest, Service Worker
docs/                      Build für GitHub Pages (nur lokal gespeicherte Daten)
```

Regeln:
- `core/` kennt keine Oberfläche – nur Funktionen und Typen, alles mit Tests.
- `features/` dürfen `components/`, `platform/`, `state/` und `core/` nutzen, aber
  untereinander nur über klar exportierte Bausteine.
- Feldbezeichnungen sind die Schlüssel der Vorlage (z. B. „Bauchschmerz“). Die Fragen, die
  beim Eintragen erscheinen, stehen zentral in `core/diary/moments.ts` (`QUESTIONS`).

## Entwickeln

```bash
npm install
npm run dev          # lokal starten
npm test             # Tests
npm run typecheck    # TypeScript prüfen
```

## Veröffentlichen

| Ziel | Befehl | Daten |
| --- | --- | --- |
| Cloudflare Worker (Hauptversion) | `npm run deploy` | online in einer Cloudflare-D1-Datenbank (SQLite, Westeuropa), mit Passwort |
| GitHub Pages | `npm run build:pages` | nur auf dem Gerät |
| claude.ai-Artifact | `npm run build:artifact` | privater Artifact-Speicher |

Der Worker (`scripts/worker-template.js`) liefert die App aus, schützt sie mit Passwort
(PBKDF2, Sitzungs-Cookie, Sperre nach Fehlversuchen) und bietet die Daten-API
(`/api/docs`, `/api/doc`, `/api/status`) sowie den Eingang für Apple-Health-Werte (`/api/health`, mit Schlüssel).

Datenbank: Tabelle `docs` (Einstellungen/Tracker in `diary/meta`, Einträge je Kalenderwoche in
`entries/JJJJ-Www`) und `doc_versions` (die letzten 30 Fassungen je Dokument). D1 bietet zusätzlich
„Time Travel“: Wiederherstellung der ganzen Datenbank auf jeden Zeitpunkt der letzten 30 Tage.
Anmeldung, Health-Schlüssel und Health-Eingang liegen im KV-Speicher.

## Bekannte Grenzen

- Eine Web-App darf Apple Health nicht direkt lesen; ein iPhone-Kurzbefehl schickt die Werte.
- Erinnerungen der App kommen nur, solange sie geöffnet ist – zuverlässig erinnert der Kalender.
- Die Sprach-Auswertung versteht einfache Sätze; ungewöhnliche Formulierungen ggf. anders sagen.
