# PRD — Kalkulator wyceny osłon (obudów) kaloryferów

**Wersja:** 0.1 (draft)
**Data:** 2026-06-21
**Status:** propozycja do akceptacji
**Właściciel produktu:** (do uzupełnienia)

---

## 1. Cel produktu

Narzędzie do **szybkiej wyceny osłon (obudów) grzejnikowych**, które:

1. odczytuje wymiary z treści maila lub ze zdjęcia/rysunku (wizja modelu Claude),
2. przelicza powierzchnię na m² i mnoży przez cenę materiału,
3. generuje ofertę PDF gotową do wysłania klientowi,
4. **zapisuje każdą wycenę do bazy kalkulacji** (historia, edycja, ponowne użycie),
5. **wymaga zalogowania** — dane wycen i klientów są prywatne dla użytkownika/firmy.

### Problem, który rozwiązujemy
Dziś wyceny robione są ręcznie — przepisywanie wymiarów z maili, liczenie powierzchni w głowie/na kartce, brak historii. To wolne i podatne na błędy. Produkt skraca wycenę do kilkunastu sekund i tworzy trwałą bazę kalkulacji.

---

## 2. Zakres

### 2.1 Stan obecny (MVP istniejący — gotowe)
- Odczyt wymiarów z **tekstu maila** lub z **rysunku/zdjęcia** (model `claude-sonnet-4-6`).
- Rozpoznawanie jednostek (cm / mm) i zapisu `120x60` oraz `120x60x12`.
- Trzy tryby liczenia powierzchni: **Auto**, **Tylko front** (szer.×wys.), **Pełna obudowa** (front + 2 boki + góra).
- Podgląd oferty i eksport do **PDF** (druk → „Zapisz jako PDF").
- Sekcja „Do potwierdzenia z klientem" przy niejednoznacznych danych.
- Serwer proxy (`server.js`) trzymający klucz API po stronie serwera.

### 2.2 Nowy zakres (ten PRD)
- **Logowanie i konta użytkowników** (uwierzytelnianie).
- **Baza danych** — trwałe przechowywanie wycen, klientów i ustawień.
- **Baza kalkulacji** — lista zapisanych wycen z wyszukiwaniem, edycją i duplikowaniem.
- Zapisywanie wyceny po przeliczeniu (powiązanie z kontem i klientem).

### 2.3 Poza zakresem (na teraz)
- Płatności / fakturowanie / integracje księgowe.
- Wielojęzyczność (na start tylko PL).
- Aplikacja mobilna natywna (web responsywny wystarcza).
- Zaawansowane role i uprawnienia (na start: właściciel konta + ewentualnie członkowie zespołu).

---

## 3. Użytkownicy i role

> **Decyzja:** konta **firmowe (zespół)** — wielu użytkowników należy do jednej firmy, współdzieli cennik i widzi wyceny zespołu.

| Rola | Opis | Uprawnienia |
|---|---|---|
| **Niezalogowany** | Trafia na stronę logowania | Tylko logowanie / rejestracja |
| **Admin firmy** | Zakłada firmę, zaprasza członków | Wszystko poniżej + zarządzanie firmą, cennikiem, członkami |
| **Członek zespołu (handlowiec)** | Tworzy i zarządza wycenami firmy | Tworzenie/edycja/usuwanie wycen firmy, klienci firmy, eksport PDF |

---

## 4. Wymagania funkcjonalne

### 4.1 Uwierzytelnianie (logowanie)
- **FR-1** Rejestracja kontem e-mail + hasło.
- **FR-2** Logowanie e-mail + hasło, wylogowanie.
- **FR-3** Sesja podtrzymywana (np. token / cookie), wygasanie po czasie.
- **FR-4** Reset hasła przez e-mail (faza 2).
- **FR-5** Każdy zasób (wycena, klient) jest **przypisany do użytkownika** — użytkownik widzi tylko swoje dane.
- **FR-6** (opcjonalnie) Logowanie przez Google (faza 2).

### 4.2 Kalkulator (rozszerzenie istniejącego)
- **FR-7** Po przeliczeniu wyceny dostępny przycisk **„Zapisz wycenę"** → trafia do bazy kalkulacji.
- **FR-8** Wycena zapisuje: pozycje (wymiary, tryb, m², koszt), cenę materiału, walutę, dane klienta, nr oferty, datę, autora.
- **FR-9** Zachowane wszystkie obecne tryby liczenia i odczyt z maila/zdjęcia.

### 4.3 Baza kalkulacji
- **FR-10** Lista zapisanych wycen: nr oferty, klient, data, suma, status.
- **FR-11** Wyszukiwanie / filtrowanie po kliencie, dacie, numerze oferty.
- **FR-12** Otwarcie wyceny → podgląd i ponowny eksport PDF.
- **FR-13** **Edycja** zapisanej wyceny (zmiana pozycji, ceny, przeliczenie na nowo).
- **FR-14** **Duplikowanie** wyceny jako szablonu nowej.
- **FR-15** Usuwanie wyceny (miękkie usunięcie / kosz — do decyzji).
- **FR-16** Statusy wyceny: `szkic` → `wysłana` → `zaakceptowana` / `odrzucona` (opcjonalnie faza 2).

### 4.4 Klienci i cennik (wspierające)
- **FR-17** Książka klientów (nazwa, kontakt) z podpowiedziami przy tworzeniu wyceny.
- **FR-18** Domyślna cena materiału / waluta zapamiętywana per użytkownik.

---

## 5. Wymagania niefunkcjonalne

- **NFR-1 Bezpieczeństwo:** klucz API Anthropic wyłącznie po stronie serwera (już tak jest). Hasła hashowane (bcrypt/argon2). Komunikacja po HTTPS w produkcji.
- **NFR-2 Prywatność danych:** izolacja danych między użytkownikami na poziomie zapytań do bazy (oraz RLS, jeśli Supabase/Postgres).
- **NFR-3 Wydajność:** przeliczenie wyceny < 5 s (zależne od API modelu); lista kalkulacji ładuje się < 1 s dla setek rekordów.
- **NFR-4 Dostępność:** web responsywny (desktop + tablet); PL jako język interfejsu.
- **NFR-5 Niezawodność:** zapis wyceny atomowy; brak utraty danych przy błędzie API (wycena liczona lokalnie po odczycie wymiarów).

---

## 6. Model danych (propozycja)

> Model **firmowy**: nadrzędną jednostką jest `organization` (firma). Użytkownicy należą do firmy przez `memberships`. Wyceny i klienci są przypisani do firmy (`org_id`), nie do pojedynczego użytkownika — dzięki temu zespół współdzieli dane. Autor wyceny zapisany w `created_by`.

```
organizations          -- firma
  id (uuid, pk)
  name
  default_price         -- wspólny domyślny cennik za m²
  default_currency      -- np. PLN
  created_at

users                  -- konto Supabase Auth (auth.users) + profil
  id (uuid, pk)         -- = auth.users.id
  email (unique)
  display_name
  created_at

memberships            -- przynależność użytkownika do firmy + rola
  id (uuid, pk)
  org_id (fk -> organizations)
  user_id (fk -> users)
  role                  -- admin | member
  created_at
  UNIQUE(org_id, user_id)

invites                -- zaproszenia do firmy (faza M1/M3)
  id (uuid, pk)
  org_id (fk -> organizations)
  email
  role
  token
  status                -- pending | accepted | revoked
  created_at

clients
  id (uuid, pk)
  org_id (fk -> organizations)
  name
  contact               -- e-mail / telefon
  created_at

quotes                 -- wycena (oferta)
  id (uuid, pk)
  org_id (fk -> organizations)
  created_by (fk -> users)
  client_id (fk -> clients, nullable)
  offer_no
  company_name          -- nagłówek oferty
  price_per_m2
  currency
  surface_mode          -- auto | front | full
  total_area
  total_cost
  status                -- draft | sent | accepted | rejected
  warnings (json)       -- "do potwierdzenia z klientem"
  created_at
  updated_at

quote_items            -- pozycje wyceny
  id (uuid, pk)
  quote_id (fk -> quotes)
  label
  width_m
  height_m
  depth_m (nullable)
  area
  basis                 -- "front" | "pełna obudowa" | ...
  cost
  note (nullable)
```

**Izolacja danych (RLS w Supabase):** każdy SELECT/INSERT/UPDATE na `clients`, `quotes`, `quote_items` filtrowany politykami tak, że użytkownik widzi tylko rekordy firmy, do której należy (sprawdzenie przez `memberships`). Operacje admina (zarządzanie cennikiem, zapraszanie) ograniczone do `role = 'admin'`.

---

## 7. Architektura (propozycja)

**Stan obecny:** React + Vite (frontend) + lekki proxy Node (`server.js`) do Anthropic API.

**Decyzja: Supabase.** Postgres + wbudowane Auth (e-mail/hasło) + Row Level Security (RLS) do izolacji danych między firmami. Frontend (React/Vite) łączy się z Supabase przez oficjalny klient `@supabase/supabase-js`.

- **Auth:** Supabase Auth (e-mail + hasło na start; Google jako opcja w M4).
- **Baza:** Postgres w Supabase, schemat jak w sekcji 6, polityki RLS oparte na `memberships`.
- **Proxy Anthropic:** **zostaje** po stronie serwera (`server.js`) — klucz API nigdy nie trafia do przeglądarki. Może działać lokalnie lub jako Supabase Edge Function.
- **Sekrety:** `ANTHROPIC_API_KEY` po stronie serwera/Edge Function; w froncie tylko publiczny `anon key` Supabase (bezpieczny dzięki RLS).

---

## 8. Kamienie milowe

| Faza | Zakres | Efekt |
|---|---|---|
| **M0 (gotowe)** | Kalkulator + odczyt z maila/zdjęcia + PDF | Działa lokalnie |
| **M1** | Baza danych + logowanie (rejestracja, login, sesja) | Konta użytkowników |
| **M2** | Zapis wyceny + baza kalkulacji (lista, podgląd, PDF) | Historia wycen |
| **M3** | Edycja / duplikowanie / wyszukiwanie + książka klientów | Pełne zarządzanie |
| **M4** *(opcj.)* | Statusy ofert, reset hasła, logowanie Google, zespół | Dojrzały produkt |

---

## 9. Decyzje i otwarte pytania

**Podjęte:**
- ✅ **Baza/Auth:** Supabase (Postgres + Auth + RLS).
- ✅ **Konta:** firmowe (zespół) — firma + członkowie + wspólny cennik.

**Do decyzji:**
1. **Hosting docelowy:** lokalnie, Vercel/Netlify (frontend) + Supabase, czy własny serwer?
2. **Usuwanie wycen:** twarde czy „kosz" z możliwością przywrócenia?
3. **Statusy ofert** w fazie M2 czy odłożyć do M4?
4. Czy potrzebne **logowanie Google** od początku, czy wystarczy e-mail + hasło?
5. **Onboarding firmy:** pierwszy użytkownik zakłada firmę i staje się adminem — czy tak ma być domyślnie?

---

## 10. Metryki sukcesu

- Czas od otrzymania maila do gotowej oferty PDF: **< 1 min**.
- ≥ 90% wycen zapisywanych do bazy (a nie tylko jednorazowych).
- Zero wycieków klucza API i danych między kontami.
