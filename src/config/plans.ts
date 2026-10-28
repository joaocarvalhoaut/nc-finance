import type { PlanId } from "../types";
import { PLAN_PRICE_BRL } from "../../supabase/functions/_shared/billingPlans.ts";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyChargeLimit: number;
  /**
   * Fonte única do que cada plano libera — usada no app, na landing, no JSON-LD
   * e no /llms.txt. Só listar o que o código libera de fato para o plano
   * (BATCH/AUTOMATION/DRIVE_ALLOWED_PLANS nas Edge Functions; janela e limite
   * diário das regras só aparecem no Premium).
   */
  features: string[];
  /** Mensalidade em reais — a mesma que o checkout do Asaas cobra. */
  priceBRL: number;
}

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  basic: {
    id: "basic",
    name: "Básico",
    description: "Para sair do envio manual e cobrar pelo WhatsApp com organização.",
    monthlyChargeLimit: 300,
    features: [
      "Até 300 cobranças por mês",
      "Envio pelo seu número de WhatsApp",
      "Importação de Excel, CSV, PDF, TXT e Google Sheets",
      "Juros e multa calculados no painel",
      "4 tons de mensagem, do amigável ao jurídico",
      "Histórico de envios",
    ],
    priceBRL: PLAN_PRICE_BRL.basic,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Mais volume, envio em lote e cobrança automática por regras.",
    monthlyChargeLimit: 1500,
    features: [
      "Até 1.500 cobranças por mês",
      "Tudo do Básico",
      "Envio em lote",
      "Automação por regras, todo dia às 8h",
      "Boletos do Google Drive anexados automaticamente",
    ],
    priceBRL: PLAN_PRICE_BRL.pro,
  },
  premium: {
    id: "premium",
    name: "Premium",
    description: "Para carteiras grandes, com controle de horário e volume por regra.",
    monthlyChargeLimit: 5000,
    features: [
      "Até 5.000 cobranças por mês",
      "Tudo do Pro",
      "Janela de horário por regra de automação",
      "Limite diário de envios por regra",
      "Suporte prioritário",
    ],
    priceBRL: PLAN_PRICE_BRL.premium,
  },
};

export const PLAN_LIST = Object.values(PLAN_DEFINITIONS);

export const getPlanDefinition = (planId: PlanId | null | undefined) =>
  PLAN_DEFINITIONS[planId || "basic"];
