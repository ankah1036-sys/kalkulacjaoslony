// Funkcja serverless Vercela — odpowiednik server.js dla produkcji.
// Frontend woła /api/messages; tutaj dokładamy klucz API ze zmiennej środowiskowej,
// żeby NIGDY nie trafił do przeglądarki. Lokalnie nadal działa server.js (npm run server).
//
// Wymagana zmienna środowiskowa w panelu Vercel: ANTHROPIC_API_KEY
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: "Brak ANTHROPIC_API_KEY w konfiguracji serwera." });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      // Vercel automatycznie parsuje JSON do req.body — przekazujemy dalej.
      body: JSON.stringify(req.body),
    });
    const data = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    res.status(upstream.status).send(data);
  } catch (err) {
    res.status(500).json({ error: "Proxy error", detail: String(err) });
  }
}
