import { C } from "../theme.js";

// Potwierdzenie po kliknięciu „Wyślij" — mailto otwiera program pocztowy z gotową
// treścią; właściwą wysyłkę użytkowniczka kończy w swojej skrzynce.
// Domyślnie brzmi jak potwierdzenie oferty; `title`/`docWord`/`hint` pozwalają
// użyć tego samego okna dla zlecenia na produkcję.
export default function SentDialog({ open, to, offerNo, title, docWord = "ofertą", hint, onClose }) {
  if (!open) return null;
  const heading = title || "Oferta przekazana do wysłania";
  const hintNode = hint || (
    <>
      Sprawdź treść, <strong style={{ color: C.ink }}>dołącz plik PDF</strong> i kliknij „Wyślij" w swojej skrzynce.
    </>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(28,30,34,0.5)" }} />
      <div style={{ position: "relative", width: "min(440px, 96vw)", background: C.paper, border: `2px solid ${C.ink}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", textAlign: "center", padding: "28px 24px" }}>
        <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%", background: C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>
          ✓
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginBottom: 8 }}>{heading}</div>
        <div style={{ fontSize: 14, color: C.steel, lineHeight: 1.6, marginBottom: 20 }}>
          Otworzył się Twój program pocztowy z gotową {docWord}{offerNo ? ` ${offerNo}` : ""}
          {to ? (
            <>
              {" "}dla <strong style={{ color: C.ink }}>{to}</strong>
            </>
          ) : ""}.
          <br />
          {hintNode}
        </div>
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", border: "none", background: C.ink, color: "#fff" }}
        >
          Rozumiem
        </button>
      </div>
    </div>
  );
}
