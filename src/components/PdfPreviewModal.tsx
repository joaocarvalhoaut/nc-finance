/**
 * PdfPreviewModal — modal isolado para visualização do PDF do boleto.
 *
 * Mantém o estado FORA do App (componente gigante). Abrir/fechar a prévia
 * re-renderiza apenas este componente, e não a árvore inteira do dashboard —
 * eliminando o delay perceptível ao abrir e ao fechar.
 *
 * Uso:
 *   import { PdfPreviewModal, openPdfPreview } from "./components/PdfPreviewModal";
 *   <PdfPreviewModal />                       // monte uma vez no topo da árvore
 *   openPdfPreview(url, name)                 // chame de qualquer lugar
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { ExternalLink, FileCheck2, Loader2, X } from "lucide-react";

type PdfPreviewState = { url: string; name: string } | null;

let state: PdfPreviewState = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function openPdfPreview(url: string, name?: string) {
  state = { url, name: name || "boleto.pdf" };
  emit();
}

export function closePdfPreview() {
  state = null;
  emit();
}

// Converte a URL do boleto para o formato visualizável dentro de um iframe
// (links do Drive /view → /preview; URLs públicas do Storage servem direto).
function toEmbedUrl(url: string): string {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return url;
}

export function PdfPreviewModal() {
  const pdfPreview = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [loading, setLoading] = useState(true);

  // Reinicia o estado de carregando sempre que muda o PDF exibido.
  useEffect(() => {
    setLoading(true);
  }, [pdfPreview?.url]);

  if (!pdfPreview) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={closePdfPreview}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-white truncate" title={pdfPreview.name}>{pdfPreview.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={pdfPreview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-all inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
            </a>
            <button
              type="button"
              onClick={closePdfPreview}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-zinc-950">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Carregando boleto…</span>
            </div>
          )}
          <iframe
            key={pdfPreview.url}
            src={toEmbedUrl(pdfPreview.url)}
            title={pdfPreview.name}
            onLoad={() => setLoading(false)}
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}
