/**
 * Validação de CPF (dígito verificador). Rejeita tamanho errado, sequências
 * repetidas (111.111.111-11) e dígitos verificadores inválidos.
 *
 * KYC: barra CPFs falsos/malformados no cadastro de quem realiza cobranças.
 * Não confirma "situação na Receita" (exigiria serviço externo), mas garante
 * que o número é matematicamente válido.
 */
export const isValidCPF = (cpf: string): boolean => {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
};
