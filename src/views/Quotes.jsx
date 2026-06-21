import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { printOffer } from "../lib/offer.js";
import { C, lbl, inp, fmt } from "../theme.js";

export default function Quotes() {
  const { org } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("quotes")
      .select("id, offer_no, company_name, client_id, currency, total_area, total_cost, status, created_at, clients ( name )")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });
    if (error) setError("Nie udało się wczytać wycen: " + error.message);
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

  // Pobiera pełną wycenę (z pozycjami) i otwiera ofertę do druku/PDF.
  const openPdf = async (row) => {
    setBusyId(row.id);
    try {
      const { data: items } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", row.id);
      const result = {
        items: items || [],
        warnings: [],
        totalArea: row.total_area,
        totalCost: row.total_cost,
        p: 0,
      };
      // p (cena) potrzebne do nagłówka — odczytaj z quotes:
      const { data: full } = await supabase.from("quotes").select("price_per_m2, warnings").eq("id", row.id).single();
      result.p = full?.price_per_m2 || 0;
      result.warnings = full?.warnings || [];
      printOffer(result, {
        offerNo: row.offer_no,
        company: row.company_name,
        client: row.clients?.name || "",
        unit: row.currency,
      });
    } catch (e) {
      setError("Nie udało się otworzyć oferty: " + (e.message || ""));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Usunąć wycenę ${row.offer_no || ""}? Tej operacji nie można cofnąć.`)) return;
    setBusyId(row.id);
    const { error } = await supabase.from("quotes").delete().eq("id", row.id);
    setBusyId(null);
    if (error) setError("Nie udało się usunąć: " + error.message);
    else setRows((r) => r.filter((x) => x.id !== row.id));
  };

  const statusLabel = { draft: "Szkic", sent: "Wysłana", accepted: "Zaakceptowana", rejected: "Odrzucona" };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 16, marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>
          Historia · {org?.name}
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
            <div style={{ textAlign: "right" }}>Suma</div>
            <div style={{ textAlign: "right" }}>Akcje</div>
          </div>
          {filtered.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr 0.9fr 0.9fr 1.3fr", padding: "12px 14px", borderBottom: `1px solid ${C.line}`, fontSize: 14, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.offer_no || "—"}</div>
                <div style={{ fontSize: 11, color: C.steel }}>{new Date(r.created_at).toLocaleDateString("pl-PL")}</div>
              </div>
              <div style={{ fontSize: 13 }}>{r.clients?.name || <span style={{ color: C.line }}>—</span>}</div>
              <div style={{ fontSize: 12 }}>
                <span style={{ padding: "3px 8px", background: C.paper, border: `1px solid ${C.line}`, fontWeight: 700, color: C.steel }}>
                  {statusLabel[r.status] || r.status}
                </span>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700 }}>
                {fmt(r.total_cost)} {r.currency}
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
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
