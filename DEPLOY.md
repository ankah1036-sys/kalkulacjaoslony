# Wdrożenie na Vercel

Aplikacja jest gotowa do wdrożenia na Vercel. Frontend (Vite/React) buduje się automatycznie,
a proxy do Anthropic API działa jako funkcja serverless w `api/messages.js`.

## Krok 1 — Import projektu na Vercel

1. Wejdź na https://vercel.com i zaloguj się (najlepiej kontem GitHub).
2. Kliknij **Add New… → Project**.
3. Wybierz repozytorium **Ania8321/kalkulacjaoslony** (Import).
4. Vercel sam wykryje **Vite** — nie zmieniaj ustawień budowania:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`

## Krok 2 — Zmienne środowiskowe (WAŻNE)

Zanim klikniesz **Deploy**, rozwiń **Environment Variables** i dodaj **trzy** wartości:

| Name | Value | Uwaga |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://tepnsyahktxsvencjruc.supabase.co` | adres bazy (publiczny) |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (Twój anon key) | klucz publiczny, bezpieczny |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (Twój prawdziwy klucz) | **tajny** — używany tylko po stronie serwera |

> `VITE_*` są wstrzykiwane do frontendu przy budowaniu (dlatego muszą być na Vercelu, nie tylko lokalnie).
> `ANTHROPIC_API_KEY` jest czytany wyłącznie przez funkcję `api/messages.js` — nie trafia do przeglądarki.

## Krok 3 — Deploy

Kliknij **Deploy**. Po ~1 min dostaniesz adres typu `https://kalkulacjaoslony.vercel.app`.

## Krok 4 — Powiedz Supabase o adresie aplikacji

W panelu Supabase: **Authentication → URL Configuration**:
- **Site URL**: wklej adres z Vercela (np. `https://kalkulacjaoslony.vercel.app`).
- W **Redirect URLs** dodaj ten sam adres.

Dzięki temu logowanie i ewentualne linki e-mail będą wskazywać na produkcję, a nie localhost.

## Automatyczne wdrożenia

Po imporcie Vercel wdraża **automatycznie przy każdym `git push`** na `main`. Nie trzeba nic robić ręcznie.

## Uwagi

- `server.js` zostaje dla pracy **lokalnej** (`npm run server`). Na Vercelu używana jest funkcja `api/messages.js`.
- Limit wielkości żądania funkcji serverless to ok. 4,5 MB — bardzo duże zdjęcia rysunków mogą go przekroczyć.
  Jeśli to wystąpi, zmniejsz zdjęcie przed wgraniem.
