import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AuthCredentials, SignUpPayload } from "../types";
import {
  getSession,
  onAuthStateChange,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword
} from "../services/authService";
import { hasSupabaseConfig, supabaseConfigError } from "../services/supabaseClient";

export const useSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // true quando o usuário abriu o link de recuperação de senha do email
  const [passwordRecovery, setPasswordRecovery] = useState(false);

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

    const unsubscribe = onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
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

  const requestPasswordReset = useCallback((email: string) => {
    return resetPassword(email);
  }, []);

  const setNewPassword = useCallback(async (newPassword: string) => {
    await updatePassword(newPassword);
    setPasswordRecovery(false);
  }, []);

  return {
    user,
    session,
    loading,
    signIn: signInWithPassword,
    signUp: signUpWithPassword,
    signOut: signOutCurrentUser,
    resetPassword: requestPasswordReset,
    updatePassword: setNewPassword,
    passwordRecovery,
    configError: supabaseConfigError
  };
};
