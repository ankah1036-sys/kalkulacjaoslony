import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [org, setOrg] = useState(null); // { id, name, role, ... } — firma użytkownika
  const [loading, setLoading] = useState(true);

  // Ładuje firmę (membership + organizacja) zalogowanego użytkownika.
  const loadOrg = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setOrg(null);
      return;
    }
    const { data, error } = await supabase
      .from("memberships")
      .select("role, organizations ( id, name )")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      setOrg(null);
      return;
    }
    setOrg({ ...data.organizations, role: data.role });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadOrg(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s) await loadOrg(s.user.id);
      else setOrg(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadOrg]);

  const value = {
    session,
    user: session?.user || null,
    org,
    loading,
    configured: isSupabaseConfigured,
    refreshOrg: () => session && loadOrg(session.user.id),
    signOut: () => supabase?.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
