// Logika liczenia powierzchni i kosztu obudów kaloryferów.
// "full" = front + 2 boki + góra (obudowa nakładana, bez tyłu i spodu).
//
// Cena `p` (za m²) jest ceną NETTO. `vatRate` to stawka VAT w procentach (np. 23).
// `accessories` to dodatkowe pozycje (np. nóżki, montaż): { name, qty, unitNet, vat } —
// każda z własną ilością, ceną netto i stawką VAT.
// Zwracamy netto, kwotę VAT i brutto — na ofercie pokazujemy wszystkie trzy.
// Normalizuje listę akcesoriów i liczy ich sumy. `fallbackRate` = stawka VAT wyceny
// (używana, gdy wiersz nie ma własnej). Puste/zerowe pozycje pomijamy.
export function accessoryTotals(accessories, fallbackRate = 0) {
  const items = (accessories || [])
    .map((a) => {
      const qty = Number(String(a.qty ?? "").replace(",", ".")) || 0;
      const unitNet = Number(String(a.unitNet ?? "").replace(",", ".")) || 0;
      const rawVat = Number(String(a.vat ?? "").replace(",", "."));
      const vat = Number.isFinite(rawVat) && rawVat >= 0 ? rawVat : fallbackRate;
      const net = qty * unitNet;
      return { name: (a.name || "").trim(), qty, unitNet, vat, net, vatAmount: net * (vat / 100), gross: net * (1 + vat / 100) };
    })
    .filter((a) => a.qty > 0 && a.unitNet > 0);
  return {
    items,
    net: items.reduce((s, a) => s + a.net, 0),
    vat: items.reduce((s, a) => s + a.vatAmount, 0),
    gross: items.reduce((s, a) => s + a.gross, 0),
  };
}

export function computeResult(rawItems, baseWarnings, p, mode, vatRate = 23, accessories = []) {
  const warnings = [...baseWarnings];
  const items = rawItems.map((it) => {
    const w = it.width_m || 0,
      h = it.height_m || 0,
      d = it.depth_m || 0;
    const front = w * h;
    let area = front,
      basis = "front";
    const wantFull = mode === "full" || (mode === "auto" && d > 0);
    if (wantFull) {
      if (d > 0) {
        area = front + 2 * (d * h) + w * d; // front + boki + góra
        basis = "pełna obudowa";
      } else {
        basis = "front (brak głębokości)";
        warnings.push(
          `„${it.label || "pozycja"}": wybrano pełną obudowę, ale brak głębokości — policzono sam front.`
        );
      }
    }
    return { ...it, depth_m: d || null, area, basis, cost: area * p };
  });
  const totalArea = items.reduce((s, i) => s + i.area, 0);
  const rate = Number.isFinite(vatRate) ? vatRate : 0;

  // Osłony (liczone z powierzchni) — netto i VAT wg stawki wyceny.
  const coversNet = items.reduce((s, i) => s + i.cost, 0);
  const coversVat = coversNet * (rate / 100);

  // Akcesoria — każde z własną stawką VAT (domyślnie stawka wyceny).
  const accT = accessoryTotals(accessories, rate);
  const acc = accT.items;
  const accessoriesNet = accT.net;
  const accessoriesVat = accT.vat;

  const totalNet = coversNet + accessoriesNet;
  const vatAmount = coversVat + accessoriesVat;
  const totalGross = totalNet + vatAmount;

  // Jedna stawka w całej ofercie? (do etykiety „VAT X%" vs „różne stawki")
  const rates = new Set([...(coversNet > 0 ? [rate] : []), ...acc.map((a) => a.vat)]);
  const singleVatRate = rates.size <= 1 ? (rates.size === 1 ? [...rates][0] : rate) : null;

  // totalCost = netto osłon (zgodność z tym, co zapisujemy w bazie jako total_cost);
  // akcesoria trzymamy osobno (kolumna `accessories`), by nie mieszać stawek VAT.
  return {
    items,
    warnings,
    totalArea,
    accessories: acc,
    coversNet,
    coversVat,
    accessoriesNet,
    accessoriesVat,
    totalCost: coversNet,
    totalNet,
    vatRate: rate,
    singleVatRate,
    vatAmount,
    totalGross,
    p,
    mode,
  };
}
