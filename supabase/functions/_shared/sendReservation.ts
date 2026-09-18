/** Reserva atômica antes de qualquer chamada ao provedor. Em erro, não envia. */
export async function reserveChargeSend(admin: any, userId: string, key: string): Promise<boolean> {
  const { data, error } = await admin.rpc("reserve_charge_send", { p_user_id: userId, p_key: key });
  if (error || typeof data !== "boolean") throw new Error("Proteção contra envio duplicado indisponível. Tente novamente mais tarde.");
  return data;
}
