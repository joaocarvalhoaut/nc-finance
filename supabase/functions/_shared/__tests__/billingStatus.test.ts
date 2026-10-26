/**
 * billingStatus + billingPlans — status da assinatura Asaas e regra de acesso.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/billingStatus.test.ts
 */

import {
  addMonths,
  brDateToIso,
  canUseSubscription,
  computeSubscriptionState,
  isStripeLegacy,
  todayBr,
  type AsaasPaymentLite,
} from "../billingStatus.ts";
import { planFromValue } from "../billingPlans.ts";

let passed = 0, failed = 0;
function eq<T>(got: T, want: T, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado ${w}, veio ${g}`); failed++; process.exitCode = 1; }
}

const NOW = new Date("2026-10-26T15:00:00Z"); // 26/10 meio-dia em Brasília
const ATIVA = { status: "ACTIVE", deleted: false };
const pay = (status: string, dueDate: string): AsaasPaymentLite => ({ status, dueDate });

console.log("\n══ Datas ═══════════════════════════════════════════════════");
eq(addMonths("2026-01-31", 1), "2026-02-28", "31/01 + 1 mês = 28/02");
eq(addMonths("2028-01-31", 1), "2028-02-29", "ano bissexto");
eq(addMonths("2026-12-15", 1), "2027-01-15", "virada de ano");
eq(todayBr(new Date("2026-10-27T02:30:00Z")), "2026-10-26", "23h30 em Brasília ainda é dia 26");
eq(brDateToIso("2026-11-02"), "2026-11-02T03:00:00.000Z", "meia-noite de Brasília em UTC");

console.log("\n══ Asaas → status local ═════════════════════════════════════");
const trialEnd = brDateToIso("2026-11-02");
eq(computeSubscriptionState(ATIVA, [pay("PENDING", "2026-11-02")], { trialEnd, now: NOW }).status,
  "trialing", "teste: 1ª fatura pendente");
eq(computeSubscriptionState(ATIVA, [pay("PENDING", "2026-10-26")], { trialEnd: null, now: NOW }).status,
  "incomplete", "sem teste e nada pago: aguardando pagamento");

const pagaNoTeste = computeSubscriptionState(ATIVA, [pay("RECEIVED", "2026-11-02")], { trialEnd, now: NOW });
eq(pagaNoTeste.status, "active", "pagou durante o teste → ativa");
eq(pagaNoTeste.currentPeriodEnd, brDateToIso("2026-12-02"), "…e não perde os dias de teste");

eq(computeSubscriptionState(ATIVA, [pay("CONFIRMED", "2026-10-10")], { trialEnd: null, now: NOW }).status,
  "active", "cartão confirmado conta como pago");

const atrasada = computeSubscriptionState(
  ATIVA, [pay("RECEIVED", "2026-09-20"), pay("OVERDUE", "2026-10-20")], { trialEnd: null, now: NOW });
eq(atrasada.status, "past_due", "fatura vencida → pagamento pendente");
eq(atrasada.currentPeriodEnd, brDateToIso("2026-10-20"), "…tolerância conta do vencimento em aberto");

eq(computeSubscriptionState(ATIVA, [pay("REFUNDED", "2026-10-10")], { trialEnd: null, now: NOW }).status,
  "incomplete", "estornada não conta como paga");
eq(computeSubscriptionState(ATIVA, [{ status: "RECEIVED", dueDate: "2026-10-10", deleted: true }], { trialEnd: null, now: NOW }).status,
  "incomplete", "cobrança removida é ignorada");

const ordemTrocada = computeSubscriptionState(
  ATIVA, [pay("PENDING", "2026-11-10"), pay("RECEIVED", "2026-10-10"), pay("RECEIVED", "2026-09-10")],
  { trialEnd: null, now: NOW });
eq(ordemTrocada.currentPeriodEnd, brDateToIso("2026-11-10"), "período vem da última paga, em qualquer ordem");

console.log("\n══ Cancelamento ════════════════════════════════════════════");
const cancelPago = computeSubscriptionState(
  { status: "ACTIVE", deleted: true }, [pay("RECEIVED", "2026-10-10")], { trialEnd: null, now: NOW });
eq([cancelPago.status, cancelPago.cancelAtPeriodEnd, cancelPago.currentPeriodEnd],
  ["active", true, brDateToIso("2026-11-10")], "cancelou com mês pago → ativa até 10/11");
eq(computeSubscriptionState({ status: "INACTIVE" }, [pay("RECEIVED", "2026-08-10")], { trialEnd: null, now: NOW }).status,
  "canceled", "período pago já acabou → cancelada");
const cancelTeste = computeSubscriptionState({ status: "ACTIVE", deleted: true }, [], { trialEnd, now: NOW });
eq([cancelTeste.status, cancelTeste.cancelAtPeriodEnd], ["trialing", true], "cancelou no teste → usa até o fim do teste");
eq(computeSubscriptionState(null, [], { trialEnd: null, now: NOW }).status, "canceled", "assinatura não existe mais");

console.log("\n══ Acesso ══════════════════════════════════════════════════");
eq(canUseSubscription({ status: "active" }, NOW), true, "ativa");
eq(canUseSubscription({ status: "trialing", current_period_end: trialEnd }, NOW), true, "em teste");
eq(canUseSubscription({ status: "trialing", current_period_end: brDateToIso("2026-10-20") }, NOW), false,
  "teste acabou há 6 dias sem pagar");
eq(canUseSubscription({ status: "past_due", current_period_end: brDateToIso("2026-10-24") }, NOW), true,
  "vencida há 2 dias: dentro da tolerância (boleto compensando)");
eq(canUseSubscription({ status: "past_due", current_period_end: brDateToIso("2026-10-20") }, NOW), false,
  "vencida há 6 dias: bloqueia");
eq(canUseSubscription({ status: "active", cancel_at_period_end: true, current_period_end: brDateToIso("2026-11-10") }, NOW),
  true, "cancelada, ainda no período pago");
eq(canUseSubscription({ status: "active", cancel_at_period_end: true, current_period_end: brDateToIso("2026-10-25") }, NOW),
  false, "cancelada, período pago acabou (sem webhook)");
eq(canUseSubscription({ status: "incomplete" }, NOW), false, "aguardando 1º pagamento");
eq(canUseSubscription({ status: "canceled" }, NOW), false, "cancelada");
eq(canUseSubscription(null, NOW), false, "sem assinatura");

console.log("\n══ Contas da Stripe e cortesia ═════════════════════════════");
const legado = { status: "trialing", current_period_end: null, billing_provider: "stripe", asaas_subscription_id: null };
eq(isStripeLegacy(legado), true, "Stripe sem assinatura no Asaas é legado");
eq(canUseSubscription(legado, new Date("2026-11-02T20:00:00Z")), true, "legado: libera em 02/11 (último dia)");
eq(canUseSubscription(legado, new Date("2026-11-03T03:00:00Z")), false, "legado: bloqueia a partir de 03/11");
eq(canUseSubscription({ ...legado, asaas_subscription_id: "sub_1", current_period_end: brDateToIso("2026-11-20") },
  new Date("2026-11-10T12:00:00Z")), true, "Stripe que ativou no Asaas segue a regra normal");
eq(canUseSubscription({ status: "canceled", billing_provider: "cortesia" }, new Date("2030-01-01T00:00:00Z")),
  true, "cortesia libera sempre");
eq(canUseSubscription({ status: "active" }, new Date("2030-01-01T00:00:00Z")), true,
  "sem billing_provider (Asaas antigo): não sofre o prazo");

console.log("\n══ Plano pelo valor ════════════════════════════════════════");
eq(planFromValue(49), "basic", "49 → Básico");
eq(planFromValue(97), "pro", "97 → Pro");
eq(planFromValue(197), "premium", "197 → Premium");
eq(planFromValue(199), null, "valor fora da tabela → null (não rebaixa)");
eq(planFromValue(undefined), null, "sem valor");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
