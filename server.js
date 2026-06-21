// Prosty serwer proxy (Node, bez zależności).
// Przyjmuje żądania z frontendu na /api/messages i przekazuje je do Anthropic API,
// dokładając klucz API ze zmiennej środowiskowej ANTHROPIC_API_KEY.
// Dzięki temu klucz NIGDY nie trafia do przeglądarki.
//
// Uruchomienie:
//   ANTHROPIC_API_KEY=sk-ant-... node server.js
// (lub wpisz klucz do pliku .env i użyj np. `node --env-file=.env server.js` w Node 20+)

import http from "node:http";

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.warn("UWAGA: brak zmiennej ANTHROPIC_API_KEY — żądania do API nie powiodą się.");
}

const server = http.createServer(async (req, res) => {
  // CORS dla trybu deweloperskiego
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/messages") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body,
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy error", detail: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Proxy API działa na http://localhost:${PORT}`);
});