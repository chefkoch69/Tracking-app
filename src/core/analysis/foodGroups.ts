import type { FieldDef } from '../model/types';

/**
 * Lebensmittel-Gruppen: In zwei Wochen isst man ein bestimmtes Gericht selten oft genug für
 * eine Auswertung – Milchprodukte, Kaffee oder Weizen aber fast täglich. Jedes eingetragene
 * Essen wird deshalb zusätzlich den passenden Gruppen zugeordnet (auch mehreren:
 * „Milchkaffee“ → Milchprodukte und Kaffee). Deutsche und österreichische Begriffe.
 *
 * Erkennung über Wortteile (Komposita: „Vollkornbrot“ enthält „brot“) plus ganze Wörter für
 * kurze, mehrdeutige Begriffe („ei“, „eis“, „gin“). `exclude` entfernt Wortteile vor der Suche
 * („Schweinebraten“ ist kein Wein), `veto` schließt die Gruppe ganz aus („Hafermilch“).
 */

export interface FoodGroup {
  key: string;
  label: string;
  icon: string;
  /** Satzanfang in Erkenntnissen, z. B. „Nach Milchprodukten“. */
  phrase: string;
  include: string[];
  words?: string[];
  exclude?: string[];
  veto?: string[];
}

export const FOOD_GROUPS: FoodGroup[] = [
  {
    key: 'milch',
    label: 'Milchprodukte',
    icon: '🥛',
    phrase: 'Nach Milchprodukten',
    include: ['milch', 'käse', 'kaese', 'joghurt', 'jogurt', 'yoghurt', 'quark', 'topfen', 'sahne', 'obers', 'rahm', 'schmand', 'butter', 'kefir', 'molke', 'pudding', 'latte', 'cappuccino', 'melange', 'kakao', 'mozzarella', 'parmesan', 'feta', 'ricotta', 'mascarpone', 'camembert', 'gouda', 'emmentaler', 'cheddar', 'burrata', 'raclette', 'fondue', 'skyr', 'eiscreme', 'eiskaffee', 'milchshake', 'kaiserschmarrn', 'palatschinke', 'griesbrei', 'grießbrei', 'tiramisu', 'cheesecake', 'carbonara'],
    words: ['eis', 'flat white'],
    exclude: ['erdnussbutter', 'nussbutter', 'mandelbutter', 'kakaobutter', 'sheabutter'],
    veto: ['kokosmilch', 'hafermilch', 'mandelmilch', 'sojamilch', 'reismilch', 'haferdrink', 'sojadrink', 'mandeldrink', 'laktosefrei', 'lactosefrei', 'vegan'],
  },
  {
    key: 'koffein',
    label: 'Kaffee & Koffein',
    icon: '☕',
    phrase: 'Nach Kaffee/Koffein',
    include: ['kaffee', 'espresso', 'cappuccino', 'macchiato', 'melange', 'verlängerter', 'verlaengerter', 'mokka', 'mocca', 'cola', 'energy', 'red bull', 'schwarztee', 'grüntee', 'gruentee', 'grüner tee', 'schwarzer tee', 'matcha', 'cold brew', 'flat white'],
    words: ['latte', 'mate'],
    veto: ['entkoffeiniert', 'koffeinfrei', 'decaf', 'malzkaffee'],
  },
  {
    key: 'weizen',
    label: 'Weizen & Gluten',
    icon: '🌾',
    phrase: 'Nach Weizen/Gluten',
    include: ['brot', 'toast', 'semmel', 'brötchen', 'broetchen', 'weckerl', 'gebäck', 'baguette', 'ciabatta', 'croissant', 'kipferl', 'brezel', 'breze', 'nudel', 'pasta', 'spaghetti', 'penne', 'tagliatelle', 'lasagne', 'pizza', 'kuchen', 'torte', 'keks', 'waffel', 'pfannkuchen', 'palatschinke', 'kaiserschmarrn', 'strudel', 'knödel', 'knoedel', 'schnitzel', 'paniert', 'panier', 'weizen', 'dinkel', 'roggen', 'gerste', 'couscous', 'bulgur', 'grieß', 'griess', 'wrap', 'tortilla', 'burger', 'döner', 'doener', 'kebab', 'gnocchi', 'spätzle', 'spaetzle', 'nockerl', 'krapfen', 'mehlspeise', 'sandwich', 'bagel', 'cracker', 'zwieback', 'mehl', 'bier', 'müsli', 'muesli', 'muffin', 'donut'],
    veto: ['glutenfrei'],
  },
  {
    key: 'huelsen',
    label: 'Hülsenfrüchte',
    icon: '🫘',
    phrase: 'Nach Hülsenfrüchten',
    include: ['linse', 'bohne', 'kichererbse', 'erbse', 'hummus', 'humus', 'falafel', 'soja', 'tofu', 'edamame', 'chili con carne', 'fisole', 'lupine'],
    words: ['dal'],
    exclude: ['kaffeebohne', 'vanilleschote', 'sojasauce', 'sojasoße', 'sojasosse'],
  },
  {
    key: 'zwiebel',
    label: 'Zwiebel & Knoblauch',
    icon: '🧅',
    phrase: 'Nach Zwiebel/Knoblauch',
    include: ['zwiebel', 'knoblauch', 'lauch', 'porree', 'schalotte', 'knofi', 'aioli', 'tzatziki', 'zaziki'],
  },
  {
    key: 'fett',
    label: 'Fettiges & Frittiertes',
    icon: '🍟',
    phrase: 'Nach Fettigem',
    include: ['pommes', 'fritten', 'frittiert', 'chips', 'burger', 'bratwurst', 'currywurst', 'würstel', 'wuerstel', 'speck', 'bacon', 'schnitzel', 'cordon bleu', 'döner', 'doener', 'kebab', 'leberkäs', 'leberkaes', 'pizza', 'mayonnaise', 'mayo', 'schweinsbraten', 'schweinebraten', 'haxe', 'stelze', 'krapfen', 'donut', 'nuggets', 'backhendl', 'gebacken', 'käsespätzle', 'kaesespaetzle', 'fondue', 'raclette', 'frittata', 'carbonara'],
  },
  {
    key: 'scharf',
    label: 'Scharfes',
    icon: '🌶',
    phrase: 'Nach Scharfem',
    include: ['scharf', 'chili', 'curry', 'peperoni', 'pfefferoni', 'jalapeño', 'jalapeno', 'sriracha', 'tabasco', 'harissa', 'kimchi', 'wasabi', 'kren', 'meerrettich', 'cayenne', 'sambal'],
  },
  {
    key: 'suess',
    label: 'Süßes & Zucker',
    icon: '🍫',
    phrase: 'Nach Süßem',
    include: ['schokolade', 'schoko', 'kuchen', 'torte', 'keks', 'gummibär', 'gummibaer', 'süßigkeit', 'suessigkeit', 'süßes', 'bonbon', 'zucker', 'honig', 'marmelade', 'konfitüre', 'nutella', 'eiscreme', 'pudding', 'krapfen', 'donut', 'muffin', 'brownie', 'limo', 'eistee', 'sirup', 'kaiserschmarrn', 'palatschinke', 'pfannkuchen', 'waffel', 'germknödel', 'strudel', 'mehlspeise', 'riegel', 'dessert', 'tiramisu', 'cheesecake'],
    words: ['eis', 'cola', 'fanta', 'sprite', 'spezi'],
    veto: ['zuckerfrei', 'ohne zucker', 'zero', 'light'],
  },
  {
    key: 'obst',
    label: 'Obst & Saft',
    icon: '🍎',
    phrase: 'Nach Obst/Saft',
    include: ['apfel', 'äpfel', 'aepfel', 'birne', 'banane', 'mango', 'traube', 'kirsche', 'pflaume', 'zwetschke', 'zwetschge', 'marille', 'aprikose', 'pfirsich', 'nektarine', 'melone', 'ananas', 'orange', 'mandarine', 'clementine', 'grapefruit', 'beere', 'kiwi', 'feige', 'dattel', 'rosine', 'trockenobst', 'smoothie', 'saft', 'obst', 'frucht', 'früchte', 'fruechte', 'kompott', 'apfelmus'],
    exclude: ['erdäpfel', 'erdaepfel', 'erdapfel', 'apfelessig'],
  },
  {
    key: 'kohl',
    label: 'Kohl, Pilze & Blähendes',
    icon: '🥦',
    phrase: 'Nach Kohl/Blähendem',
    include: ['kohl', 'kraut', 'brokkoli', 'broccoli', 'karfiol', 'kohlsprossen', 'wirsing', 'pilz', 'champignon', 'schwammerl', 'artischocke', 'spargel'],
    exclude: ['kohlensäure', 'kohlensaeure', 'kohlenhydrat', 'holzkohle', 'grillkohle', 'kräuter', 'kraeuter', 'kräutertee', 'kraut-tee'],
  },
  {
    key: 'alkohol',
    label: 'Alkohol',
    icon: '🍷',
    phrase: 'Nach Alkohol',
    include: ['bier', 'wein', 'sekt', 'prosecco', 'spritzer', 'gspritzt', 'schnaps', 'likör', 'likoer', 'cocktail', 'aperol', 'wodka', 'vodka', 'whisky', 'whiskey', 'radler', 'cider', 'punsch', 'alkohol'],
    words: ['gin', 'rum'],
    exclude: ['schwein', 'weintraube', 'weinbeere', 'weinblätter', 'probier', 'bierteig'],
    veto: ['alkoholfrei'],
  },
  {
    key: 'sprudel',
    label: 'Kohlensäure',
    icon: '🫧',
    phrase: 'Nach Sprudelndem',
    include: ['sprudel', 'kohlensäure', 'kohlensaeure', 'mineralwasser', 'soda', 'cola', 'limo', 'spezi', 'fanta', 'sprite', 'sekt', 'prosecco', 'bier', 'energy', 'tonic', 'radler', 'almdudler', 'frizzante', 'spritzer', 'gspritzt'],
    words: ['mineral'],
    veto: ['ohne kohlensäure', 'ohne kohlensaeure', 'still'],
  },
  {
    key: 'ei',
    label: 'Eier',
    icon: '🥚',
    phrase: 'Nach Eiern',
    include: ['rührei', 'ruehrei', 'spiegelei', 'omelett', 'eierspeis', 'eiersalat', 'frühstücksei', 'eiernockerl', 'kaiserschmarrn', 'carbonara'],
    words: ['ei', 'eier', 'eiern'],
  },
  {
    key: 'suessstoff',
    label: 'Süßstoff & Zuckeralkohole',
    icon: '🍬',
    phrase: 'Nach Süßstoff',
    include: ['sorbit', 'xylit', 'erythrit', 'maltit', 'kaugummi', 'zuckerfrei', 'süßstoff', 'suessstoff', 'aspartam', 'stevia'],
    words: ['zero', 'light'],
  },
];

const norm = (s: string) =>
  ` ${s.toLocaleLowerCase('de-DE').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')} `;

const compiled = FOOD_GROUPS.map((g) => ({
  g,
  include: g.include.map(norm).map((x) => x.trim()),
  words: new Set((g.words ?? []).map((x) => norm(x).trim())),
  exclude: (g.exclude ?? []).map((x) => norm(x).trim()),
  veto: (g.veto ?? []).map((x) => norm(x).trim()),
}));

/** Alle Gruppen, zu denen ein Lebensmittel gehört (Reihenfolge wie FOOD_GROUPS). */
export function foodGroupsOf(item: string): FoodGroup[] {
  const s = norm(item);
  const out: FoodGroup[] = [];
  for (const c of compiled) {
    if (c.veto.some((v) => s.includes(v))) continue;
    let t = s;
    for (const x of c.exclude) t = t.split(x).join(' ');
    const tokens = t.split(/[^a-z]+/).filter(Boolean);
    const phrase = ` ${tokens.join(' ')} `;
    if (c.include.some((x) => t.includes(x)) || tokens.some((w) => c.words.has(w)) || [...c.words].some((w) => w.includes(' ') && phrase.includes(` ${w} `))) out.push(c.g);
  }
  return out;
}

/** Gruppen einer ganzen Liste („3 Eier, Toast, Milchkaffee“), ohne Doppelte. */
export function foodGroupsOfList(items: string[]): FoodGroup[] {
  const keys = new Set(items.flatMap((i) => foodGroupsOf(i).map((g) => g.key)));
  return FOOD_GROUPS.filter((g) => keys.has(g.key));
}

/** Ist das Feld eine Essens-/Getränkeliste? */
export function isFoodField(f: FieldDef): boolean {
  return f.type === 'text' && !!f.config.splitList && /gegessen|essen|lebensmittel|mahlzeit|getrunken|trinken|getränk/i.test(f.label);
}

/** Kategorie-Präfix für Gruppen in Auswertungen. */
export const GROUP_CAT = 'gruppe:';
export const groupByCat = (cat: string): FoodGroup | undefined =>
  cat.startsWith(GROUP_CAT) ? FOOD_GROUPS.find((g) => g.key === cat.slice(GROUP_CAT.length)) : undefined;
