import { C, fmt } from "../theme.js";
import { COMPANY_NAME } from "../config.js";

// Treść oferty jako zwykły tekst do maila (ta sama w kalkulatorze i w bazie kalkulacji).
// `meta` = { offerNo, unit }
export function buildOfferEmailBody(result, meta) {
  const { offerNo = "", unit = "PLN", material = "" } = meta || {};
  const rows = result.items.map((it) => {
    const dims = `${fmt(it.width_m)}×${fmt(it.height_m)}${it.depth_m ? "×" + fmt(it.depth_m) : ""} m`;
    return `• ${it.label || "Pozycja"} — ${dims} — ${fmt(it.area)} m² — ${fmt(it.cost)} ${unit}`;
  });
  const accessories = result.accessories || [];
  const accRows = accessories.map(
    (a) => `• ${a.name || "Akcesorium"} — ${fmt(a.qty)} szt. × ${fmt(a.unitNet)} ${unit} — ${fmt(a.net)} ${unit} (VAT ${fmt(a.vat)}%)`
  );
  // Etykieta VAT: jeden procent, gdy cała oferta ma tę samą stawkę; inaczej „różne stawki".
  const vatLabel = result.singleVatRate != null ? `VAT ${fmt(result.singleVatRate)}%` : "VAT (różne stawki)";
  return [
    "Dzień dobry,",
    "",
    `w załączeniu oferta na osłony grzejnikowe (nr ${offerNo}).`,
    ...(material ? ["", `Materiał: ${material}`] : []),
    "",
    ...rows,
    ...(accRows.length ? ["", "Akcesoria:", ...accRows] : []),
    "",
    `Razem netto: ${fmt(result.totalNet)} ${unit}`,
    `${vatLabel}: ${fmt(result.vatAmount)} ${unit}`,
    `Do zapłaty (brutto): ${fmt(result.totalGross)} ${unit}`,
    "",
    "Oferta ważna 14 dni. Wymiary do potwierdzenia po pomiarze z natury.",
    "",
    "Pozdrawiam,",
    COMPANY_NAME,
  ].join("\n");
}

// Zlecenie na produkcję/pakowanie — te same pozycje co oferta, ale BEZ cen
// (materiał, wymiary, powierzchnia, akcesoria z ilościami, uwagi).
export function buildProductionEmailBody(result, meta) {
  const { offerNo = "", client = "", material = "" } = meta || {};
  const rows = result.items.map((it) => {
    const dims = `${fmt(it.width_m)}×${fmt(it.height_m)}${it.depth_m ? "×" + fmt(it.depth_m) : ""} m`;
    const basis = it.basis ? ` (${it.basis})` : "";
    return `• ${it.label || "Pozycja"} — ${dims}${basis} — ${fmt(it.area)} m²${it.note ? " — " + it.note : ""}`;
  });
  const accRows = (result.accessories || []).map((a) => `• ${a.name || "Akcesorium"} — ${fmt(a.qty)} szt.`);
  return [
    "Zlecenie na produkcję / pakowanie",
    "",
    `Nr oferty: ${offerNo}`,
    ...(client ? [`Klient: ${client}`] : []),
    ...(material ? [`Materiał: ${material}`] : []),
    "",
    "Pozycje do wykonania:",
    ...rows,
    ...(accRows.length ? ["", "Akcesoria:", ...accRows] : []),
    "",
    "Dokument roboczy dla produkcji — bez cen. Wymiary wg zaakceptowanej oferty.",
    "",
    COMPANY_NAME,
  ].join("\n");
}

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])
  );

// Buduje HTML oferty (ten sam dokument w podglądzie i przy druku do PDF).
// `result` = { items, warnings, totalArea, totalCost, p } ; `meta` = { offerNo, company, client, unit }
export function buildOfferHTML(result, meta) {
  const { offerNo = "", company = "", client = "", unit = "PLN", material = "" } = meta || {};

  const rows = result.items
    .map(
      (it, i) => `
      <tr>
        <td class="pos">${esc(it.label || `Pozycja ${i + 1}`)}${
        it.note ? `<div class="note">${esc(it.note)}</div>` : ""
      }</td>
        <td>${fmt(it.width_m)} × ${fmt(it.height_m)}${
        it.depth_m ? ` × ${fmt(it.depth_m)}` : ""
      } m<div class="basis">${esc(it.basis)}</div></td>
        <td>${fmt(it.area)}</td>
        <td class="right b">${fmt(it.cost)}</td>
      </tr>`
    )
    .join("");

  // Akcesoria — dodatkowe pozycje (ilość × cena netto, własny VAT).
  const accRows = (result.accessories || [])
    .map(
      (a) => `
      <tr>
        <td class="pos">${esc(a.name || "Akcesorium")}<div class="basis">akcesorium · VAT ${fmt(a.vat)}%</div></td>
        <td>${fmt(a.qty)} szt. × ${fmt(a.unitNet)} ${esc(unit)}</td>
        <td></td>
        <td class="right b">${fmt(a.net)}</td>
      </tr>`
    )
    .join("");

  const vatLabel = result.singleVatRate != null ? `VAT ${fmt(result.singleVatRate)}%` : "VAT (różne stawki)";

  const warnings =
    result.warnings && result.warnings.length > 0
      ? `
      <div class="warn">
        <strong>Do potwierdzenia z klientem:</strong>
        <ul>${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      </div>`
      : "";

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><title>${esc(offerNo)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: ${C.ink}; padding: 22mm 18mm; font-size: 12px; background: #fff; }
        h1 { font-size: 24px; font-weight: 800; }
        .sub { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: ${C.brass}; font-weight: 700; margin-top: 3px; }
        .rule { border-bottom: 2px solid ${C.ink}; margin: 10px 0 14px; }
        .meta { display: flex; justify-content: space-between; color: ${C.steel}; margin-bottom: 4px; }
        .meta-block { margin-bottom: 14px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        thead td { background: ${C.ink}; color: ${C.paper}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 7px 8px; }
        tbody td { padding: 9px 8px; border-bottom: 1px solid ${C.line}; vertical-align: top; }
        .pos { font-weight: 600; }
        .note { font-size: 9px; color: ${C.brass}; font-weight: 400; margin-top: 2px; }
        .basis { font-size: 8px; color: ${C.steel}; margin-top: 1px; }
        .right { text-align: right; }
        .b { font-weight: 700; }
        tfoot td { padding: 9px 8px; }
        .sum-net td { border-top: 2px solid ${C.ink}; font-weight: 600; }
        .sum-vat td { color: ${C.steel}; }
        .sum-gross td { background: ${C.ink}; color: ${C.paper}; font-weight: 800; font-size: 14px; padding: 11px 8px; }
        .warn { margin-top: 16px; padding: 10px 12px; border-left: 4px solid ${C.brass}; background: #faf7f0; font-size: 11px; color: ${C.steel}; }
        .warn ul { margin: 5px 0 0 16px; }
        .foot { margin-top: 28px; font-size: 9px; color: ${C.steel}; }
        .sign { margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px; color: ${C.steel}; }
        @page { margin: 0; }
        @media print { body { padding: 16mm 18mm; } }
      </style></head><body>
        <h1>${esc(company || "Oferta")}</h1>
        <div class="sub">Wycena obudów grzejnikowych</div>
        <div class="rule"></div>
        <div class="meta"><span>Nr oferty: ${esc(offerNo)}</span><span>Data: ${new Date().toLocaleDateString(
    "pl-PL"
  )}</span></div>
        <div class="meta-block">
          ${client ? `Dla: <strong>${esc(client)}</strong><br>` : ""}
          ${material ? `Materiał: <strong>${esc(material)}</strong><br>` : ""}
          Cena netto: ${fmt(result.p)} ${esc(unit)}/m²
        </div>
        <table>
          <thead><tr><td>Pozycja</td><td>Wymiary</td><td>m²</td><td class="right">Netto</td></tr></thead>
          <tbody>${rows}${accRows}</tbody>
          <tfoot>
            <tr class="sum-net"><td>Razem netto</td><td></td><td>${fmt(result.totalArea)} m²</td><td class="right">${fmt(
    result.totalNet
  )} ${esc(unit)}</td></tr>
            <tr class="sum-vat"><td colspan="3">${vatLabel}</td><td class="right">${fmt(
    result.vatAmount
  )} ${esc(unit)}</td></tr>
            <tr class="sum-gross"><td colspan="3">Do zapłaty (brutto)</td><td class="right">${fmt(
    result.totalGross
  )} ${esc(unit)}</td></tr>
          </tfoot>
        </table>
        ${warnings}
        <div class="foot">${
          result.items.some((i) => i.basis && i.basis.startsWith("pełna"))
            ? "Wycena obejmuje powierzchnię obudowy (front, boki i górę)."
            : "Wycena obejmuje powierzchnię frontu obudowy."
        } Oferta ważna 14 dni.</div>
        <div class="sign"><span>Akceptacja klienta: ...................................</span><span>Data: ......................</span></div>
      </body></html>`;
}

// Otwiera ofertę w nowym oknie i wywołuje druk (użytkownik wybiera „Zapisz jako PDF").
export function printOffer(result, meta) {
  const html = buildOfferHTML(result, meta);
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}
