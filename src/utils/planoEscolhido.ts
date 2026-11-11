/**
 * Plano clicado na landing ("Testar o Pro grátis") — segue até a tela de
 * planos depois do cadastro, para o visitante não ter que escolher de novo.
 * Só no navegador (localStorage); sem storage, cai no plano recomendado.
 */
import type { PlanId } from "../types";

const CHAVE = "ncf-plano-escolhido";
const VALIDOS: readonly PlanId[] = ["basic", "pro", "premium"];

export function salvarPlanoEscolhido(plano: PlanId): void {
  try { localStorage.setItem(CHAVE, plano); } catch { /* sem storage: segue sem lembrar */ }
}

export function lerPlanoEscolhido(): PlanId | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v && (VALIDOS as readonly string[]).includes(v) ? (v as PlanId) : null;
  } catch {
    return null;
  }
}
