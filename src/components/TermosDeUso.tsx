import React from "react";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function TermosDeUso({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Termos de Uso</h2>
            <p className="text-zinc-500 text-xs mt-0.5">NC Finance — Última atualização: maio/2026</p>
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
            <h3 className="text-white font-semibold text-base">1. Aceitação dos Termos</h3>
            <p>
              Ao acessar ou utilizar a plataforma NC Finance, você declara ter lido, compreendido e concordado com estes Termos de Uso. Caso não concorde com qualquer disposição, não utilize o serviço.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">2. Sobre o Serviço</h3>
            <p>
              A NC Finance é uma plataforma SaaS (Software as a Service) de gestão de cobranças que permite ao usuário importar listas de devedores, gerar mensagens de cobrança e enviá-las via WhatsApp por meio de APIs terceiras (Z-API). O serviço é fornecido por NC Finance Ltda., com sede no Brasil.
            </p>
            <p>
              A plataforma não realiza cobranças extrajudiciais, não oferece assessoria jurídica e não se responsabiliza por quaisquer negociações entre o usuário e seus devedores.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">3. Cadastro e Conta</h3>
            <p>
              Para utilizar o serviço, é necessário criar uma conta com e-mail e senha válidos. O usuário é responsável pela confidencialidade de suas credenciais e por todas as atividades realizadas em sua conta.
            </p>
            <p>
              É proibido compartilhar credenciais com terceiros, criar contas em nome de outras pessoas sem autorização ou utilizar dados falsos no cadastro. A NC Finance reserva-se o direito de suspender contas que violem estas regras.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">4. Planos e Pagamentos</h3>
            <p>
              O serviço é oferecido mediante assinatura mensal nos planos disponíveis (Básico, Pro e Premium), com cobranças recorrentes processadas pela Stripe. O valor é cobrado antecipadamente no início de cada período.
            </p>
            <p>
              Não há reembolso por períodos não utilizados. O cancelamento da assinatura impede novas cobranças, mas o acesso permanece ativo até o final do período já pago.
            </p>
            <p>
              Períodos de avaliação gratuita (trial) não exigem pagamento imediato. Ao término do trial, a assinatura é convertida automaticamente para o plano escolhido, salvo cancelamento anterior.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">5. Uso Permitido e Proibições</h3>
            <p>O usuário pode utilizar a plataforma para:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Gerenciar cobranças de dívidas legítimas com devedores de sua própria carteira;</li>
              <li>Importar e organizar dados financeiros de sua empresa;</li>
              <li>Enviar notificações de cobrança via WhatsApp com linguagem respeitosa.</li>
            </ul>
            <p className="mt-2">É expressamente proibido:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Enviar mensagens de cobrança a pessoas com quem não há relação de débito comprovada;</li>
              <li>Utilizar a plataforma para assédio, ameaças ou qualquer forma de coação;</li>
              <li>Realizar spam ou envios em massa sem base legal;</li>
              <li>Tentar contornar os limites de envio do plano contratado;</li>
              <li>Utilizar o serviço para finalidades ilegais ou em desacordo com o Código de Defesa do Consumidor e a Lei 8.078/90.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">6. Responsabilidades do Usuário</h3>
            <p>
              O usuário é o único responsável pelos dados que insere na plataforma, pelo conteúdo das mensagens enviadas e pela conformidade de suas cobranças com a legislação vigente, incluindo o Código de Defesa do Consumidor (Lei 8.078/90) e a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).
            </p>
            <p>
              A NC Finance não verifica a veracidade das dívidas importadas pelo usuário e não se responsabiliza por cobranças indevidas ou por eventuais danos causados a terceiros.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">7. Limitação de Responsabilidade</h3>
            <p>
              A NC Finance não garante disponibilidade ininterrupta do serviço e não se responsabiliza por falhas de APIs terceiras (Z-API, Stripe, Google). Em nenhuma hipótese a responsabilidade total da NC Finance excederá o valor pago pelo usuário nos últimos 30 dias.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">8. Propriedade Intelectual</h3>
            <p>
              Todo o código, design, marca e conteúdo da plataforma são de propriedade exclusiva da NC Finance Ltda. É proibida a reprodução, cópia ou engenharia reversa sem autorização expressa por escrito.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">9. Suspensão e Encerramento</h3>
            <p>
              A NC Finance pode suspender ou encerrar o acesso de qualquer usuário que viole estes Termos, sem aviso prévio e sem direito a reembolso nos casos de violação grave. O usuário pode encerrar sua conta a qualquer momento pela interface da plataforma ou pelo suporte.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">10. Alterações nos Termos</h3>
            <p>
              Estes Termos podem ser atualizados a qualquer momento. Usuários serão notificados por e-mail com antecedência de 15 dias em caso de alterações relevantes. O uso continuado após a vigência das novas condições implica aceitação automática.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">11. Foro e Lei Aplicável</h3>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de domicílio do usuário para dirimir quaisquer conflitos, conforme o artigo 101 do Código de Defesa do Consumidor.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">12. Contato</h3>
            <p>
              Dúvidas sobre estes Termos podem ser enviadas para:{" "}
              <a href="mailto:contato@ncfinance.com.br" className="text-emerald-400 hover:underline">
                contato@ncfinance.com.br
              </a>
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
