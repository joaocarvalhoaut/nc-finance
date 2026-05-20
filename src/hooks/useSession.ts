import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AuthCredentials, SignUpPayload } from "../types";
import {
  getSession,
  onAuthStateChange,
  signIn,
  signOut,
  signUp
} from "../services/authService";
import { hasSupabaseConfig, supabaseConfigError } from "../services/supabaseClient";

export const useSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const bootstrapSession = async () => {
      try {
        const currentSession = await getSession();
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user || null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    bootstrapSession().catch((error) => {
      console.error("Falha ao inicializar sessao Supabase:", error);
      if (isMounted) {
        setLoading(false);
      }
    });

    const unsubscribe = onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user || null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback((credentials: AuthCredentials) => {
    return signIn(credentials);
  }, []);

  const signUpWithPassword = useCallback((payload: SignUpPayload) => {
    return signUp(payload);
  }, []);

  const signOutCurrentUser = useCallback(() => {
    return signOut();
  }, []);

  return {
    user,
    session,
    loading,
    signIn: signInWithPassword,
    signUp: signUpWithPassword,
    signOut: signOutCurrentUser,
    configError: supabaseConfigError
  };
};
