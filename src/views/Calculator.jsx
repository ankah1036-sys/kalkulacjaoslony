import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { computeResult } from "../lib/calc.js";
import { parseDimensionsFromText } from "../lib/parseText.js";
import { readTextFromImage } from "../lib/ocr.js";
import { createOrganization } from "../lib/org.js";
import { buildOfferHTML, buildOfferEmailBody } from "../lib/offer.js";
import { COMPANY_NAME, COMPANY_EMAIL } from "../config.js";
import { toPolish } from "../lib/errors.js";
import { C, lbl, inp, fmt } from "../theme.js";

export default function Calculator({ onSaved, editingQuote, onEditLoaded }) {
  const { org, user, refreshOrg } = useAuth();
  // Gdy edytujemy zapisaną wycenę — trzymamy jej id (zapis nadpisze, nie doda nowej).
  const [editId, setEditId] = useState(null);
  const [origClientId, setOrigClientId] = useState(null);
  const [origClientName, setOrigClientName] = useState("");
  const [tab, setTab] = useState("text"); // text | image
  const [emailText, setEmailText] = useState("");
  const [image, setImage] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  // Cena zależy od użytego materiału — podaje się ją przy każdej wycenie, nic nie podpowiadamy.
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("PLN");
  const [vatRate, setVatRate] = useState("23"); // "23" | "8" | "5" | "0" | "custom"
  const [vatCustom, setVatCustom] = useState(""); // własna stawka, gdy vatRate === "custom"
  const [surfaceMode, setSurfaceMode] = useState("auto"); // auto | front | full
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [client, setClient] = useState("");
  const [offerNo, setOfferNo] = useState(() => "OF/" + new Date().toISOString().slice(0, 10).replace(/-/g, "/"));
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);
  const iframeRef = useRef(null);

  const meta = { offerNo, company: COMPANY_NAME, client, unit };

  // Wczytanie zapisanej wyceny do edycji: wypełnia pola i przelicza wynik z zapisanych wymiarów.
  useEffect(() => {
    if (!editingQuote) return;
    const q = editingQuote;
    const rate = Number(q.vat_rate) || 0;
    const mode = q.surface_mode || "auto";
    const p = parseFloat(String(q.price_per_m2).replace(",", ".")) || 0;

    setEditId(q.id);
    setOrigClientId(q.client_id || null);
    setOrigClientName(q.client_name || "");
    setPrice(q.price_per_m2 != null ? String(q.price_per_m2) : "");
    setUnit(q.currency || "PLN");
    setOfferNo(q.offer_no || "");
    setClient(q.client_name || "");
    setSurfaceMode(mode);
    if (["23", "8", "5", "0"].includes(String(rate))) {
      setVatRate(String(rate));
      setVatCustom("");
    } else {
      setVatRate("custom");
      setVatCustom(String(rate));
    }
    const rawItems = (q.items || []).map((it) => ({
      label: it.label,
      width_m: it.width_m,
      height_m: it.height_m,
      depth_m: it.depth_m,
      note: it.note,
    }));
    setResult(computeResult(rawItems, [], p, mode, rate));
    setSaved(false);
    setTab("text");
    onEditLoaded?.(); // wyczyść w rodzicu, żeby nie wczytywać ponownie
    if (typeof window !== "undefined") window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingQuote]);

  const cancelEdit = () => {
    setEditId(null);
    setOrigClientId(null);
    setOrigClientName("");
    setResult(null);
    setClient("");
    setEmailText("");
    setImage(null);
    setSaved(false);
    setError("");
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage({ data: reader.result.split(",")[1], media_type: f.type, name: f.name });
    reader.readAsDataURL(f);
  };

  // Stawka VAT jako liczba (obsługuje przecinek i własną wartość).
  const vatNum = () => {
    const raw = vatRate === "custom" ? vatCustom : vatRate;
    const v = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };

  // Przelicza istniejący wynik dla podanego trybu i stawki VAT (bez ponownego czytania maila/zdjęcia).
  const rebuild = (mode, vat) => {
    if (!result) return;
    const base = result.warnings.filter((w) => !w.includes("policzono sam front"));
    setResult(computeResult(result.items, base, result.p, mode, vat));
    setSaved(false);
  };

  const recompute = (mode) => {
    setSurfaceMode(mode);
    rebuild(mode, vatNum());
  };

  // Zmiana stawki VAT ma od razu odświeżyć kwoty (bez klikania „Przelicz").
  const changeVat = (nextRate, nextCustom = vatCustom) => {
    setVatRate(nextRate);
    setVatCustom(nextCustom);
    const raw = nextRate === "custom" ? nextCustom : nextRate;
    const v = parseFloat(String(raw).replace(",", "."));
    rebuild(surfaceMode, Number.isFinite(v) && v >= 0 ? v : 0);
  };

  // Otwiera program pocztowy z gotowym adresem, tematem i treścią oferty.
  const sendOffer = (to) => {
    if (!result) return;
    const subject = `Oferta ${offerNo} — ${COMPANY_NAME}`;
    const body = buildOfferEmailBody(result, { offerNo, unit });
    window.location.href = `mailto:${to || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const clientIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(client.trim());

  const analyze = async () => {
    setError("");
    setResult(null);
    setSaved(false);
    const p = parseFloat(price.replace(",", "."));
    if (!p || p <= 0) return setError("Podaj poprawną cenę materiału za m².");
    if (tab === "text" && !emailText.trim()) return setError("Wklej treść maila z wymiarami.");
    if (tab === "image" && !image) return setError("Wgraj zdjęcie lub rysunek z wymiarami.");

    // Treść maila: odczyt lokalny — bez API, natychmiast i bez kosztów.
    if (tab === "text") {
      const parsed = parseDimensionsFromText(emailText);
      setResult(computeResult(parsed.items, parsed.warnings, p, surfaceMode, vatNum()));
      return;
    }

    // Rysunek/zdjęcie: OCR w przeglądarce — 0 zł, bez klucza, zdjęcie nie opuszcza komputera.
    setLoading(true);
    setOcrProgress(0);
    try {
      const dataUrl = `data:${image.media_type};base64,${image.data}`;
      const text = await readTextFromImage(dataUrl, setOcrProgress);

      if (!text.trim()) {
        setError(
          "Nie udało się odczytać żadnego tekstu z tego zdjęcia. Zdjęcie musi być wyraźne, a wymiary pisane drukiem — " +
            "pismo odręczne nie zostanie rozpoznane. Możesz też przepisać wymiary w zakładce „Treść maila”."
        );
        return;
      }

      const parsed = parseDimensionsFromText(text);
      const warnings = [...parsed.warnings];
      if (parsed.items.length > 0) {
        warnings.unshift("Wymiary odczytano automatycznie ze zdjęcia — sprawdź je, zanim wyślesz ofertę klientowi.");
      }
      setResult(computeResult(parsed.items, warnings, p, surfaceMode, vatNum()));
    } catch (err) {
      setError("Nie udało się odczytać zdjęcia. " + toPolish(err, "Spróbuj ponownie lub przepisz wymiary ręcznie."));
    } finally {
      setLoading(false);
      setOcrProgress(0);
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
    if (!result || result.items.length === 0) return;
    setError("");

    setSaving(true);
    try {
      // Jedna firma: RELF. Zakładamy ją w tle przy pierwszym zapisie — bez pytania.
      let activeOrg = org;
      if (!activeOrg) {
        activeOrg = await createOrganization(COMPANY_NAME, user.id);
        await refreshOrg();
      }

      // Klient: nie duplikujemy wpisu, gdy nazwa się nie zmieniła (przy edycji).
      let clientId = origClientId;
      if (client.trim() !== (origClientName || "").trim()) {
        clientId = null;
        if (client.trim()) {
          const { data: cli } = await supabase
            .from("clients")
            .insert({ org_id: activeOrg.id, name: client.trim() })
            .select("id")
            .single();
          clientId = cli?.id || null;
        }
      }

      const payload = {
        client_id: clientId,
        offer_no: offerNo,
        company_name: COMPANY_NAME,
        price_per_m2: result.p,
        currency: unit,
        vat_rate: result.vatRate,
        surface_mode: result.mode,
        total_area: result.totalArea,
        total_cost: result.totalNet,
        warnings: result.warnings,
      };

      let quoteId = editId;
      if (editId) {
        // Edycja: nadpisujemy wycenę i podmieniamy jej pozycje. Autor (kto zapisał) zostaje bez zmian.
        const { error: uErr } = await supabase.from("quotes").update(payload).eq("id", editId);
        if (uErr) throw uErr;
        const { error: dErr } = await supabase.from("quote_items").delete().eq("quote_id", editId);
        if (dErr) throw dErr;
      } else {
        const { data: quote, error: qErr } = await supabase
          .from("quotes")
          .insert({
            ...payload,
            org_id: activeOrg.id,
            created_by: user.id,
            created_by_email: user.email,
            status: "draft",
          })
          .select("id")
          .single();
        if (qErr) throw qErr;
        quoteId = quote.id;
      }

      const items = result.items.map((it) => ({
        quote_id: quoteId,
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
      setError("Nie udało się zapisać wyceny. " + toPolish(err, "Spróbuj ponownie."));
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
        <h1 style={{ fontSize: 32, margin: "6px 0 0", fontWeight: 800, letterSpacing: -0.5 }}>
          {editId ? "Edytujesz wycenę" : "Nowa wycena"}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: C.steel }}>
          {editId
            ? "Zmień co trzeba i zapisz — nadpiszesz istniejącą wycenę. Aby zmienić wymiary, wklej je ponownie i kliknij „Przelicz”."
            : "Wpisz cenę, wklej maila lub wgraj rysunek — policz. Dane klienta podasz dopiero przy zapisie."}
        </p>
        {editId && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.brass, background: "#faf3e6", border: `1px solid ${C.brass}`, padding: "4px 10px" }}>
              Tryb edycji · {offerNo || "wycena"}
            </span>
            <button
              onClick={cancelEdit}
              style={{ border: `1px solid ${C.line}`, background: "#fff", padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.steel }}
            >
              Anuluj edycję
            </button>
          </div>
        )}
      </header>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 150px" }}>
          <div style={lbl}>Cena netto za m²</div>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="np. 180"
            style={inp}
          />
        </label>
        <label style={{ flex: "0 0 90px" }}>
          <div style={lbl}>Waluta</div>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} style={inp} />
        </label>
        <label style={{ flex: "0 0 110px" }}>
          <div style={lbl}>Stawka VAT</div>
          <select value={vatRate} onChange={(e) => changeVat(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            <option value="23">23%</option>
            <option value="8">8%</option>
            <option value="5">5%</option>
            <option value="0">0%</option>
            <option value="custom">Inna…</option>
          </select>
        </label>
        {vatRate === "custom" && (
          <label style={{ flex: "0 0 110px" }}>
            <div style={lbl}>Własna (%)</div>
            <input
              value={vatCustom}
              onChange={(e) => changeVat("custom", e.target.value)}
              inputMode="decimal"
              placeholder="np. 8"
              style={inp}
            />
          </label>
        )}
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
        <>
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
          <div style={{ marginTop: 8, padding: "8px 12px", background: "#faf3e6", border: `1px solid ${C.brass}`, fontSize: 12, color: C.steel, lineHeight: 1.5 }}>
            <strong style={{ color: C.brass }}>Wskazówka:</strong> jeśli to mail na komputerze, <strong>skopiuj tekst</strong> i wklej w zakładkę
            „Treść maila" — działa pewniej niż zdjęcie. Zdjęcia sprawdzają się dla wyraźnych <strong>wydruków i skanów</strong>;
            fotki ekranu bywają nieczytelne dla programu.
          </div>
        </>
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
        {/* OCR trwa kilkanaście sekund — bez postępu wyglądałoby to na zawieszenie. */}
        {loading ? (ocrProgress > 0 ? `Odczytuję zdjęcie… ${ocrProgress}%` : "Liczę…") : "Przelicz wycenę"}
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
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr", padding: "12px 14px", borderTop: `1px solid ${C.line}`, fontSize: 14 }}>
                <div style={{ fontWeight: 600 }}>Razem netto</div>
                <div></div>
                <div>{fmt(result.totalArea)}</div>
                <div style={{ textAlign: "right", fontWeight: 700 }}>{fmt(result.totalNet)} {unit}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${C.line}`, fontSize: 14, color: C.steel }}>
                <span>VAT {fmt(result.vatRate)}%</span>
                <span style={{ fontWeight: 700 }}>{fmt(result.vatAmount)} {unit}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px", background: C.ink, color: C.paper, fontSize: 16, fontWeight: 800 }}>
                <span>Do zapłaty (brutto)</span>
                <span>{fmt(result.totalGross)} {unit}</span>
              </div>
            </div>
          )}

          {/* Dane do oferty pojawiają się dopiero po przeliczeniu — wypełniasz je, gdy wynik Ci pasuje. */}
          {result.items.length > 0 && (
            <div style={{ marginTop: 20, background: "#fff", border: `1px solid ${C.line}`, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.steel, marginBottom: 12 }}>
                Dane do oferty
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ flex: "2 1 220px" }}>
                  <div style={lbl}>Klient (e-mail lub nazwa)</div>
                  <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="np. jan@firma.pl" style={inp} />
                </label>
                <label style={{ flex: "1 1 140px" }}>
                  <div style={lbl}>Nr oferty</div>
                  <input value={offerNo} onChange={(e) => setOfferNo(e.target.value)} style={inp} />
                </label>
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
                {saving ? "Zapisuję…" : saved ? "✓ Zapisano w bazie" : editId ? "Zapisz zmiany" : "Zapisz wycenę"}
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

          {result.items.length > 0 && (
            <div style={{ marginTop: 14, background: "#fff", border: `1px solid ${C.line}`, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.steel, marginBottom: 10 }}>
                Wyślij ofertę mailem
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => sendOffer(client.trim())}
                  disabled={!clientIsEmail}
                  title={clientIsEmail ? "" : "Wpisz e-mail klienta w polu „Klient” powyżej"}
                  style={{ flex: "1 1 200px", padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: clientIsEmail ? "pointer" : "not-allowed", border: `1px solid ${C.ink}`, background: clientIsEmail ? "#fff" : C.paper, color: clientIsEmail ? C.ink : C.line }}
                >
                  ✉ Do klienta
                </button>
                <button
                  onClick={() => sendOffer(COMPANY_EMAIL)}
                  style={{ flex: "1 1 200px", padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${C.ink}`, background: "#fff", color: C.ink }}
                >
                  ✉ Do biura RELF
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: C.steel, lineHeight: 1.5 }}>
                Otworzy Twój program pocztowy z gotową treścią. <strong>PDF dołącz ręcznie</strong> — wcześniej zapisz go przez „Pokaż ofertę → Zapisz / drukuj PDF".
              </div>
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
