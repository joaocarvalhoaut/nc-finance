import React from "react";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

/**
 * Acordo de Tratamento de Dados (DPA) — LGPD art. 39.
 * O CLIENTE é o controlador dos dados dos seus devedores; a NC Finance atua
 * como OPERADORA, tratando esses dados exclusivamente para prestar o serviço.
 * As medidas de segurança descritas na seção 5 refletem exatamente o que está
 * implementado (ver também "Segurança dos dados" na Política de Privacidade) —
 * não há promessa de proteção absoluta, que seria juridicamente inexequível.
 */
export default function AcordoTratamentoDados({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Acordo de Tratamento de Dados</h2>
            <p className="text-zinc-500 text-xs mt-0.5">NC Finance — Última atualização: agosto/2026 · LGPD (Lei 13.709/2018), art. 39</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 text-zinc-300 text-sm leading-relaxed space-y-6">

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">1. Objeto e papéis das partes</h3>
            <p>
              Este Acordo rege o tratamento de dados pessoais que você (o <strong className="text-white">Cliente</strong>) insere na plataforma para cobrar seus devedores. Para os fins da LGPD:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-1">
              <li>O <strong className="text-zinc-300">Cliente é o Controlador</strong> dos dados dos seus devedores — decide quais dados carregar e para que cobrar.</li>
              <li>A <strong className="text-zinc-300">NC Finance é a Operadora</strong> — trata esses dados apenas conforme as instruções do Cliente e para prestar o serviço contratado.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">2. Autorização de tratamento e compartilhamento</h3>
            <p>
              Ao criar sua conta e aceitar este Acordo, você <strong className="text-white">autoriza</strong> a NC Finance a coletar, armazenar, processar e transmitir os dados necessários à cobrança — como nome, documento, telefone, valor e vencimento dos devedores — <strong className="text-white">exclusivamente para operar o serviço</strong>. Isso inclui compartilhar o mínimo necessário desses dados com os suboperadores listados na seção 3, que executam etapas técnicas da entrega.
            </p>
            <p>
              A NC Finance <strong className="text-white">não</strong> vende, aluga ou utiliza esses dados para finalidade própria, marketing ou qualquer uso não relacionado à prestação do serviço.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">3. Suboperadores</h3>
            <p>Para executar o serviço, a NC Finance utiliza os seguintes suboperadores, cada um recebendo apenas o dado estritamente necessário à sua função:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-1">
              <li><strong className="text-zinc-300">Supabase</strong> — banco de dados e autenticação (armazenamento dos registros)</li>
              <li><strong className="text-zinc-300">Z-API</strong> — envio das mensagens de WhatsApp (recebe o telefone do devedor e o texto da mensagem)</li>
              <li><strong className="text-zinc-300">Stripe</strong> — processamento da sua assinatura (dados de cobrança do Cliente — não dos devedores)</li>
              <li><strong className="text-zinc-300">Resend</strong> — e-mails do serviço, como recuperação de senha (recebe apenas o e-mail do Cliente)</li>
              <li><strong className="text-zinc-300">Google Cloud</strong> — integração com Sheets e Drive, somente quando habilitada pelo Cliente</li>
              <li><strong className="text-zinc-300">Short.io</strong> — encurtamento do link do boleto incluído nas mensagens</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">4. Responsabilidades do Cliente (Controlador)</h3>
            <p>
              Como Controlador, o Cliente declara e é responsável por:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-1">
              <li>Possuir base legal para tratar os dados dos seus devedores (ex.: execução de contrato ou legítimo interesse na cobrança de dívida existente);</li>
              <li>Utilizar a plataforma apenas para cobrança de dívidas legítimas, sem assédio ou abuso;</li>
              <li>Manter seus dados de cadastro corretos e proteger suas credenciais de acesso.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">5. Medidas de segurança</h3>
            <p>
              A NC Finance emprega medidas técnicas e organizacionais <strong className="text-white">apropriadas</strong> para proteger os dados tratados, incluindo:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400 mt-1">
              <li>Comunicação criptografada via HTTPS/TLS em todas as chamadas</li>
              <li>Criptografia dos dados em repouso no banco de dados (Supabase)</li>
              <li>Isolamento entre contas por Row Level Security (RLS) — cada Cliente só acessa seus próprios dados</li>
              <li>Senhas armazenadas apenas como hash (bcrypt via Supabase Auth) — nunca em texto</li>
              <li>Credenciais de APIs terceiras guardadas como secrets de servidor, nunca expostas no frontend</li>
              <li>Telefones de devedores mascarados nos registros de log</li>
            </ul>
            <p className="text-zinc-500">
              Nenhum sistema é 100% imune a incidentes. A NC Finance não garante proteção absoluta, mas compromete-se a manter medidas de segurança compatíveis com as boas práticas de mercado e a comunicar o Cliente e a ANPD, nos termos do art. 48 da LGPD, caso ocorra incidente com risco relevante.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">6. Retenção e devolução dos dados</h3>
            <p>
              Os dados são mantidos enquanto a conta estiver ativa. Ao encerrar a conta, o Cliente pode solicitar a exportação dos seus dados; após o encerramento, a NC Finance elimina os dados dos devedores em prazo razoável, salvo obrigação legal de retenção. O Cliente pode, a qualquer momento, excluir registros individualmente na própria plataforma.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">7. Direitos dos titulares</h3>
            <p>
              Requisições de titulares de dados (os devedores) devem ser dirigidas ao Cliente, na qualidade de Controlador. A NC Finance auxiliará o Cliente a atender esses pedidos — acesso, correção ou eliminação — na medida técnica possível, conforme o art. 18 da LGPD.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-white font-semibold text-base">8. Vigência</h3>
            <p>
              Este Acordo vigora enquanto durar a relação de uso do serviço e é parte integrante dos Termos de Uso e da Política de Privacidade da NC Finance. Alterações relevantes serão comunicadas ao Cliente.
            </p>
          </section>

          <p className="text-zinc-600 text-xs pt-2 border-t border-zinc-900">
            Este documento é um modelo e não substitui aconselhamento jurídico. Recomenda-se revisão por advogado antes do uso comercial.
          </p>

        </div>
      </div>
    </div>
  );
}
