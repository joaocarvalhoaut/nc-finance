import type { PlanId } from "../types";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyChargeLimit: number;
  features: string[];
  stripePriceId: string;
}

const basicPriceId = String(import.meta.env.VITE_STRIPE_BASIC_PRICE_ID || "").trim();
const proPriceId = String(import.meta.env.VITE_STRIPE_PRO_PRICE_ID || "").trim();
const premiumPriceId = String(import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID || "").trim();

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  basic: {
    id: "basic",
    name: "Básico",
    description: "Para começar a cobrar por WhatsApp com importação e histórico.",
    monthlyChargeLimit: 300,
    features: [
      "Até 300 cobranças por mês",
      "Cobrança manual por WhatsApp",
      "Importação de Excel, CSV, PDF e TXT",
      "Histórico de envios",
    ],
    stripePriceId: basicPriceId,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Mais volume, envio em lote e boletos do Drive anexados automaticamente.",
    monthlyChargeLimit: 1500,
    features: [
      "Até 1.500 cobranças por mês",
      "Tudo do Básico",
      "Envio em lote",
      "Mensagens em vários tons (amigável a jurídico)",
      "Anexo automático de boletos do Google Drive",
    ],
    stripePriceId: proPriceId,
  },
  premium: {
    id: "premium",
    name: "Premium",
    description: "Cobrança no piloto automático, com regras agendadas e métricas.",
    monthlyChargeLimit: 5000,
    features: [
      "Até 5.000 cobranças por mês",
      "Tudo do Pro",
      "Automações agendadas (cobra sozinho por regras)",
      "Dashboard de métricas e taxa de sucesso",
      "Prioridade na fila de envio",
    ],
    stripePriceId: premiumPriceId,
  },
};

export const PLAN_LIST = Object.values(PLAN_DEFINITIONS);

export const getPlanDefinition = (planId: PlanId | null | undefined) =>
  PLAN_DEFINITIONS[planId || "basic"];
