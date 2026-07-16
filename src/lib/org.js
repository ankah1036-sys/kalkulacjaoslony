// Zakładanie firmy przy pierwszym zapisie wyceny.
//
// Firma jest potrzebna technicznie — to ona „posiada" wyceny i klientów,
// dzięki czemu nikt obcy ich nie zobaczy (zabezpieczenia RLS w bazie).
// Ale użytkownika nie zatrzymujemy nią na wejściu: pytamy o nazwę dopiero
// wtedy, gdy naprawdę jest potrzebna, czyli przy pierwszym zapisie.

import { supabase } from "./supabase.js";

/**
 * Tworzy firmę i czyni użytkownika jej administratorem.
 * @param {string} name - nazwa firmy (pojawi się na ofercie)
 * @param {string} userId - id zalogowanego użytkownika
 * @returns {Promise<{id: string, name: string}>}
 */
export async function createOrganization(name, userId) {
  // Nadajemy id po stronie aplikacji, żeby NIE odczytywać firmy zaraz po zapisie.
  // Odczyt (.select) wymaga bycia już członkiem firmy — a członkiem stajemy się
  // dopiero w następnym kroku. Bez tego baza zablokowałaby zapis (reguły RLS).
  const id = crypto.randomUUID();
  const cleanName = name.trim();

  const { error: orgErr } = await supabase
    .from("organizations")
    .insert({ id, name: cleanName });
  if (orgErr) throw orgErr;

  const { error: memErr } = await supabase
    .from("memberships")
    .insert({ org_id: id, user_id: userId, role: "admin" });
  if (memErr) throw memErr;

  return { id, name: cleanName };
}
