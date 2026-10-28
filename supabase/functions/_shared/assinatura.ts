/**
 * Assinatura das mensagens de cobrança — {empresa} vira o nome da empresa do
 * cliente (user_profiles.company_name). Puro (sem Deno/npm): usado pelas Edge
 * Functions e pelo front, como o billingPlans.ts.
 *
 * Os modelos padrão escrevem a assinatura de forma que ela leia bem com ou sem
 * nome: "Equipe financeira {empresa}." vira "Equipe financeira Móveis Silva."
 * ou, sem nome cadastrado, "Equipe financeira.".
 */
export function aplicarEmpresa(texto: string, empresa?: string | null): string {
  const nome = (empresa ?? "").trim();
  return nome ? texto.replace(/\{empresa\}/g, nome) : texto.replace(/[ \t]*\{empresa\}/g, "");
}
