/**
 * ErrorBoundary — captura erros de renderização em qualquer componente filho e
 * mostra uma tela de recuperação em vez de uma tela branca (white screen).
 *
 * React não tem boundary de erro funcional via hooks, então precisa ser classe.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  // @types/react não está instalado neste projeto, então os membros herdados de
  // Component não são tipados — declaramos explicitamente para o tsc.
  declare props: Props;
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Erro inesperado.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Log para o console do navegador (visível em monitoramento/sessão de suporte).
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-white">Algo deu errado</h1>
          <p className="mt-2 text-sm text-zinc-400">
            A tela encontrou um erro inesperado. Recarregue a página para continuar.
            Se o problema persistir, fale com o suporte.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <RefreshCw className="h-4 w-4" /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}
