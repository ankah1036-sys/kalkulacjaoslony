// Wspólna paleta i style — inspirowane warsztatem blacharskim: stal, mosiądz, papier rysunku.
export const C = {
  paper: "#EDE9E0",
  ink: "#1C1E22",
  steel: "#3A4654",
  brass: "#B5803A",
  line: "#C9C2B4",
  green: "#3B6B4A",
  red: "#9C3B2E",
};

export const lbl = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: C.steel,
  marginBottom: 4,
};

export const inp = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  border: `1px solid ${C.line}`,
  background: "#fff",
  color: C.ink,
  boxSizing: "border-box",
  outline: "none",
};

export const btnPrimary = {
  width: "100%",
  padding: "14px 0",
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: 0.5,
  border: "none",
  background: C.brass,
  color: "#fff",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const fmt = (n) =>
  Number(n || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
