import { useState, useRef } from "react";

// Paleta i typografia inspirowane warsztatem blacharskim: stal, ciepły mosiądz, papier rysunku technicznego.
const C = {
  paper: "#EDE9E0",
  ink: "#1C1E22",
  steel: "#3A4654",
  brass: "#B5803A",
  line: "#C9C2B4",
  green: "#3B6B4A",
  red: "#9C3B2E",
};

export default function App() {
  const [tab, setTab] = useState("text"); // text | image
  const [emailText, setEmailText] = useState("");
  const [image, setImage] = useState(null); // {data, media_type}
  const [price, setPrice] = useState("180"); // cena materiału za m²
  const [unit, setUnit] = useState("PLN");
  const [surfaceMode, setSurfaceMode] = useState("auto"); // auto | front | full
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [company, setCompany] = useState("Wolf Meble");
  const [client, setClient] = useState("");
  const [offerNo, setOfferNo] = useState(() => "OF/" + new Date().toISOString().slice(0, 10).replace(/-/g, "/"));
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useRef(null);
  const iframeRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage({ data: reader.result.split(",")[1], media_type: f.type, name: f.name });
    };
    reader.readAsDataURL(f);
  };

  // Liczy powierzchnię i koszt wg trybu. "full" = front + 2 boki + góra (obudowa nakładana, bez tyłu i spodu).
  const computeResult = (rawItems, baseWarnings, p, mode) => {
    const warnings = [...baseWarnings];
    const items = rawItems.map((it) => {
      const w = it.width_m || 0, h = it.height_m || 0, d = it.depth_m || 0;
      const front = w * h;
      let area = front, basis = "front";
      const wantFull = mode === "full" || (mode === "auto" && d > 0);
      if (wantFull) {
        if (d > 0) {
          area = front + 2 * (d * h) + w * d; // front + boki + góra
          basis = "pełna obudowa";
        } else {
          basis = "front (brak głębokości)";
          warnings.push(`„${it.label || "pozycja"}": wybrano pełną obudowę, ale brak głębokości — policzono sam front.`);
        }
      }
      return { ...it, depth_m: d || null, area, basis, cost: area * p };
    });
    const totalArea = items.reduce((s, i) => s + i.area, 0);
    const totalCost = items.reduce((s, i) => s + i.cost, 0);
    return { items, warnings, totalArea, totalCost, p, mode };
  };

  // Przelicza ponownie po zmianie trybu, bez nowego zapytania do API.
  const recompute = (mode) => {
    setSurfaceMode(mode);
    if (result) {
      const base = result.warnings.filter((w) => !w.includes("policzono sam front"));
      setResult(computeResult(result.items, base, result.p, mode));
    }
  };

  const analyze = async () => {
    setError("");
    setResult(null);
    const p = parseFloat(price.replace(",", "."));
    if (!p || p <= 0) {
      setError("Podaj poprawną cenę materiału za m².");
      return;
    }
    if (tab === "text" && !emailText.trim()) {
      setError("Wklej treść maila z wymiarami.");
      return;
    }
    if (tab === "image" && !image) {
      setError("Wgraj zdjęcie lub rysunek z wymiarami.");
      return;
    }
    setLoading(true);

    const sys =
      "Jesteś asystentem wyceny obudów grzejnikowych (kaloryferów). " +
      "Ze źródła wyciągnij WSZYSTKIE obudowy wraz z wymiarami: szerokość, wysokość oraz głębokość, jeśli klient ją podał. " +
      "Wymiary mogą być w cm lub mm; przelicz na metry. Jeśli jednostka nie jest podana, załóż cm. " +
      "Zapis typu 60x40 traktuj jako szerokość x wysokość. Zapis 60x40x10 traktuj jako szerokość x wysokość x głębokość. " +
      "Jeśli klient nie podał głębokości, pomiń pole depth_m (nie zgaduj). " +
      "Zwróć WYŁĄCZNIE czysty JSON (bez markdown, bez komentarzy) w formacie: " +
      '{"items":[{"label":"opis lub nazwa","width_m":liczba,"height_m":liczba,"depth_m":liczba lub pomiń,"note":"opcjonalna uwaga jeśli coś niejasne"}],"warnings":["ostrzeżenia jeśli brakuje danych"]}. ' +
      "Jeśli nie znajdziesz żadnych wymiarów, zwróć items:[] i opisz problem w warnings.";

    const content =
      tab === "image"
        ? [
            { type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } },
            { type: "text", text: "Odczytaj wymiary obudów kaloryferów z tego rysunku/zdjęcia." },
          ]
        : [{ type: "text", text: "Treść maila:\n\n" + emailText }];

    try {
      // Endpoint API: domyślnie lokalne proxy (server.js), które trzyma klucz po stronie serwera.
      // Klucza Anthropic NIGDY nie umieszczaj w kodzie frontendu — przeglądarka go ujawni.
      const API_URL = import.meta.env.VITE_API_URL || "/api/messages";
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: sys,
          messages: [{ role: "user", content }],
        }),
      });
      const data = await response.json();
      const text = data.content.map((i) => (i.type === "text" ? i.text : "")).join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResult(computeResult(parsed.items || [], parsed.warnings || [], p, surfaceMode));
    } catch (err) {
      setError("Nie udało się odczytać danych. Spróbuj ponownie lub doprecyzuj wymiary.");
    } finally {
      setLoading(false);
    }
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  // Buduje HTML oferty (ten sam dokument używany w podglądzie i przy druku do PDF).
  const buildHTML = () => {
    const rows = result.items.map((it, i) => `
      <tr>
        <td class="pos">${esc(it.label || `Pozycja ${i + 1}`)}${it.note ? `<div class="note">${esc(it.note)}</div>` : ""}</td>
        <td>${fmt(it.width_m)} × ${fmt(it.height_m)}${it.depth_m ? ` × ${fmt(it.depth_m)}` : ""} m<div class="basis">${esc(it.basis)}</div></td>
        <td>${fmt(it.area)}</td>
        <td class="right b">${fmt(it.cost)}</td>
      </tr>`).join("");

    const warnings = result.warnings.length > 0 ? `
      <div class="warn">
        <strong>Do potwierdzenia z klientem:</strong>
        <ul>${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      </div>` : "";

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
        tfoot td { background: ${C.ink}; color: ${C.paper}; font-weight: 800; font-size: 14px; padding: 11px 8px; }
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
        <div class="meta"><span>Nr oferty: ${esc(offerNo)}</span><span>Data: ${new Date().toLocaleDateString("pl-PL")}</span></div>
        <div class="meta-block">
          ${client ? `Dla: <strong>${esc(client)}</strong><br>` : ""}
          Cena materiału: ${fmt(result.p)} ${esc(unit)}/m²
        </div>
        <table>
          <thead><tr><td>Pozycja</td><td>Wymiary</td><td>m²</td><td class="right">Koszt</td></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>RAZEM</td><td></td><td>${fmt(result.totalArea)} m²</td><td class="right">${fmt(result.totalCost)} ${esc(unit)}</td></tr></tfoot>
        </table>
        ${warnings}
        <div class="foot">${result.items.some((i) => i.basis.startsWith("pełna")) ? "Wycena obejmuje powierzchnię obudowy (front, boki i górę)." : "Wycena obejmuje powierzchnię frontu obudowy."} Ceny netto, oferta ważna 14 dni.</div>
        <div class="sign"><span>Akceptacja klienta: ...................................</span><span>Data: ......................</span></div>
      </body></html>`;
  };

  // Pokazuje ofertę w oknie podglądu obok (iframe w artefakcie).
  const openPreview = () => {
    if (!result || result.items.length === 0) return;
    setError("");
    setShowPreview(true);
    setTimeout(() => {
      const ifr = iframeRef.current;
      if (ifr) {
        const d = ifr.contentDocument || ifr.contentWindow.document;
        d.open();
        d.write(buildHTML());
        d.close();
      }
    }, 50);
  };

  // Drukuje zawartość podglądu — w oknie druku wybierasz "Zapisz jako PDF".
  const printPreview = () => {
    setPdfLoading(true);
    try {
      const ifr = iframeRef.current;
      if (ifr && ifr.contentWindow) {
        ifr.contentWindow.focus();
        ifr.contentWindow.print();
      }
    } catch (err) {
      setError("Nie udało się otworzyć okna druku. Spróbuj ponownie.");
    } finally {
      setPdfLoading(false);
    }
  };

  const fmt = (n) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Helvetica Neue', Arial, sans-serif", padding: "32px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 16, marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>
            Wycena · front obudowy
          </div>
          <h1 style={{ fontSize: 32, margin: "6px 0 0", fontWeight: 800, letterSpacing: -0.5 }}>
            Kalkulator obudów kaloryferów
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: C.steel }}>
            Wklej maila lub wgraj rysunek. Liczę powierzchnię frontu (szer. × wys.) × cenę materiału za m².
          </p>
        </header>

        {/* Dane oferty */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 180px" }}>
            <div style={lbl}>Firma (nagłówek oferty)</div>
            <input value={company} onChange={(e) => setCompany(e.target.value)} style={inp} />
          </label>
          <label style={{ flex: "1 1 180px" }}>
            <div style={lbl}>Klient</div>
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="np. Jan Kowalski" style={inp} />
          </label>
          <label style={{ flex: "1 1 140px" }}>
            <div style={lbl}>Nr oferty</div>
            <input value={offerNo} onChange={(e) => setOfferNo(e.target.value)} style={inp} />
          </label>
        </div>

        {/* Cena */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 160px" }}>
            <div style={lbl}>Cena materiału za m²</div>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" style={inp} />
          </label>
          <label style={{ flex: "0 0 110px" }}>
            <div style={lbl}>Waluta</div>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} style={inp} />
          </label>
        </div>

        {/* Tryb liczenia powierzchni */}
        <div style={{ marginBottom: 20 }}>
          <div style={lbl}>Co liczymy</div>
          <div style={{ display: "flex", gap: 0 }}>
            {[
              ["auto", "Auto", "front, a gdy podano głębokość — pełna obudowa"],
              ["front", "Tylko front", "szer. × wys."],
              ["full", "Pełna obudowa", "front + boki + góra"],
            ].map(([k, label, desc], idx) => (
              <button key={k} onClick={() => recompute(k)} title={desc} style={{
                flex: 1, padding: "9px 4px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${C.ink}`, borderLeft: idx === 0 ? `1px solid ${C.ink}` : "none",
                background: surfaceMode === k ? C.ink : "transparent", color: surfaceMode === k ? C.paper : C.ink,
              }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.steel, marginTop: 5 }}>
            {surfaceMode === "auto" && "Front, a jeśli klient poda głębokość — liczona jest pełna obudowa (front + 2 boki + góra, bez tyłu i spodu)."}
            {surfaceMode === "front" && "Liczona tylko powierzchnia frontu: szerokość × wysokość."}
            {surfaceMode === "full" && "Pełna obudowa: front + 2 boki + góra. Wymaga podanej głębokości."}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 14 }}>
          {[["text", "Treść maila"], ["image", "Rysunek / zdjęcie"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${C.ink}`, borderRight: k === "text" ? "none" : `1px solid ${C.ink}`,
              background: tab === k ? C.ink : "transparent", color: tab === k ? C.paper : C.ink,
            }}>{label}</button>
          ))}
        </div>

        {tab === "text" ? (
          <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder={"np.\nDzień dobry, proszę o wycenę:\n- salon: 120 x 60 x 12 cm\n- kuchnia: 80x55\n- łazienka 500x400 mm"}
            style={{ ...inp, minHeight: 150, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
          />
        ) : (
          <div onClick={() => fileRef.current?.click()} style={{
            border: `2px dashed ${C.line}`, padding: 24, textAlign: "center", cursor: "pointer", background: "#fff",
          }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
            {image ? (
              <div>
                <img src={`data:${image.media_type};base64,${image.data}`} alt="rysunek" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }} />
                <div style={{ fontSize: 12, color: C.steel, marginTop: 8 }}>{image.name} · kliknij, by zmienić</div>
              </div>
            ) : (
              <div style={{ color: C.steel, fontSize: 14 }}>Kliknij, aby wgrać rysunek lub zdjęcie z wymiarami</div>
            )}
          </div>
        )}

        <button onClick={analyze} disabled={loading} style={{
          width: "100%", marginTop: 18, padding: "14px 0", fontSize: 15, fontWeight: 800, letterSpacing: 0.5,
          cursor: loading ? "wait" : "pointer", border: "none", background: C.brass, color: "#fff", textTransform: "uppercase",
        }}>
          {loading ? "Liczę…" : "Przelicz wycenę"}
        </button>

        {error && <div style={{ marginTop: 14, padding: 12, background: "#fff", borderLeft: `4px solid ${C.red}`, color: C.red, fontSize: 14 }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 26 }}>
            {result.items.length > 0 && (
              <div style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "10px 14px", borderBottom: `1px solid ${C.ink}`, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.steel }}>
                  <div>Pozycja</div><div>Wymiary</div><div>m²</div><div style={{ textAlign: "right" }}>Koszt</div>
                </div>
                {result.items.map((it, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "12px 14px", borderBottom: `1px solid ${C.line}`, fontSize: 14, alignItems: "center" }}>
                    <div style={{ fontWeight: 600 }}>{it.label || `Pozycja ${i + 1}`}{it.note && <div style={{ fontSize: 11, color: C.brass, fontWeight: 400 }}>{it.note}</div>}</div>
                    <div style={{ fontSize: 13 }}>
                      {fmt(it.width_m)}×{fmt(it.height_m)}{it.depth_m ? `×${fmt(it.depth_m)}` : ""} m
                      <div style={{ fontSize: 10, color: C.steel }}>{it.basis}</div>
                    </div>
                    <div>{fmt(it.area)}</div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>{fmt(it.cost)}</div>
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "14px", background: C.ink, color: C.paper, fontSize: 15, fontWeight: 800 }}>
                  <div>RAZEM</div><div></div><div>{fmt(result.totalArea)}</div>
                  <div style={{ textAlign: "right" }}>{fmt(result.totalCost)} {unit}</div>
                </div>
              </div>
            )}

            {result.items.length > 0 && (
              <button onClick={openPreview} style={{
                width: "100%", marginTop: 14, padding: "13px 0", fontSize: 14, fontWeight: 800, letterSpacing: 0.5,
                cursor: "pointer", border: `2px solid ${C.ink}`, background: C.green, color: "#fff", textTransform: "uppercase",
              }}>
                Pokaż ofertę →
              </button>
            )}

            {result.warnings.length > 0 && (
              <div style={{ marginTop: 14, padding: 12, background: "#fff", borderLeft: `4px solid ${C.brass}`, fontSize: 13, color: C.steel }}>
                <strong style={{ color: C.brass }}>Do sprawdzenia:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {result.warnings.map((w, i) => <li key={i} style={{ marginBottom: 3 }}>{w}</li>)}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: C.steel }}>
              Przeliczono przy cenie {fmt(result.p)} {unit}/m². Zweryfikuj odczyt wymiarów przed wysłaniem oferty.
            </div>
          </div>
        )}
      </div>

      {/* Panel podglądu oferty — okno obok */}
      {showPreview && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={() => setShowPreview(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,30,34,0.45)" }} />
          <div style={{ position: "relative", width: "min(620px, 94vw)", height: "100%", background: C.paper, boxShadow: "-8px 0 40px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `2px solid ${C.ink}`, background: C.paper }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Podgląd oferty</div>
              <button onClick={() => setShowPreview(false)} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: C.steel, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 16, background: "#9b958a" }}>
              <iframe
                ref={iframeRef}
                title="Podgląd oferty"
                style={{ width: "100%", minHeight: 760, border: "none", background: "#fff", boxShadow: "0 4px 18px rgba(0,0,0,0.25)" }}
              />
            </div>

            <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 10, background: C.paper }}>
              <button onClick={() => setShowPreview(false)} style={{
                flex: "0 0 auto", padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${C.ink}`, background: "transparent", color: C.ink,
              }}>Zamknij</button>
              <button onClick={printPreview} disabled={pdfLoading} style={{
                flex: 1, padding: "12px 0", fontSize: 14, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
                cursor: pdfLoading ? "wait" : "pointer", border: "none", background: C.green, color: "#fff",
              }}>{pdfLoading ? "Otwieram…" : "↓ Zapisz / drukuj PDF"}</button>
            </div>
            <div style={{ padding: "0 18px 12px", fontSize: 11, color: C.steel, background: C.paper }}>
              W oknie druku wybierz drukarkę „Zapisz jako PDF", aby pobrać plik dla klienta.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.steel, marginBottom: 4 };
const inp = { width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.line}`, background: "#fff", color: C.ink, boxSizing: "border-box", outline: "none" };
