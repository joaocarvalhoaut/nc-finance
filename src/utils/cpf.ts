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

/** Validação de CNPJ (dígitos verificadores), nos mesmos moldes do CPF. */
export const isValidCNPJ = (cnpj: string): boolean => {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += parseInt(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito(d.slice(0, 12));
  const d2 = digito(d.slice(0, 12) + d1);
  return d1 === parseInt(d[12]) && d2 === parseInt(d[13]);
};

/** CPF (pessoa física) ou CNPJ (empresa) válido — o documento da conta. */
export const isValidCpfOuCnpj = (doc: string): boolean => isValidCPF(doc) || isValidCNPJ(doc);
