import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import Stripe from "npm:stripe@18.2.1";
import { corsHeaders } from "../_shared/cors.ts";
import { getStripeClient, resolvePlanFromPriceId, type PlanId } from "../_shared/stripe.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const admin = createClient(supabaseUrl, serviceRoleKey);

const toIso = (value: number | null | undefined) => (value ? new Date(value * 1000).toISOString() : null);

const upsertSubscriptionFromStripe = async (params: {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: PlanId;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
}) => {
  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      stripe_price_id: params.stripePriceId,
      plan: params.plan,
      status: params.status,
      cancel_at_period_end: params.cancelAtPeriodEnd,
      current_period_start: params.currentPeriodStart,
      current_period_end: params.currentPeriodEnd,
      trial_start: params.trialStart,
      trial_end: params.trialEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message || "Falha ao sincronizar assinatura.");
  }
};

const resolveUserId = async (candidateUserId: string | null | undefined, stripeCustomerId: string | null) => {
  if (candidateUserId) return candidateUserId;

  if (!stripeCustomerId) return null;
  const { data } = await admin
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  return data?.user_id || null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET nao configurada.");
    }

    const stripe = getStripeClient();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Assinatura ausente." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await request.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

    const { data: alreadyProcessed } = await admin
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (alreadyProcessed) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id || null;
        const plan = (session.metadata?.plan_id as PlanId | undefined) || "basic";

        if (userId) {
          await upsertSubscriptionFromStripe({
            userId,
            stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
            stripePriceId: null,
            plan,
            status: "incomplete",
            cancelAtPeriodEnd: false,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            trialStart: null,
            trialEnd: null,
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : null;
        const priceId = subscription.items.data[0]?.price?.id || null;
        const userId = await resolveUserId(subscription.metadata?.user_id, stripeCustomerId);

        if (userId) {
          await upsertSubscriptionFromStripe({
            userId,
            stripeCustomerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan: resolvePlanFromPriceId(priceId),
            status: subscription.status,
            cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
            currentPeriodStart: toIso(subscription.current_period_start),
            currentPeriodEnd: toIso(subscription.current_period_end),
            trialStart: toIso(subscription.trial_start),
            trialEnd: toIso(subscription.trial_end),
          });
        }
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const userId = await resolveUserId(null, stripeCustomerId);
        const linePriceId = invoice.lines.data[0]?.pricing?.price_details?.price || null;

        if (userId) {
          await upsertSubscriptionFromStripe({
            userId,
            stripeCustomerId,
            stripeSubscriptionId: typeof invoice.subscription === "string" ? invoice.subscription : null,
            stripePriceId: linePriceId,
            plan: resolvePlanFromPriceId(linePriceId),
            status: event.type === "invoice.payment_failed" ? "past_due" : "active",
            cancelAtPeriodEnd: false,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            trialStart: null,
            trialEnd: null,
          });
        }
        break;
      }
      default:
        break;
    }

    await admin.from("stripe_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Falha no webhook Stripe." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
