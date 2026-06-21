# Kalkulator wyceny obudów grzejnikowych

Narzędzie do szybkiej wyceny obudów (osłon) grzejnikowych. Odczytuje wymiary z treści maila
lub ze zdjęcia/rysunku, przelicza powierzchnię na metry kwadratowe, mnoży przez cenę materiału
i generuje ofertę PDF gotową do wysłania klientowi do akceptacji.

## Funkcje

- Odczyt wymiarów z **tekstu maila** lub z **rysunku/zdjęcia** (wizja modelu Claude).
- Rozpoznawanie jednostek (cm / mm) i zapisu typu `120x60` oraz `120x60x12`.
- Trzy tryby liczenia powierzchni:
  - **Auto** — front, a gdy podano głębokość, liczona jest pełna obudowa,
  - **Tylko front** — szerokość × wysokość,
  - **Pełna obudowa** — front + 2 boki + góra (bez tyłu i spodu).
- Podgląd oferty w oknie obok i eksport do **PDF** (przez druk → "Zapisz jako PDF").
- Sekcja "Do potwierdzenia z klientem", gdy dane są niejednoznaczne.

## Wymagania

- Node.js 18+ (zalecany 20+).
- Klucz API Anthropic (do odczytu wymiarów przez model).

## Uruchomienie lokalne

```bash
# 1. Zainstaluj zależności
npm install

# 2. Skonfiguruj klucz API
cp .env.example .env
# następnie wpisz swój klucz w pliku .env

# 3. Uruchom serwer proxy (trzyma klucz po stronie serwera)
npm run server

# 4. W drugim terminalu uruchom aplikację
npm run dev
```

Aplikacja otworzy się pod adresem podanym przez Vite (zwykle http://localhost:5173).

## Dlaczego potrzebny jest serwer proxy

Klucza API **nie wolno** umieszczać w kodzie frontendu — przeglądarka go ujawnia, a każdy
mógłby go wykorzystać na Twój koszt. Dodatkowo Anthropic API nie pozwala na wywołania
bezpośrednio z przeglądarki (CORS). Dlatego mały serwer `server.js` przyjmuje żądania z
aplikacji i dopiero on — po stronie serwera — woła API z kluczem ze zmiennej środowiskowej.

## Uwaga o eksporcie PDF

PDF powstaje przez systemowe okno druku: w oknie drukowania jako drukarkę wybierz
"Zapisz jako PDF" / "Microsoft Print to PDF". Działa offline i obsługuje polskie znaki.

## Stos technologiczny

React + Vite, lekki serwer proxy w czystym Node.