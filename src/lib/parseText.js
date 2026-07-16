// Lokalny odczyt wymiarów z treści maila — bez API, bez kosztów, działa offline.
// Rozpoznaje DWA sposoby zapisu:
//   1. skrótowy: "120x60", "120 x 60 x 12 cm", "500x400 mm", "1,2 x 0,6 m",
//   2. opisowy (jak w prawdziwych mailach): "Wysokość - 0,85m. Długość - 2,55m.
//      Głębokość maksymalna do 40cm".
//
// Zasady:
// - jednostki cm / mm / m; gdy brak jednostki — zakładamy cm (skrót) lub zgadujemy z wielkości (opis),
// - "60x40" = szerokość x wysokość, "60x40x10" = szerokość x wysokość x głębokość,
// - w opisie: Długość/Szerokość = szerokość osłony, Wysokość = wysokość, Głębokość = głębokość,
// - gdy klient nie podał głębokości, pomijamy ją (nie zgadujemy).

// Liczba: 120 | 1,2 | 0.6
const NUM = String.raw`\d+(?:[.,]\d+)?`;
// szer x wys [x głęb] [jednostka]
const DIM_RE = new RegExp(
  String.raw`(${NUM})\s*[x×*]\s*(${NUM})(?:\s*[x×*]\s*(${NUM}))?\s*(mm|cm|m)?\b`,
  "i"
);

const toNumber = (s) => parseFloat(String(s).replace(",", "."));

// Przelicza na metry wg jednostki.
const toMeters = (value, unit) => {
  if (unit === "mm") return value / 1000;
  if (unit === "m") return value;
  return value / 100; // cm — domyślnie
};

// Wyciąga nazwę pozycji z tekstu przed wymiarami (np. "- salon:" -> "salon").
function extractLabel(before) {
  return before
    .replace(/^[\s\-–—•*·>]+/, "")
    .replace(/[\s:：.,;-]+$/, "")
    .trim();
}

// Szuka jednostki w całej linii, gdy nie stoi tuż przy wymiarach.
function unitFromLine(line) {
  if (/\bmm\b|milimetr/i.test(line)) return "mm";
  if (/\bcm\b|centymetr/i.test(line)) return "cm";
  if (/\bm\b|metr/i.test(line)) return "m";
  return null;
}

// --- Odczyt opisowy: "Wysokość - 0,85m", "Długość 2,55 m", "Głębokość do 40cm" ---
// Rdzenie słów tolerują brak polskich znaków i literówki OCR ([łl], [ęe]).
const LABELS = {
  height: [String.raw`wysoko\w*`, String.raw`\bwys\.?`],
  width: [String.raw`d[łl]ugo\w*`, String.raw`szeroko\w*`, String.raw`\bd[łl]\.?`, String.raw`\bszer\.?`],
  depth: [String.raw`g[łl][ęe]boko\w*`, String.raw`\bg[łl][ęe]b\.?`],
};

// Znajduje pierwszą liczbę stojącą po danej etykiecie (w oknie ~40 znaków).
function findLabeled(text, patterns) {
  for (const stem of patterns) {
    const re = new RegExp(stem + String.raw`[^0-9]{0,40}?(${NUM})\s*(mm|cm|m)?`, "i");
    const m = text.match(re);
    if (m) return { value: toNumber(m[1]), unit: (m[2] || "").toLowerCase() || null, raw: m[1] };
  }
  return null;
}

// Przelicza wymiar opisowy na metry; gdy brak jednostki — zgaduje po wielkości i ostrzega.
function labeledToMeters(dim, name, warnings) {
  if (!dim) return null;
  let unit = dim.unit;
  if (!unit) {
    unit = dim.value < 10 ? "m" : "cm"; // 0,85 → metry; 85 → centymetry
    warnings.push(`„${name}": nie podano jednostki — przyjęto ${unit === "m" ? "metry" : "centymetry"} (${dim.raw}).`);
  }
  return toMeters(dim.value, unit);
}

// Buduje jedną osłonę z opisu słownego (gdy zapis skrótowy nic nie znalazł).
function parseLabeledDimensions(text) {
  const warnings = [];
  const wDim = findLabeled(text, LABELS.width);
  const hDim = findLabeled(text, LABELS.height);
  const dDim = findLabeled(text, LABELS.depth);
  if (!wDim || !hDim) return null; // bez szerokości i wysokości nie policzymy powierzchni

  const width_m = labeledToMeters(wDim, "Długość/Szerokość", warnings);
  const height_m = labeledToMeters(hDim, "Wysokość", warnings);
  const depth_m = dDim ? labeledToMeters(dDim, "Głębokość", warnings) : null;

  const item = { label: "Osłona", width_m, height_m };
  if (depth_m) item.depth_m = depth_m;
  return { item, warnings };
}

// --- Odczyt materiału z treści (np. „MDF 18 mm, lakier RAL 7035") ---
// Składa opis z trzech kawałków: rodzaj płyty + grubość, wykończenie, kolor RAL.
// Rozpoznaje częste zapisy z prawdziwych maili; gdy nic nie pasuje — zwraca "".
const MATERIAL_TERMS = [
  [/\bMDF\b/i, "MDF"],
  [/\bHDF\b/i, "HDF"],
  [/sklejk\w*/i, "sklejka"],
  [/p[łl]yt\w*\s+wi[óo]row\w*/i, "płyta wiórowa"],
  [/p[łl]yt\w*\s+meblow\w*/i, "płyta meblowa"],
  [/\bp[łl]yt\w*/i, "płyta"],
  [/blach\w*/i, "blacha"],
  [/\b(?:stal|stalow\w+)\b/i, "stal"],
  [/aluminiow\w*|aluminium/i, "aluminium"],
  [/\bmetal\w*/i, "metal"],
  [/pleksi\w*|plexi\w*|pleksa/i, "pleksi"],
  [/d[ęe]bow\w*|\bd[ąa]b\b/i, "dąb"],
  [/sosn\w*/i, "sosna"],
  [/drewn\w*|drewnian\w*/i, "drewno"],
];

// Grubość: „grubość 18 mm", „gr. 18", albo „MDF 18 mm" (materiał tuż przy liczbie).
function findThickness(text) {
  // „grubość"/„gr." + liczba — dozwolony odstęp (polskie „ść" nie jest znakiem \w).
  let m = text.match(/(?:grubo|\bgr\.?)[^0-9]{0,15}?(\d{1,3})\s*mm?\b/i);
  if (m) return `${m[1]} mm`;
  // Materiał tuż przy liczbie: „MDF 18 mm", „sklejka 12mm".
  m = text.match(/\b(?:MDF|HDF|p[łl]yt\w*|sklejk\w*|blach\w*)\s*[:\-]?\s*(\d{1,2})\s*mm\b/i);
  if (m) return `${m[1]} mm`;
  return "";
}

export function extractMaterialFromText(text) {
  const t = String(text || "");
  const parts = [];

  let base = "";
  for (const [re, name] of MATERIAL_TERMS) {
    if (re.test(t)) { base = name; break; }
  }
  const thickness = findThickness(t);
  if (base && thickness) parts.push(`${base} ${thickness}`);
  else if (base) parts.push(base);
  else if (thickness) parts.push(thickness);

  if (/lakier\w*/i.test(t)) parts.push("lakier");
  else if (/malowan\w*/i.test(t)) parts.push("malowany");
  else if (/oklein\w*/i.test(t)) parts.push("okleina");
  else if (/fornir\w*/i.test(t)) parts.push("fornir");

  const ral = t.match(/\bRAL\s?(\d{3,4})\b/i);
  if (ral) parts.push(`RAL ${ral[1]}`);

  return parts.join(", ");
}

export function parseDimensionsFromText(text) {
  const warnings = [];
  const items = [];

  const lines = String(text || "").split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(DIM_RE);
    if (!m) continue;

    const [full, wRaw, hRaw, dRaw, unitRaw] = m;
    const unit = (unitRaw || unitFromLine(line) || "cm").toLowerCase();
    const guessedUnit = !unitRaw && !unitFromLine(line);

    const w = toMeters(toNumber(wRaw), unit);
    const h = toMeters(toNumber(hRaw), unit);
    const d = dRaw ? toMeters(toNumber(dRaw), unit) : null;

    const label = extractLabel(line.slice(0, m.index)) || `Pozycja ${items.length + 1}`;

    const item = { label, width_m: w, height_m: h };
    if (d) item.depth_m = d;

    // Sygnalizujemy wątpliwości zamiast po cichu zgadywać.
    if (guessedUnit) {
      warnings.push(`„${label}": nie podano jednostki — przyjęto centymetry (${wRaw}×${hRaw} cm).`);
    }
    if (w > 4 || h > 3) {
      warnings.push(
        `„${label}": wymiary wychodzą bardzo duże (${w.toFixed(2)}×${h.toFixed(2)} m) — sprawdź jednostkę.`
      );
    }
    if (w <= 0 || h <= 0) {
      warnings.push(`„${label}": wymiar zerowy lub ujemny — pominięto.`);
      continue;
    }

    items.push(item);
  }

  // Zapis skrótowy (120x60) nic nie dał — spróbuj opisu słownego (Wysokość/Długość/Głębokość).
  if (items.length === 0) {
    const labeled = parseLabeledDimensions(String(text || ""));
    if (labeled) {
      const { item, warnings: w } = labeled;
      warnings.push(...w);
      if (item.width_m > 4 || item.height_m > 3) {
        warnings.push(
          `„${item.label}": wymiary wychodzą bardzo duże (${item.width_m.toFixed(2)}×${item.height_m.toFixed(2)} m) — sprawdź jednostkę.`
        );
      }
      if (item.width_m > 0 && item.height_m > 0) {
        warnings.push("Wymiary odczytane z opisu słownego — sprawdź je przed wysłaniem oferty.");
        items.push(item);
      }
    }
  }

  if (items.length === 0) {
    warnings.push(
      "Nie znalazłem żadnych wymiarów. Zapisz je w formie 120x60 lub 120x60x12 (cm lub mm), " +
        "albo opisz słownie: „Wysokość 0,85 m, Długość 2,55 m, Głębokość 40 cm”."
    );
  }

  return { items, warnings };
}
