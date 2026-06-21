// Logika liczenia powierzchni i kosztu obudów kaloryferów.
// "full" = front + 2 boki + góra (obudowa nakładana, bez tyłu i spodu).
export function computeResult(rawItems, baseWarnings, p, mode) {
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
  const totalCost = items.reduce((s, i) => s + i.cost, 0);
  return { items, warnings, totalArea, totalCost, p, mode };
}
