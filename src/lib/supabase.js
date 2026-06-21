import { createClient } from "@supabase/supabase-js";

// Konfiguracja czytana ze zmiennych środowiskowych (.env, prefiks VITE_).
// To są wartości PUBLICZNE (anon key jest bezpieczny dzięki RLS po stronie bazy).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Czy aplikacja ma poprawnie wpisane dane do Supabase?
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes("twoj-projekt") && !anonKey.includes("twoj-")
);

// Klient tworzony tylko, gdy konfiguracja jest uzupełniona — inaczej UI pokaże instrukcję.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
