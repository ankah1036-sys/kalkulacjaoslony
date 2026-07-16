// Lokalny odczyt wymiarów z treści maila — bez API, bez kosztów, działa offline.
// Rozpoznaje zapisy typu: "120x60", "120 x 60 x 12 cm", "500x400 mm", "1,2 x 0,6 m".
//
// Zasady (te same, co wcześniej po stronie modelu):
// - jednostki cm / mm / m; gdy brak jednostki — zakładamy cm,
// - "60x40" = szerokość x wysokość, "60x40x10" = szerokość x wysokość x głębokość,
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

  if (items.length === 0) {
    warnings.push(
      "Nie znalazłem żadnych wymiarów. Zapisz je w formie 120x60 lub 120x60x12 (cm lub mm), każda osłona w osobnej linii."
    );
  }

  return { items, warnings };
}
