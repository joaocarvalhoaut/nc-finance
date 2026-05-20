import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserSubscription, UserUsageCounter } from "../types";
import { getSubscriptionEntitlements, getUsagePeriodKey, subscriptionService } from "../services/subscriptionService";

export const useSubscription = (userId: string | null) => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<UserUsageCounter | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshSubscription = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setUsage(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [nextSubscription, nextUsage] = await Promise.all([
        subscriptionService.getSubscription(userId),
        subscriptionService.getUsage(userId, getUsagePeriodKey()),
      ]);

      setSubscription(nextSubscription);
      setUsage(nextUsage);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Falha ao carregar assinatura.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  const entitlements = useMemo(
    () => getSubscriptionEntitlements(subscription, usage),
    [subscription, usage],
  );

  return {
    subscription,
    usage,
    loading,
    error,
    isTrialing: entitlements.isTrialing,
    isActive: entitlements.isActive,
    canUseApp: entitlements.canUseApp,
    canSendCharge: entitlements.canSendCharge,
    plan: entitlements.plan,
    limits: entitlements.limits,
    remainingCharges: entitlements.remainingCharges,
    refreshSubscription,
  };
};
