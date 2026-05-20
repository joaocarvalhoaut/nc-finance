import Stripe from "npm:stripe@18.2.1";

export type PlanId = "basic" | "pro" | "premium";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

export const getStripeClient = () => {
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY nao configurada.");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2025-04-30.basil",
  });
};

export const resolvePlanPriceId = (planId: PlanId) => {
  const mapping: Record<PlanId, string> = {
    basic: Deno.env.get("STRIPE_BASIC_PRICE_ID") || "",
    pro: Deno.env.get("STRIPE_PRO_PRICE_ID") || "",
    premium: Deno.env.get("STRIPE_PREMIUM_PRICE_ID") || "",
  };

  const priceId = mapping[planId];

  if (!priceId) {
    throw new Error(`Price ID nao configurado para o plano ${planId}.`);
  }

  return priceId;
};

export const resolvePlanFromPriceId = (priceId: string | null | undefined): PlanId => {
  const basic = Deno.env.get("STRIPE_BASIC_PRICE_ID") || "";
  const pro = Deno.env.get("STRIPE_PRO_PRICE_ID") || "";
  const premium = Deno.env.get("STRIPE_PREMIUM_PRICE_ID") || "";

  if (priceId === pro) return "pro";
  if (priceId === premium) return "premium";
  return "basic";
};

export const getAppBaseUrl = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin || Deno.env.get("SITE_URL") || "http://localhost:5173";
};
