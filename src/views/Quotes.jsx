import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { buildOfferHTML } from "../lib/offer.js";
import { toPolish } from "../lib/errors.js";
import { COMPANY_NAME } from "../config.js";
import { C, lbl, inp, fmt } from "../theme.js";

export default function Quotes({ onEdit }) {
  const { org } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [previewHTML, setPreviewHTML] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const iframeRef = useRef(null);

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("quotes")
      .select("id, offer_no, company_name, client_id, currency, vat_rate, total_area, total_cost, status, created_at, created_by_email, clients ( name )")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });
    if (error) setError("Nie udało się wczytać wycen. " + toPolish(error, "Spróbuj odświeżyć stronę."));
    else setRows(data || []);
    setLoading(false);
  }, [org]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const hay = `${r.offer_no || ""} ${r.company_name || ""} ${r.clients?.name || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  // Pobiera pełną wycenę (z pozycjami) i pokazuje ofertę w podglądzie (do zapisu PDF).
  const openPdf = async (row) => {
    setBusyId(row.id);
    setError("");
    try {
      const { data: items } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", row.id);
      // Cena, stawka VAT i ostrzeżenia — odczytaj z quotes:
      const { data: full } = await supabase
        .from("quotes")
        .select("price_per_m2, vat_rate, warnings")
        .eq("id", row.id)
        .single();
      const net = Number(row.total_cost) || 0;
      const rate = Number(full?.vat_rate) || 0;
      const vatAmount = net * (rate / 100);
      const result = {
        items: items || [],
        warnings: full?.warnings || [],
        totalArea: row.total_area,
        totalCost: net,
        totalNet: net,
        vatRate: rate,
        vatAmount,
        totalGross: net + vatAmount,
        p: full?.price_per_m2 || 0,
      };
      const html = buildOfferHTML(result, {
        offerNo: row.offer_no,
        company: COMPANY_NAME,
        client: row.clients?.name || "",
        unit: row.currency,
      });
      setPreviewHTML(html);
      setShowPreview(true);
    } catch (e) {
      setError("Nie udało się otworzyć oferty. " + toPolish(e, "Spróbuj ponownie."));
    } finally {
      setBusyId(null);
    }
  };

  // Druk/zapis PDF z podglądu (użytkownik wybiera „Zapisz jako PDF" w oknie druku).
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

  // Wczytuje wycenę (z pozycjami) do kalkulatora, żeby ją edytować.
  const edit = async (row) => {
    setBusyId(row.id);
    try {
      const { data: items } = await supabase
        .from("quote_items")
        .select("label, width_m, height_m, depth_m, note")
        .eq("quote_id", row.id);
      const { data: full } = await supabase
        .from("quotes")
        .select("price_per_m2, vat_rate, currency, surface_mode")
        .eq("id", row.id)
        .single();
      onEdit?.({
        id: row.id,
        offer_no: row.offer_no,
        client_id: row.client_id,
        client_name: row.clients?.name || "",
        price_per_m2: full?.price_per_m2,
        vat_rate: full?.vat_rate,
        currency: full?.currency || "PLN",
        surface_mode: full?.surface_mode || "auto",
        items: items || [],
      });
    } catch (e) {
      setError("Nie udało się wczytać wyceny do edycji. " + toPolish(e, "Spróbuj ponownie."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Usunąć wycenę ${row.offer_no || ""}? Tej operacji nie można cofnąć.`)) return;
    setBusyId(row.id);
    const { error } = await supabase.from("quotes").delete().eq("id", row.id);
    setBusyId(null);
    if (error) setError("Nie udało się usunąć wyceny. " + toPolish(error, "Spróbuj ponownie."));
    else setRows((r) => r.filter((x) => x.id !== row.id));
  };

  const statusLabel = { draft: "Szkic", sent: "Wysłana", accepted: "Zaakceptowana", rejected: "Odrzucona" };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 16, marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>
          Historia · {COMPANY_NAME}
        </div>
        <h1 style={{ fontSize: 32, margin: "6px 0 0", fontWeight: 800, letterSpacing: -0.5 }}>Baza kalkulacji</h1>
      </header>

      <div style={{ marginBottom: 16 }}>
        <div style={lbl}>Szukaj (nr oferty, firma, klient)</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="np. OF/2026 lub Kowalski" style={inp} />
      </div>

      {error && <div style={{ marginBottom: 14, padding: 12, background: "#fff", borderLeft: `4px solid ${C.red}`, color: C.red, fontSize: 14 }}>{error}</div>}

      {loading ? (
        <div style={{ color: C.steel, padding: "30px 0" }}>Wczytuję…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#fff", border: `1px dashed ${C.line}`, padding: 30, textAlign: "center", color: C.steel }}>
          {rows.length === 0 ? "Brak zapisanych wycen. Przelicz wycenę i kliknij „Zapisz wycenę” w kalkulatorze." : "Brak wyników dla tego wyszukiwania."}
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${C.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr 0.9fr 0.9fr 1.3fr", padding: "10px 14px", borderBottom: `1px solid ${C.ink}`, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.steel }}>
            <div>Nr / data</div>
            <div>Klient</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Suma (brutto)</div>
            <div style={{ textAlign: "right" }}>Akcje</div>
          </div>
          {filtered.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr 0.9fr 0.9fr 1.3fr", padding: "12px 14px", borderBottom: `1px solid ${C.line}`, fontSize: 14, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.offer_no || "—"}</div>
                <div style={{ fontSize: 11, color: C.steel }}>{new Date(r.created_at).toLocaleDateString("pl-PL")}</div>
                {r.created_by_email && (
                  <div style={{ fontSize: 10, color: C.line }}>zapisał: {r.created_by_email}</div>
                )}
              </div>
              <div style={{ fontSize: 13 }}>{r.clients?.name || <span style={{ color: C.line }}>—</span>}</div>
              <div style={{ fontSize: 12 }}>
                <span style={{ padding: "3px 8px", background: C.paper, border: `1px solid ${C.line}`, fontWeight: 700, color: C.steel }}>
                  {statusLabel[r.status] || r.status}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{fmt(Number(r.total_cost) * (1 + (Number(r.vat_rate) || 0) / 100))} {r.currency}</div>
                <div style={{ fontSize: 11, color: C.steel }}>brutto · netto {fmt(r.total_cost)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => edit(r)} disabled={busyId === r.id} style={miniBtn(C.steel)}>
                  Edytuj
                </button>
                <button onClick={() => openPdf(r)} disabled={busyId === r.id} style={miniBtn(C.green)}>
                  {busyId === r.id ? "…" : "PDF"}
                </button>
                <button onClick={() => remove(r)} disabled={busyId === r.id} style={miniBtn(C.red)}>
                  Usuń
                </button>
              </div>
            </div>
          ))}
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
              <iframe ref={iframeRef} title="Podgląd oferty" srcDoc={previewHTML} style={{ width: "100%", minHeight: 760, border: "none", background: "#fff", boxShadow: "0 4px 18px rgba(0,0,0,0.25)" }} />
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

const miniBtn = (bg) => ({
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 700,
  border: "none",
  background: bg,
  color: "#fff",
  cursor: "pointer",
});
