import Stripe from "npm:stripe@18.2.1";

export type PlanId = "basic" | "pro" | "premium";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

export const getStripeClient = () => {
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY nao configurada.");
  }

  return new Stripe(stripeSecretKey, {
    // Versao fixada DE PROPOSITO. O SDK 18.2.1 so aceita no tipo a versao que
    // ele declara como mais recente ("2025-05-28.basil"), mas subir o pin muda
    // o formato das respostas da Stripe — e alteracao de comportamento no
    // billing, nao correcao de tipo. O cast registra que o pin e intencional.
    apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion,
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
