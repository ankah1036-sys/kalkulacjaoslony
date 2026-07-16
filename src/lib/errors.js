// Jedno miejsce, w którym techniczne komunikaty (Supabase, Postgres, sieć)
// zamieniamy na polskie zdania zrozumiałe dla użytkownika.
//
// Zasada: użytkownik NIGDY nie widzi angielskiego tekstu ani kodu błędu.
// Oryginał trafia do konsoli przeglądarki — dla nas, gdy trzeba coś namierzyć.

const RULES = [
  // --- logowanie i rejestracja ---
  [/invalid login credentials|invalid_credentials/, "Nieprawidłowy e-mail lub hasło."],
  [/email not confirmed|email_not_confirmed/, "Konto nie zostało potwierdzone. Sprawdź skrzynkę e-mail."],
  [/already registered|user_already_exists/, "Ten e-mail jest już zarejestrowany. Zaloguj się."],
  [/password should be at least (\d+)/, (m) => `Hasło musi mieć co najmniej ${m[1]} znaków.`],
  [/weak.?password|password.*too short/, "Hasło jest za słabe. Użyj dłuższego."],
  [/signup requires a valid password|password.*required/, "Podaj hasło."],
  [/unable to validate email address|invalid format|email_address_invalid|is invalid/, "Adres e-mail wygląda na nieprawidłowy. Sprawdź, czy nie ma literówki."],
  [/signups? not allowed|signup_disabled/, "Zakładanie kont jest wyłączone w ustawieniach bazy."],
  [/for security purposes.*after (\d+) seconds?/, (m) => `Za dużo prób. Odczekaj ${m[1]} sekund i spróbuj ponownie.`],
  [/rate limit|too many requests/, "Za dużo prób pod rząd. Odczekaj chwilę i spróbuj ponownie."],
  [/captcha/, "Weryfikacja zabezpieczająca nie powiodła się. Odśwież stronę."],
  [/token has expired|jwt expired|session.*expired|refresh.*not found/, "Sesja wygasła. Zaloguj się ponownie."],

  // --- baza danych ---
  [/row-level security|42501|permission denied/, "Brak uprawnień do tej operacji. Sprawdź, czy jesteś zalogowana we właściwej firmie."],
  [/duplicate key|23505|already exists/, "Taki wpis już istnieje."],
  [/violates foreign key|23503/, "Nie można wykonać — do tego wpisu przypisane są inne dane."],
  [/null value in column|23502|not-null/, "Brakuje wymaganego pola. Uzupełnij formularz."],
  [/invalid input syntax|22p02/, "Nieprawidłowy format danych w jednym z pól."],
  [/schema cache|pgrst205|does not exist|relation.*not found/, "Baza danych nie jest jeszcze gotowa. Odśwież stronę za chwilę."],

  // --- sieć ---
  [/failed to fetch|networkerror|load failed|err_network|fetch failed/, "Brak połączenia z bazą. Sprawdź internet i spróbuj ponownie."],
  [/timeout|timed out/, "Serwer nie odpowiedział na czas. Spróbuj ponownie."],
];

/**
 * Zamienia dowolny błąd na polskie zdanie dla użytkownika.
 * @param {unknown} err - obiekt błędu, string albo cokolwiek
 * @param {string} fallback - zdanie, gdy nie rozpoznamy błędu
 */
export function toPolish(err, fallback = "Coś poszło nie tak. Spróbuj ponownie.") {
  const raw = typeof err === "string" ? err : err?.message || err?.error_description || "";
  if (!raw) return fallback;

  // Oryginał zostaje w konsoli — użytkownik go nie widzi, my możemy podejrzeć.
  if (typeof console !== "undefined") console.warn("[błąd źródłowy]", err);

  const hay = String(raw).toLowerCase();
  for (const [pattern, out] of RULES) {
    const m = hay.match(pattern);
    if (m) return typeof out === "function" ? out(m) : out;
  }
  return fallback;
}
