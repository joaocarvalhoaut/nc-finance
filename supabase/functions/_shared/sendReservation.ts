/** Reserva atômica antes de qualquer chamada ao provedor. Em erro, não envia. */
export async function reserveChargeSend(admin: any, userId: string, key: string): Promise<boolean> {
  const { data, error } = await admin.rpc("reserve_charge_send", { p_user_id: userId, p_key: key });
  if (error || typeof data !== "boolean") throw new Error("Proteção contra envio duplicado indisponível. Tente novamente mais tarde.");
  return data;
}

/**
 * Liberação temporária pedida pelo dono em 29/10/2026: a conta dele pode repetir a
 * mesma mensagem para o mesmo número sem esperar os 5 min. Expira sozinha à
 * meia-noite de Brasília (30/10 00:00 = 03:00 UTC); depois disso é código morto —
 * remover junto com as chamadas em send-whatsapp-charge e send-whatsapp-batch.
 */
const LIBERACAO_DUPLICIDADE = {
  userId: "821c5ca4-b895-4727-8a04-057c1ac8ca75",
  ate: Date.parse("2026-10-30T03:00:00Z"),
};
export const duplicidadeLiberada = (userId: string): boolean =>
  userId === LIBERACAO_DUPLICIDADE.userId && Date.now() < LIBERACAO_DUPLICIDADE.ate;
