import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import Stripe from "npm:stripe@18.2.1";
import { corsHeaders } from "../_shared/cors.ts";
import { getStripeClient, resolvePlanFromPriceId, type PlanId } from "../_shared/stripe.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const admin = createClient(supabaseUrl, serviceRoleKey);

const toIso = (value: number | null | undefined) => (value ? new Date(value * 1000).toISOString() : null);

const isPlanId = (value: string | null | undefined): value is PlanId =>
  value === "basic" || value === "pro" || value === "premium";

const logWebhook = (payload: Record<string, unknown>) => {
  console.log(JSON.stringify(payload));
};

const serializeUnknownError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as Record<string, unknown>;
    return {
      message: String(candidate.message || "Erro desconhecido"),
      details: candidate.details || null,
      hint: candidate.hint || null,
      code: candidate.code || null,
      stack: candidate.stack || null,
    };
  }

  return { message: String(error) };
};

const getPersistedSubscriptionRow = async (userId: string) => {
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("user_id, plan, status, stripe_subscription_id, trial_start, trial_end, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const resolveUserId = async (params: {
  candidateUserId?: string | null;
  stripeCustomerId?: string | null;
  stripeCustomer?: Stripe.Customer | Stripe.DeletedCustomer | null;
}) => {
  if (params.candidateUserId) return params.candidateUserId;

  const customerMetadataUserId =
    params.stripeCustomer && !("deleted" in params.stripeCustomer)
      ? params.stripeCustomer.metadata?.user_id
      : null;

  if (customerMetadataUserId) return customerMetadataUserId;

  if (!params.stripeCustomerId) return null;

  const { data } = await admin
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", params.stripeCustomerId)
    .maybeSingle();

  return data?.user_id || null;
};

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
  const payload = {
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
  };

  logWebhook({
    source: "stripe-webhook.upsert.before",
    user_id: params.userId,
    plan: params.plan,
    status: params.status,
    // subscription_id, customer_id, trial_* e payload completo omitidos dos logs (PII financeiro)
  });

  try {
    const { data, error, count } = await admin
      .from("user_subscriptions")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, plan, status, stripe_subscription_id, trial_start, trial_end, updated_at", {
        count: "exact",
      })
      .single();

    const finalRow = await getPersistedSubscriptionRow(params.userId);

    logWebhook({
      source: "stripe-webhook.upsert.after",
      user_id: params.userId,
      plan: params.plan,
      status: params.status,
      persisted_status: (finalRow as Record<string, unknown> | null)?.status ?? null,
      count,
      error: error ? { message: error.message, code: error.code } : null,
      // data, final_row e subscription_id omitidos dos logs (PII financeiro)
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    logWebhook({
      source: "stripe-webhook.upsert.error",
      user_id: params.userId,
      subscription_id: params.stripeSubscriptionId,
      error: serializeUnknownError(error),
    });
    throw new Error(
      error instanceof Error ? error.message : "Falha ao sincronizar assinatura.",
    );
  }
};

const syncSubscriptionFromStripe = async (
  stripe: Stripe,
  subscription: Stripe.Subscription,
  fallback?: {
    userId?: string | null;
    planId?: string | null;
    customer?: Stripe.Customer | Stripe.DeletedCustomer | null;
  },
) => {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const priceId = subscription.items.data[0]?.price?.id || null;
  const plan =
    (isPlanId(subscription.metadata?.plan_id) && subscription.metadata.plan_id) ||
    (isPlanId(fallback?.planId) ? fallback?.planId : null) ||
    resolvePlanFromPriceId(priceId);
  const userId = await resolveUserId({
    candidateUserId: subscription.metadata?.user_id || fallback?.userId,
    stripeCustomerId,
    stripeCustomer: fallback?.customer || null,
  });

  logWebhook({
    source: "stripe-webhook.syncSubscriptionFromStripe",
    subscription_id: subscription.id,
    customer_id: stripeCustomerId,
    event_status: subscription.status,
    plan_resolved: plan,
    user_id: userId,
    price_id: priceId,
  });

  if (!userId) {
    throw new Error(`Nao foi possivel resolver user_id para a subscription ${subscription.id}.`);
  }

  const upsertResult = await upsertSubscriptionFromStripe({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    plan,
    status: subscription.status,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodStart: toIso(subscription.current_period_start),
    currentPeriodEnd: toIso(subscription.current_period_end),
    trialStart: toIso(subscription.trial_start),
    trialEnd: toIso(subscription.trial_end),
  });

  logWebhook({
    source: "stripe-webhook.syncSubscriptionFromStripe.result",
    subscription_id: subscription.id,
    user_id: userId,
    status: subscription.status,
    upsert_result: upsertResult,
  });

  return upsertResult;
};

const syncInvoiceSubscription = async (stripe: Stripe, invoice: Stripe.Invoice) => {
  if (typeof invoice.subscription !== "string") {
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  return syncSubscriptionFromStripe(stripe, subscription);
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
    const isReplay = Boolean(alreadyProcessed);

    logWebhook({
      source: "stripe-webhook.received",
      event_type: event.type,
      event_id: event.id,
      replay: isReplay,
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionUserId = session.metadata?.user_id || null;
        const sessionPlanId = session.metadata?.plan_id || null;

        logWebhook({
          source: "stripe-webhook.checkout.completed",
          event_type: event.type,
          user_id: sessionUserId,
          customer_id: typeof session.customer === "string" ? session.customer : null,
          subscription_id: typeof session.subscription === "string" ? session.subscription : null,
          plan_id: sessionPlanId,
          status: session.status,
        });

        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const customer =
            typeof subscription.customer === "string"
              ? await stripe.customers.retrieve(subscription.customer)
              : null;

          await syncSubscriptionFromStripe(stripe, subscription, {
            userId: sessionUserId,
            planId: sessionPlanId,
            customer,
          });
        } else {
          logWebhook({
            source: "stripe-webhook.checkout.no_subscription",
            event_type: event.type,
            user_id: sessionUserId,
            note: "Nenhum fallback incomplete foi persistido para evitar overwrite de status real.",
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer =
          typeof subscription.customer === "string"
            ? await stripe.customers.retrieve(subscription.customer)
            : null;

        await syncSubscriptionFromStripe(stripe, subscription, {
          customer,
        });
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        logWebhook({
          source: "stripe-webhook.invoice",
          event_type: event.type,
          customer_id: typeof invoice.customer === "string" ? invoice.customer : null,
          subscription_id: typeof invoice.subscription === "string" ? invoice.subscription : null,
          invoice_status: invoice.status,
        });

        if (typeof invoice.subscription === "string") {
          await syncInvoiceSubscription(stripe, invoice);
        }
        break;
      }
      default:
        break;
    }

    await admin.from("stripe_webhook_events").upsert(
      {
        event_id: event.id,
        event_type: event.type,
        processed_at: new Date().toISOString(),
        payload: { id: event.id, type: event.type, replay: isReplay },
      },
      { onConflict: "event_id" },
    );

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logWebhook({
      source: "stripe-webhook.error",
      error: serializeUnknownError(error),
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Falha no webhook Stripe." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
