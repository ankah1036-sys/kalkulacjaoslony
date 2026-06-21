import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { C, lbl, inp, btnPrimary } from "../theme.js";

export default function Onboarding() {
  const { user, refreshOrg, signOut } = useAuth();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("180");
  const [currency, setCurrency] = useState("PLN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Podaj nazwę firmy.");
      return;
    }
    setBusy(true);
    try {
      // 1) Utwórz firmę.
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({
          name: name.trim(),
          default_price: parseFloat(String(price).replace(",", ".")) || null,
          default_currency: currency.trim() || "PLN",
        })
        .select()
        .single();
      if (orgErr) throw orgErr;

      // 2) Dodaj siebie jako admina firmy.
      const { error: memErr } = await supabase
        .from("memberships")
        .insert({ org_id: org.id, user_id: user.id, role: "admin" });
      if (memErr) throw memErr;

      await refreshOrg();
    } catch (err) {
      setError(err.message || "Nie udało się utworzyć firmy.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ width: "min(440px, 100%)" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>
          Krok 1 z 1 · Twoja firma
        </div>
        <h1 style={{ fontSize: 26, margin: "6px 0 4px", fontWeight: 800, color: C.ink }}>Załóż firmę</h1>
        <p style={{ margin: "0 0 22px", fontSize: 14, color: C.steel }}>
          Wyceny i klienci będą przypisani do firmy. Możesz później zaprosić zespół. Stajesz się administratorem.
        </p>

        <form onSubmit={create} style={{ background: "#fff", border: `1px solid ${C.line}`, padding: 22 }}>
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={lbl}>Nazwa firmy</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Wolf Meble" style={inp} />
          </label>
          <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <label style={{ flex: 1 }}>
              <div style={lbl}>Domyślna cena za m²</div>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" style={inp} />
            </label>
            <label style={{ flex: "0 0 110px" }}>
              <div style={lbl}>Waluta</div>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} style={inp} />
            </label>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: 10, background: "#fff", borderLeft: `4px solid ${C.red}`, color: C.red, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} style={{ ...btnPrimary, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Tworzę…" : "Utwórz firmę i przejdź dalej"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: C.steel }}>
          Zalogowano jako {user?.email}.{" "}
          <button onClick={signOut} style={{ border: "none", background: "transparent", color: C.brass, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            Wyloguj
          </button>
        </div>
      </div>
    </div>
  );
}
