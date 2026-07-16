import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { toPolish } from "../lib/errors.js";
import { C, lbl, inp, btnPrimary } from "../theme.js";

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Podaj adres e-mail.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("To nie wygląda na poprawny adres e-mail. Sprawdź, czy nie ma literówki.");
      return;
    }
    if (!password) {
      setError("Podaj hasło.");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setError("Hasło musi mieć co najmniej 6 znaków.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || email.trim() } },
        });
        if (error) throw error;
        // Gdy włączone potwierdzanie e-mail — sesji jeszcze nie ma.
        if (!data.session) {
          setInfo("Konto utworzone. Sprawdź e-mail, aby potwierdzić, a potem zaloguj się.");
          setMode("login");
        }
      }
    } catch (err) {
      setError(toPolish(err));
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
      <div style={{ width: "min(420px, 100%)" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.brass, fontWeight: 700 }}>
          Kalkulator osłon kaloryferów
        </div>
        <h1 style={{ fontSize: 28, margin: "6px 0 4px", fontWeight: 800, color: C.ink }}>
          {mode === "login" ? "Zaloguj się" : "Załóż konto"}
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 14, color: C.steel }}>
          {mode === "login" ? "Wpisz dane, aby wejść do swoich wycen." : "Utwórz konto, by zapisywać wyceny."}
        </p>

        {/* noValidate — sprawdzamy sami, żeby komunikaty były po polsku, a nie w języku przeglądarki. */}
        <form onSubmit={submit} noValidate style={{ background: "#fff", border: `1px solid ${C.line}`, padding: 22 }}>
          {mode === "register" && (
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={lbl}>Imię i nazwisko</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Anna Kowalska" style={inp} />
            </label>
          )}
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={lbl}>E-mail</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inp} />
          </label>
          <label style={{ display: "block", marginBottom: 18 }}>
            <div style={lbl}>Hasło</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={inp}
            />
          </label>

          {error && (
            <div style={{ marginBottom: 14, padding: 10, background: "#fff", borderLeft: `4px solid ${C.red}`, color: C.red, fontSize: 13 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ marginBottom: 14, padding: 10, background: "#f3f7f3", borderLeft: `4px solid ${C.green}`, color: C.green, fontSize: 13 }}>
              {info}
            </div>
          )}

          <button type="submit" disabled={busy} style={{ ...btnPrimary, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Chwila…" : mode === "login" ? "Zaloguj się" : "Załóż konto"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: C.steel }}>
          {mode === "login" ? "Nie masz konta? " : "Masz już konto? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setInfo("");
            }}
            style={{ border: "none", background: "transparent", color: C.brass, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            {mode === "login" ? "Zarejestruj się" : "Zaloguj się"}
          </button>
        </div>
      </div>
    </div>
  );
}
