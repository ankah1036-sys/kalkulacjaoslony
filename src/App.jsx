import { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import AuthScreen from "./views/AuthScreen.jsx";
import Calculator from "./views/Calculator.jsx";
import Quotes from "./views/Quotes.jsx";
import { COMPANY_NAME } from "./config.js";
import { C } from "./theme.js";

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { configured, loading, session, org, user, signOut } = useAuth();
  const [view, setView] = useState("calc"); // calc | quotes
  const [refreshKey, setRefreshKey] = useState(0);
  const [calcKey, setCalcKey] = useState(0); // bump = świeży kalkulator (remount)
  const [editingQuote, setEditingQuote] = useState(null);

  // „Nowa wycena": czysty kalkulator (bez trybu edycji).
  const goNewQuote = () => {
    setEditingQuote(null);
    setCalcKey((k) => k + 1);
    setView("calc");
  };
  // „Edytuj" z bazy: wczytaj wycenę do kalkulatora.
  const goEditQuote = (quote) => {
    setEditingQuote(quote);
    setCalcKey((k) => k + 1);
    setView("calc");
  };

  const page = (children) => (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Helvetica Neue', Arial, sans-serif", padding: "32px 20px" }}>
      {children}
    </div>
  );

  if (!configured) return <ConfigNotice />;
  if (loading) return page(<div style={{ maxWidth: 720, margin: "60px auto", color: C.steel }}>Wczytuję…</div>);
  if (!session) return <AuthScreen />;
  // Bez bramki „Załóż firmę" — po zalogowaniu od razu kalkulator.
  // O nazwę firmy pytamy dopiero przy pierwszym zapisie wyceny.

  return page(
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 0 }}>
          {[["calc", "Nowa wycena"], ["quotes", "Baza kalkulacji"]].map(([k, label], idx) => (
            <button
              key={k}
              onClick={() => (k === "calc" ? goNewQuote() : setView("quotes"))}
              style={{
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${C.ink}`,
                borderLeft: idx === 0 ? `1px solid ${C.ink}` : "none",
                background: view === k ? C.ink : "transparent",
                color: view === k ? C.paper : C.ink,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: C.steel }}>
          <span>
            <strong style={{ color: C.ink }}>{COMPANY_NAME}</strong> · {user.email}
          </span>
          <button onClick={signOut} style={{ border: `1px solid ${C.line}`, background: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.steel }}>
            Wyloguj
          </button>
        </div>
      </nav>

      {view === "calc" ? (
        <Calculator
          key={calcKey}
          editingQuote={editingQuote}
          onEditLoaded={() => setEditingQuote(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <Quotes key={refreshKey} onEdit={goEditQuote} />
      )}
    </div>
  );
}

// Ekran-instrukcja, gdy nie wpisano danych Supabase (VITE_SUPABASE_URL / ANON_KEY).
function ConfigNotice() {
  return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ width: "min(560px, 100%)", background: "#fff", border: `1px solid ${C.line}`, padding: 26 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>Konfiguracja</div>
        <h1 style={{ fontSize: 24, margin: "6px 0 10px", fontWeight: 800, color: C.ink }}>Połącz aplikację z Supabase</h1>
        <p style={{ margin: "0 0 14px", fontSize: 14, color: C.steel, lineHeight: 1.6 }}>
          Aby działało logowanie i baza kalkulacji, wpisz dwie wartości w pliku <code>.env</code>, a potem zrestartuj serwer aplikacji.
          Znajdziesz je w panelu Supabase: <strong>Project Settings → API</strong>.
        </p>
        <pre style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, fontSize: 13, overflow: "auto", color: C.ink }}>
{`VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
        </pre>
        <p style={{ margin: "12px 0 0", fontSize: 13, color: C.steel }}>
          <strong>URL</strong> = „Project URL", <strong>ANON_KEY</strong> = „anon public" (klucz publiczny, bezpieczny dzięki RLS).
        </p>
      </div>
    </div>
  );
}
