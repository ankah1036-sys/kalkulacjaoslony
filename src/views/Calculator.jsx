import { useState, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { computeResult } from "../lib/calc.js";
import { buildOfferHTML } from "../lib/offer.js";
import { C, lbl, inp, fmt } from "../theme.js";

export default function Calculator({ onSaved }) {
  const { org, user } = useAuth();
  const [tab, setTab] = useState("text"); // text | image
  const [emailText, setEmailText] = useState("");
  const [image, setImage] = useState(null);
  const [price, setPrice] = useState(org?.default_price != null ? String(org.default_price) : "180");
  const [unit, setUnit] = useState(org?.default_currency || "PLN");
  const [surfaceMode, setSurfaceMode] = useState("auto"); // auto | front | full
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [company, setCompany] = useState(org?.name || "");
  const [client, setClient] = useState("");
  const [offerNo, setOfferNo] = useState(() => "OF/" + new Date().toISOString().slice(0, 10).replace(/-/g, "/"));
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);
  const iframeRef = useRef(null);

  const meta = { offerNo, company, client, unit };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage({ data: reader.result.split(",")[1], media_type: f.type, name: f.name });
    reader.readAsDataURL(f);
  };

  const recompute = (mode) => {
    setSurfaceMode(mode);
    if (result) {
      const base = result.warnings.filter((w) => !w.includes("policzono sam front"));
      setResult(computeResult(result.items, base, result.p, mode));
      setSaved(false);
    }
  };

  const analyze = async () => {
    setError("");
    setResult(null);
    setSaved(false);
    const p = parseFloat(price.replace(",", "."));
    if (!p || p <= 0) return setError("Podaj poprawną cenę materiału za m².");
    if (tab === "text" && !emailText.trim()) return setError("Wklej treść maila z wymiarami.");
    if (tab === "image" && !image) return setError("Wgraj zdjęcie lub rysunek z wymiarami.");
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

  const openPreview = () => {
    if (!result || result.items.length === 0) return;
    setError("");
    setShowPreview(true);
    setTimeout(() => {
      const ifr = iframeRef.current;
      if (ifr) {
        const d = ifr.contentDocument || ifr.contentWindow.document;
        d.open();
        d.write(buildOfferHTML(result, meta));
        d.close();
      }
    }, 50);
  };

  const printPreview = () => {
    setPdfLoading(true);
    try {
      const ifr = iframeRef.current;
      if (ifr && ifr.contentWindow) {
        ifr.contentWindow.focus();
        ifr.contentWindow.print();
      }
    } catch {
      setError("Nie udało się otworzyć okna druku. Spróbuj ponownie.");
    } finally {
      setPdfLoading(false);
    }
  };

  // Zapis wyceny do bazy (firma + autor + pozycje).
  const saveQuote = async () => {
    if (!result || result.items.length === 0 || !org) return;
    setSaving(true);
    setError("");
    try {
      let clientId = null;
      if (client.trim()) {
        const { data: cli } = await supabase
          .from("clients")
          .insert({ org_id: org.id, name: client.trim() })
          .select("id")
          .single();
        clientId = cli?.id || null;
      }

      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          org_id: org.id,
          created_by: user.id,
          client_id: clientId,
          offer_no: offerNo,
          company_name: company,
          price_per_m2: result.p,
          currency: unit,
          surface_mode: result.mode,
          total_area: result.totalArea,
          total_cost: result.totalCost,
          status: "draft",
          warnings: result.warnings,
        })
        .select("id")
        .single();
      if (qErr) throw qErr;

      const items = result.items.map((it) => ({
        quote_id: quote.id,
        label: it.label || null,
        width_m: it.width_m ?? null,
        height_m: it.height_m ?? null,
        depth_m: it.depth_m ?? null,
        area: it.area,
        basis: it.basis,
        cost: it.cost,
        note: it.note || null,
      }));
      const { error: iErr } = await supabase.from("quote_items").insert(items);
      if (iErr) throw iErr;

      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError("Nie udało się zapisać wyceny: " + (err.message || "błąd"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 16, marginBottom: 28 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>
          Wycena · obudowy kaloryferów
        </div>
        <h1 style={{ fontSize: 32, margin: "6px 0 0", fontWeight: 800, letterSpacing: -0.5 }}>Nowa wycena</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: C.steel }}>
          Wklej maila lub wgraj rysunek. Liczę powierzchnię × cenę materiału za m².
        </p>
      </header>

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

      <div style={{ marginBottom: 20 }}>
        <div style={lbl}>Co liczymy</div>
        <div style={{ display: "flex", gap: 0 }}>
          {[
            ["auto", "Auto"],
            ["front", "Tylko front"],
            ["full", "Pełna obudowa"],
          ].map(([k, label], idx) => (
            <button
              key={k}
              onClick={() => recompute(k)}
              style={{
                flex: 1,
                padding: "9px 4px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${C.ink}`,
                borderLeft: idx === 0 ? `1px solid ${C.ink}` : "none",
                background: surfaceMode === k ? C.ink : "transparent",
                color: surfaceMode === k ? C.paper : C.ink,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.steel, marginTop: 5 }}>
          {surfaceMode === "auto" && "Front, a jeśli klient poda głębokość — pełna obudowa (front + 2 boki + góra)."}
          {surfaceMode === "front" && "Liczona tylko powierzchnia frontu: szerokość × wysokość."}
          {surfaceMode === "full" && "Pełna obudowa: front + 2 boki + góra. Wymaga podanej głębokości."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 14 }}>
        {[["text", "Treść maila"], ["image", "Rysunek / zdjęcie"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: `1px solid ${C.ink}`,
              borderRight: k === "text" ? "none" : `1px solid ${C.ink}`,
              background: tab === k ? C.ink : "transparent",
              color: tab === k ? C.paper : C.ink,
            }}
          >
            {label}
          </button>
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
        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${C.line}`, padding: 24, textAlign: "center", cursor: "pointer", background: "#fff" }}
        >
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

      <button
        onClick={analyze}
        disabled={loading}
        style={{
          width: "100%",
          marginTop: 18,
          padding: "14px 0",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 0.5,
          cursor: loading ? "wait" : "pointer",
          border: "none",
          background: C.brass,
          color: "#fff",
          textTransform: "uppercase",
        }}
      >
        {loading ? "Liczę…" : "Przelicz wycenę"}
      </button>

      {error && <div style={{ marginTop: 14, padding: 12, background: "#fff", borderLeft: `4px solid ${C.red}`, color: C.red, fontSize: 14 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 26 }}>
          {result.items.length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${C.line}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "10px 14px", borderBottom: `1px solid ${C.ink}`, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.steel }}>
                <div>Pozycja</div>
                <div>Wymiary</div>
                <div>m²</div>
                <div style={{ textAlign: "right" }}>Koszt</div>
              </div>
              {result.items.map((it, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "12px 14px", borderBottom: `1px solid ${C.line}`, fontSize: 14, alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>
                    {it.label || `Pozycja ${i + 1}`}
                    {it.note && <div style={{ fontSize: 11, color: C.brass, fontWeight: 400 }}>{it.note}</div>}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {fmt(it.width_m)}×{fmt(it.height_m)}
                    {it.depth_m ? `×${fmt(it.depth_m)}` : ""} m
                    <div style={{ fontSize: 10, color: C.steel }}>{it.basis}</div>
                  </div>
                  <div>{fmt(it.area)}</div>
                  <div style={{ textAlign: "right", fontWeight: 700 }}>{fmt(it.cost)}</div>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "14px", background: C.ink, color: C.paper, fontSize: 15, fontWeight: 800 }}>
                <div>RAZEM</div>
                <div></div>
                <div>{fmt(result.totalArea)}</div>
                <div style={{ textAlign: "right" }}>{fmt(result.totalCost)} {unit}</div>
              </div>
            </div>
          )}

          {result.items.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                onClick={saveQuote}
                disabled={saving || saved}
                style={{
                  flex: "1 1 200px",
                  padding: "13px 0",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  cursor: saving ? "wait" : saved ? "default" : "pointer",
                  border: `2px solid ${C.ink}`,
                  background: saved ? C.steel : C.ink,
                  color: "#fff",
                  textTransform: "uppercase",
                }}
              >
                {saving ? "Zapisuję…" : saved ? "✓ Zapisano w bazie" : "Zapisz wycenę"}
              </button>
              <button
                onClick={openPreview}
                style={{
                  flex: "1 1 200px",
                  padding: "13px 0",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  cursor: "pointer",
                  border: `2px solid ${C.ink}`,
                  background: C.green,
                  color: "#fff",
                  textTransform: "uppercase",
                }}
              >
                Pokaż ofertę →
              </button>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: "#fff", borderLeft: `4px solid ${C.brass}`, fontSize: 13, color: C.steel }}>
              <strong style={{ color: C.brass }}>Do sprawdzenia:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {result.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showPreview && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={() => setShowPreview(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,30,34,0.45)" }} />
          <div style={{ position: "relative", width: "min(620px, 94vw)", height: "100%", background: C.paper, boxShadow: "-8px 0 40px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `2px solid ${C.ink}`, background: C.paper }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Podgląd oferty</div>
              <button onClick={() => setShowPreview(false)} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: C.steel, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16, background: "#9b958a" }}>
              <iframe ref={iframeRef} title="Podgląd oferty" style={{ width: "100%", minHeight: 760, border: "none", background: "#fff", boxShadow: "0 4px 18px rgba(0,0,0,0.25)" }} />
            </div>
            <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 10, background: C.paper }}>
              <button onClick={() => setShowPreview(false)} style={{ flex: "0 0 auto", padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${C.ink}`, background: "transparent", color: C.ink }}>Zamknij</button>
              <button onClick={printPreview} disabled={pdfLoading} style={{ flex: 1, padding: "12px 0", fontSize: 14, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", cursor: pdfLoading ? "wait" : "pointer", border: "none", background: C.green, color: "#fff" }}>{pdfLoading ? "Otwieram…" : "↓ Zapisz / drukuj PDF"}</button>
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
