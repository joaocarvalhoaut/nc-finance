import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const getPeriodKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${`${now.getUTCMonth() + 1}`.padStart(2, "0")}`;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nao autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessao invalida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { metric, amount } = (await request.json()) as {
      metric?: "charges_sent" | "sheets_imports" | "drive_lookups";
      amount?: number;
    };

    if (!metric || !["charges_sent", "sheets_imports", "drive_lookups"].includes(metric)) {
      return new Response(JSON.stringify({ error: "Metrica invalida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incrementBy = Number(amount || 1);
    const period = getPeriodKey();

    const { data: existing } = await admin
      .from("user_usage_counters")
      .select("*")
      .eq("user_id", user.id)
      .eq("period", period)
      .maybeSingle();

    const nextCounters = {
      user_id: user.id,
      period,
      charges_sent: Number(existing?.charges_sent || 0) + (metric === "charges_sent" ? incrementBy : 0),
      sheets_imports: Number(existing?.sheets_imports || 0) + (metric === "sheets_imports" ? incrementBy : 0),
      drive_lookups: Number(existing?.drive_lookups || 0) + (metric === "drive_lookups" ? incrementBy : 0),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("user_usage_counters")
      .upsert(nextCounters, { onConflict: "user_id,period" })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao registrar uso.");
    }

    return new Response(JSON.stringify({ period, counters: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Falha ao registrar uso." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
