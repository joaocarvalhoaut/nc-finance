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
    description: "Operação individual com cobrança manual e histórico essencial.",
    monthlyChargeLimit: 300,
    features: [
      "Até 300 cobranças por mês",
      "Cobrança manual",
      "Histórico básico",
      "Google Sheets preparado para fase futura",
    ],
    stripePriceId: basicPriceId,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Mais volume, envios em lote e controle completo das mensagens.",
    monthlyChargeLimit: 1500,
    features: [
      "Até 1.500 cobranças por mês",
      "Envio em lote",
      "Mensagens por estilo",
      "Histórico completo",
      "Google Sheets e Drive preparados para fases futuras",
    ],
    stripePriceId: proPriceId,
  },
  premium: {
    id: "premium",
    name: "Premium",
    description: "Maior escala com estrutura pronta para automações e métricas avançadas.",
    monthlyChargeLimit: 5000,
    features: [
      "Até 5.000 cobranças por mês",
      "Base pronta para automações futuras",
      "Fila avançada futura",
      "Métricas futuras",
      "Google Sheets e Drive preparados para fases futuras",
    ],
    stripePriceId: premiumPriceId,
  },
};

export const PLAN_LIST = Object.values(PLAN_DEFINITIONS);

export const getPlanDefinition = (planId: PlanId | null | undefined) =>
  PLAN_DEFINITIONS[planId || "basic"];
