import React from "react";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function PoliticaPrivacidade({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Política de Privacidade</h2>
            <p className="text-zinc-500 text-xs mt-0.5">NC Finance — Última atualização: maio/2026 · Em conformidade com a LGPD (Lei 13.709/2018)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 text-zinc-300 text-sm leading-relaxed space-y-6">

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">1. Quem somos</h3>
            <p>
              A <strong className="text-white">NC Finance Ltda.</strong> é a controladora dos dados pessoais tratados nesta plataforma. Para questões relacionadas à privacidade, o contato é:{" "}
              <a href="mailto:privacidade@ncfinance.com.br" className="text-emerald-400 hover:underline">
                privacidade@ncfinance.com.br
              </a>
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">2. Dados que coletamos</h3>
            <p>Coletamos as seguintes categorias de dados:</p>

            <div className="space-y-3 mt-2">
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="text-white font-medium text-xs uppercase tracking-wide mb-2">Dados da conta do usuário</p>
                <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-xs">
                  <li>E-mail e senha (armazenada com hash — nunca em texto puro)</li>
                  <li>Data de criação e último acesso</li>
                  <li>Plano de assinatura e status de pagamento</li>
                </ul>
              </div>

              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="text-white font-medium text-xs uppercase tracking-wide mb-2">Dados de devedores (inseridos pelo usuário)</p>
                <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-xs">
                  <li>Nome ou razão social</li>
                  <li>Número de telefone (armazenado mascarado nos logs)</li>
                  <li>CPF/CNPJ (quando presente nos arquivos importados)</li>
                  <li>Valor do débito e data de vencimento</li>
                  <li>Número do documento/título</li>
                </ul>
                <p className="text-zinc-500 text-xs mt-2">
                  Esses dados são fornecidos exclusivamente pelo próprio usuário. A NC Finance não coleta nem verifica a origem dessas informações.
                </p>
              </div>

              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="text-white font-medium text-xs uppercase tracking-wide mb-2">Dados de uso e logs</p>
                <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-xs">
                  <li>Registros de envio de cobranças (data, status, preview da mensagem)</li>
                  <li>Contadores de uso mensal por plano</li>
                  <li>Logs de erro (sem dados pessoais de devedores)</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">3. Como usamos os dados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-400 py-2 pr-4 font-medium">Finalidade</th>
                    <th className="text-left text-zinc-400 py-2 pr-4 font-medium">Base legal (LGPD)</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400 divide-y divide-zinc-900">
                  <tr><td className="py-2 pr-4">Prestação do serviço de cobrança</td><td className="py-2">Execução de contrato (art. 7º, V)</td></tr>
                  <tr><td className="py-2 pr-4">Controle de limites de plano</td><td className="py-2">Execução de contrato (art. 7º, V)</td></tr>
                  <tr><td className="py-2 pr-4">Processamento de pagamentos via Stripe</td><td className="py-2">Execução de contrato (art. 7º, V)</td></tr>
                  <tr><td className="py-2 pr-4">Envio de notificações do serviço</td><td className="py-2">Legítimo interesse (art. 7º, IX)</td></tr>
                  <tr><td className="py-2 pr-4">Prevenção a fraudes e abusos</td><td className="py-2">Legítimo interesse (art. 7º, IX)</td></tr>
                  <tr><td className="py-2 pr-4">Cumprimento de obrigações legais</td><td className="py-2">Obrigação legal (art. 7º, II)</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">4. Compartilhamento de dados</h3>
            <p>Compartilhamos dados apenas com os seguintes fornecedores essenciais à operação do serviço:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-2">
              <li><strong className="text-zinc-300">Supabase</strong> — infraestrutura de banco de dados e autenticação (servidores na região South America)</li>
              <li><strong className="text-zinc-300">Stripe</strong> — processamento de pagamentos (dados de cobrança do usuário — não de devedores)</li>
              <li><strong className="text-zinc-300">Z-API</strong> — gateway de envio de mensagens WhatsApp (recebe apenas o número de telefone e o texto da mensagem)</li>
              <li><strong className="text-zinc-300">Google Cloud</strong> — integração com Google Sheets e Drive (apenas quando habilitado pelo usuário)</li>
              <li><strong className="text-zinc-300">Vercel</strong> — hospedagem da aplicação web</li>
            </ul>
            <p className="mt-2">
              Não vendemos, alugamos ou compartilhamos dados com terceiros para fins de marketing.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">5. Retenção de dados</h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Dados da conta: mantidos enquanto a conta estiver ativa e por até 90 dias após o encerramento</li>
              <li>Dados de devedores: mantidos enquanto o usuário não os excluir</li>
              <li>Logs de cobrança: mantidos por 12 meses para fins de auditoria</li>
              <li>Após os prazos acima, os dados são excluídos permanentemente dos servidores</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">6. Segurança dos dados</h3>
            <p>Adotamos as seguintes medidas técnicas de segurança:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-1">
              <li>Senhas armazenadas com hash (bcrypt via Supabase Auth)</li>
              <li>Comunicação criptografada via HTTPS/TLS em todas as chamadas</li>
              <li>Números de telefone de devedores armazenados somente de forma mascarada nos logs</li>
              <li>Credenciais de APIs terceiras armazenadas como secrets do servidor — nunca expostas no frontend</li>
              <li>Controle de acesso por Row Level Security (RLS) no banco de dados</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">7. Seus direitos (LGPD — art. 18)</h3>
            <p>Como titular de dados, você tem direito a:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-1">
              <li><strong className="text-zinc-300">Confirmação e acesso</strong> — saber quais dados temos sobre você</li>
              <li><strong className="text-zinc-300">Correção</strong> — atualizar dados incompletos ou desatualizados</li>
              <li><strong className="text-zinc-300">Anonimização ou exclusão</strong> — solicitar a remoção dos seus dados</li>
              <li><strong className="text-zinc-300">Portabilidade</strong> — receber seus dados em formato estruturado</li>
              <li><strong className="text-zinc-300">Revogação do consentimento</strong> — quando o tratamento se basear em consentimento</li>
              <li><strong className="text-zinc-300">Oposição</strong> — contestar tratamentos baseados em legítimo interesse</li>
            </ul>
            <p className="mt-2">
              Para exercer qualquer direito, envie solicitação para{" "}
              <a href="mailto:privacidade@ncfinance.com.br" className="text-emerald-400 hover:underline">
                privacidade@ncfinance.com.br
              </a>
              . Respondemos em até 15 dias úteis.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">8. Cookies</h3>
            <p>
              A plataforma utiliza apenas cookies essenciais para manter a sessão autenticada do usuário. Não utilizamos cookies de rastreamento, publicidade ou analytics de terceiros.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">9. Menores de idade</h3>
            <p>
              O serviço é destinado exclusivamente a pessoas jurídicas e pessoas físicas maiores de 18 anos. Não coletamos intencionalmente dados de menores.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">10. Alterações nesta Política</h3>
            <p>
              Esta Política pode ser atualizada periodicamente. Notificaremos os usuários por e-mail com antecedência de 15 dias em caso de alterações relevantes. A versão vigente estará sempre disponível nesta página.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">11. Encarregado de Dados (DPO)</h3>
            <p>
              O encarregado pelo tratamento de dados pessoais (DPO) pode ser contatado pelo e-mail{" "}
              <a href="mailto:privacidade@ncfinance.com.br" className="text-emerald-400 hover:underline">
                privacidade@ncfinance.com.br
              </a>
              . Você também pode registrar reclamações na Autoridade Nacional de Proteção de Dados (ANPD) em{" "}
              <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
                www.gov.br/anpd
              </a>
              .
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
