import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserSubscription, UserUsageCounter } from "../types";
import {
  getSubscriptionEntitlements,
  getUsagePeriodKey,
  subscriptionService,
} from "../services/subscriptionService";

// Statuses que significam "webhook processado — pode parar o polling"
const SETTLED_STATUSES = new Set(["trialing", "active", "canceled", "past_due", "unpaid"]);

// Polling: tenta a cada 2 s por até 22 s
const POLL_INTERVAL_MS  = 2_000;
const POLL_MAX_ATTEMPTS = 11;

export const useSubscription = (userId: string | null) => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage]               = useState<UserUsageCounter | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [isSyncing, setIsSyncing]       = useState(false);

  // Ref para cancelar polling ao desmontar ou mudar userId
  const pollTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptRef  = useRef(0);
  const isMountedRef    = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // ── Fetch único ──────────────────────────────────────────────────────────────
  const refreshSubscription = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setUsage(null);
      setError("");
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError("");

    try {
      const [nextSubscription, nextUsage] = await Promise.all([
        subscriptionService.getSubscription(userId),
        subscriptionService.getUsage(userId, getUsagePeriodKey()),
      ]);

      if (!isMountedRef.current) return null;

      setSubscription(nextSubscription);
      setUsage(nextUsage);
      return nextSubscription;
    } catch (refreshError) {
      if (!isMountedRef.current) return null;
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Falha ao carregar assinatura.",
      );
      return null;
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [userId]);

  // ── Polling pós-checkout ─────────────────────────────────────────────────────
  /**
   * Inicia polling até o webhook do Stripe atualizar a assinatura para um
   * status confirmado (trialing | active | ...). Para após POLL_MAX_ATTEMPTS
   * tentativas independentemente do resultado.
   */
  const startCheckoutPolling = useCallback(() => {
    if (!userId) return;

    // Cancela polling anterior se houver
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollAttemptRef.current = 0;

    setIsSyncing(true);

    const poll = async () => {
      if (!isMountedRef.current) return;
      if (pollAttemptRef.current >= POLL_MAX_ATTEMPTS) {
        setIsSyncing(false);
        return;
      }

      pollAttemptRef.current += 1;

      const sub = await refreshSubscription();
      if (!isMountedRef.current) return;

      // Para quando webhook já atualizou o status
      const status = sub?.status ?? "";
      if (SETTLED_STATUSES.has(status)) {
        setIsSyncing(false);
        return;
      }

      // Continua tentando
      pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();
  }, [userId, refreshSubscription]);

  // ── Load inicial ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  // ── Entitlements (memoizados) ─────────────────────────────────────────────────
  const entitlements = useMemo(
    () => getSubscriptionEntitlements(subscription, usage),
    [subscription, usage],
  );

  return {
    subscription,
    usage,
    loading,
    error,
    isSyncing,
    isTrialing:       entitlements.isTrialing,
    isActive:         entitlements.isActive,
    canUseApp:        entitlements.canUseApp,
    canSendCharge:    entitlements.canSendCharge,
    plan:             entitlements.plan,
    limits:           entitlements.limits,
    remainingCharges: entitlements.remainingCharges,
    refreshSubscription,
    startCheckoutPolling,
  };
};
