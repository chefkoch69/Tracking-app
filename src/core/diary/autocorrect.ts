import type { Entry, FieldDef, Tracker } from '../model/types';

/**
 * Einträge automatisch ausbessern – für Essen, Trinken, Medikamente und Maßnahmen:
 * Diktier- und Tippfehler („Mod Kartoffeln“ → „mit Kartoffeln“, „Kartofeln“ → „Kartoffeln“),
 * Großschreibung der Lebensmittel („brathuhn“ → „Brathuhn“), „kaese“ → „Käse“.
 * Geändert wird nur, was sicher ist: bekannte Wörter oder ein eindeutiger, naher Treffer.
 */

const VOCAB = `
Apfel Äpfel Apfelmus Apfelsaft Apfelstrudel Aprikose Avocado Banane Bananen Birne Birnen Beeren Erdbeeren Heidelbeeren Himbeeren Kirschen Trauben Weintrauben Orange Orangen Orangensaft Mandarine Kiwi Mango Melone Ananas Zitrone Marillen Zwetschken Pflaumen Feigen Datteln Rosinen Obst Obstsalat Kompott Smoothie
Kartoffeln Kartoffel Erdäpfel Kartoffelpüree Püree Pommes Bratkartoffeln Kartoffelsalat Rösti Reis Risotto Nudeln Spaghetti Penne Lasagne Gnocchi Spätzle Knödel Semmelknödel Germknödel Couscous Bulgur Quinoa Polenta Hirse Haferflocken Porridge Müsli Granola Cornflakes
Brot Vollkornbrot Schwarzbrot Toast Semmel Semmeln Brötchen Weckerl Gebäck Baguette Croissant Kipferl Brezel Knäckebrot Zwieback Cracker Wrap Tortilla Sandwich Bagel Pizza Burger Döner Kebab Falafel Hummus
Ei Eier Spiegelei Rührei Omelett Käse Frischkäse Hüttenkäse Mozzarella Parmesan Feta Gouda Emmentaler Camembert Topfen Quark Joghurt Naturjoghurt Skyr Butter Margarine Milch Hafermilch Sojamilch Mandelmilch Sahne Schlagobers Obers Rahm Sauerrahm Kefir Pudding
Huhn Hühnchen Hähnchen Hendl Backhendl Brathuhn Brathähnchen Hühnerbrust Putenbrust Pute Truthahn Rindfleisch Rind Steak Schweinefleisch Schweinsbraten Schweinebraten Schnitzel Wiener Faschiertes Hackfleisch Frikadellen Fleischlaibchen Laibchen Gulasch Braten Wurst Würstel Bratwurst Currywurst Leberkäse Leberkäs Schinken Speck Salami Fleisch Fisch Lachs Thunfisch Forelle Kabeljau Garnelen Shrimps Sardinen
Gemüse Salat Blattsalat Gurke Gurken Tomaten Tomate Paradeiser Paprika Karotten Karotte Möhren Zucchini Aubergine Brokkoli Karfiol Blumenkohl Kohl Kraut Sauerkraut Kohlsprossen Rosenkohl Spinat Erbsen Bohnen Fisolen Linsen Kichererbsen Mais Zwiebel Zwiebeln Knoblauch Lauch Pilze Champignons Schwammerl Kürbis Spargel Sellerie Rote Rüben Radieschen Avocado Oliven Suppe Gemüsesuppe Hühnersuppe Nudelsuppe Linsensuppe Kürbissuppe Tomatensuppe Rindsuppe Eintopf Sauce Soße Dressing Ketchup Mayonnaise Senf Pesto
Nüsse Walnüsse Mandeln Haselnüsse Erdnüsse Cashews Samen Leinsamen Chiasamen Erdnussbutter Honig Marmelade Nutella Zucker Schokolade Kuchen Torte Sachertorte Kekse Keks Muffin Brownie Krapfen Donut Waffeln Palatschinken Pfannkuchen Kaiserschmarrn Strudel Eis Eiscreme Gummibärchen Chips Popcorn Riegel Müsliriegel Dessert Tiramisu
Wasser Mineralwasser Leitungswasser Sprudel Tee Pfefferminztee Kamillentee Fencheltee Kräutertee Ingwertee Grüntee Schwarztee Früchtetee Kaffee Espresso Cappuccino Latte Melange Verlängerter Milchkaffee Kakao Saft Apfelsaft Orangensaft Limonade Limo Cola Eistee Almdudler Spezi Bier Wein Rotwein Weißwein Sekt Spritzer Gspritzter Radler Energydrink Suppe Brühe
Ibuprofen Paracetamol Aspirin Buscopan Iberogast Pantoprazol Omeprazol Nexium Mexalen Novalgin Metamizol Lefax Imodium Vomex Kohletabletten Magnesium Eisen Vitamin Zink Probiotikum Tropfen Tabletten Tablette Kapsel Kapseln Globuli Sab Simplex Gaviscon Rennie Talcid Wärmeflasche Wärmflasche Spaziergang Tee Hinlegen Massage Bad Dusche Atemübung Kirschkernkissen
Scheibe Scheiben Stück Stk Portion Teller Schüssel Glas Gläser Tasse Tassen Becher Flasche Löffel Handvoll Prise Hälfte Dose Packung Riegel
`;

const SMALL = `mit ohne und oder mit dazu etwas wenig viel bisschen ein eine einen einem zwei drei vier fünf halb halbe halber halbes kleine kleiner kleines große großer großes groß klein vom von zum zur aus auf in im am mg ml g kg l dl cl`;

/** Häufige Diktier-/Tippfehler bei kleinen Wörtern. */
const FIX: Record<string, string> = {
  mod: 'mit', mitt: 'mit', mid: 'mit', mt: 'mit', nit: 'mit', mir: 'mit',
  unt: 'und', un: 'und', udn: 'und', ud: 'und',
  oda: 'oder', ohen: 'ohne',
};

const lower = (s: string) => s.toLocaleLowerCase('de-DE');
const fold = (s: string) => lower(s).replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/ss/g, 'ß');

const words = [...new Set(VOCAB.split(/\s+/).filter(Boolean))];
const exact = new Map<string, string>();
for (const w of words) {
  exact.set(lower(w), w);
  exact.set(fold(w), w);
}
const small = new Set(SMALL.split(/\s+/));

/** Damerau-Levenshtein-Abstand (mit Abbruch über `max`). */
function dist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Ein Wort ausbessern – oder unverändert lassen, wenn nichts sicher ist. */
export function correctWord(w: string, first: boolean, more = false): string {
  const l = lower(w);
  if (!/^[a-zäöüß]+$/i.test(w)) return w;
  if (FIX[l] && (!first || more)) return FIX[l];
  if (small.has(l) && first && more && ['mit', 'ohne', 'und'].includes(l)) return l;
  if (small.has(l) && !first) return l;
  const hit = exact.get(l) ?? exact.get(fold(w));
  if (hit) return hit;
  if (l.length >= 4) {
    const max = l.length >= 7 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    let tie = false;
    for (const v of words) {
      if (lower(v)[0] !== l[0] && fold(v)[0] !== fold(l)[0]) continue;
      const dd = dist(fold(w), fold(v), max);
      if (dd < bestD) {
        bestD = dd;
        best = v;
        tie = false;
      } else if (dd === bestD && best && lower(best) !== lower(v)) tie = true;
    }
    if (best && bestD <= max && !tie) return best;
  }
  // Unbekannt: am Anfang eines Listenpunkts groß schreiben (Lebensmittel sind Hauptwörter).
  return first && /^[a-zäöü]/.test(w) ? w[0].toLocaleUpperCase('de-DE') + w.slice(1) : w;
}

/** Eine Liste wie „brathuhn, mod kartofeln“ → „Brathuhn mit Kartoffeln“ bzw. „Brathuhn, mit …“. */
export function correctText(text: string): string {
  return text
    .split(/(,(?!\d)|;|\n)/)
    .map((part) => {
      if (/^(,|;|\n)$/.test(part)) return part;
      let first = true;
      const count = (part.match(/[A-Za-zÄÖÜäöüß]+/g) ?? []).length;
      return part.replace(/[A-Za-zÄÖÜäöüß]+|\d+[.,]?\d*/g, (tok) => {
        if (/^\d/.test(tok)) {
          first = false;
          return tok;
        }
        const out = correctWord(tok, first, count > 1);
        first = false;
        return out;
      });
    })
    .join('')
    // „Brathuhn, mit Kartoffeln“ gehört zusammen: „Brathuhn mit Kartoffeln“
    .replace(/,\s*(mit|ohne|und)\b/g, ' $1')
    .replace(/\s+,/g, ',')
    .replace(/,(?=[^\s\d])/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const LIST_LABELS = ['was gegessen?', 'was getrunken?', 'medikamente', 'maßnahmen'];
const isListField = (f: FieldDef) => f.type === 'text' && !!f.config.splitList && (LIST_LABELS.includes(lower(f.label)) || /gegessen|getrunken|essen|trinken|medikament|mahlzeit/i.test(f.label));

/** Eintrag mit ausgebesserten Essen/Trinken/Medikamente-Feldern (gleiches Objekt, wenn nichts zu tun war). */
export function correctEntry(tracker: Tracker | undefined, entry: Entry): Entry {
  if (!tracker) return entry;
  let changed = false;
  const values = { ...entry.values };
  for (const f of tracker.fields) {
    const v = values[f.id];
    if (!isListField(f) || typeof v !== 'string' || !v.trim()) continue;
    const c = correctText(v);
    if (c !== v) {
      values[f.id] = c;
      changed = true;
    }
  }
  return changed ? { ...entry, values } : entry;
}
