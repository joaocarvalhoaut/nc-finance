/**
 * Entrada do pré-render da landing (build SSR do Vite, usada só por
 * tools/prerender-landing.mjs — não entra no bundle do navegador).
 *
 * Devolve o HTML da landing e os dados que viram JSON-LD e /llms.txt, todos da
 * mesma fonte que a página usa.
 */
import { renderToString } from "react-dom/server";
import LandingPage from "./components/LandingPage";
import { PLAN_LIST } from "./config/plans";
import { CONTATO_EMAIL, DEFINICAO, DIAS_TESTE, DIFERENCIAIS, PASSOS, PERGUNTAS, SITE_URL } from "./content/landing";

export function renderLanding(): string {
  return renderToString(
    <LandingPage
      onLogin={async () => {}}
      onSignUp={async () => ({ needsEmailConfirmation: false, message: "" })}
      onForgotPassword={async () => {}}
      isAuthLoading={false}
    />,
  );
}

export const conteudo = {
  siteUrl: SITE_URL,
  email: CONTATO_EMAIL,
  definicao: DEFINICAO,
  diasTeste: DIAS_TESTE,
  passos: PASSOS,
  diferenciais: DIFERENCIAIS,
  perguntas: PERGUNTAS,
  planos: PLAN_LIST.map((p) => ({ nome: p.name, preco: p.priceBRL, descricao: p.description, recursos: p.features })),
};
