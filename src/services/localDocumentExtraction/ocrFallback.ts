/**
 * OCR fallback using tesseract.js (optional dependency).
 *
 * tesseract.js is NOT listed in package.json intentionally — it weighs ~5 MB
 * of WASM plus ~3–15 MB of language data.  Install it when scanned-PDF support
 * is needed:
 *
 *   npm install tesseract.js
 *
 * This module dynamically imports the library at runtime.  If it is not
 * installed, every exported function returns an empty string gracefully.
 */

const OCR_LANG = "por"; // Portuguese

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

async function tryLoadTesseract(): Promise<
  { createWorker: (lang: string, oem?: number, opts?: Record<string, unknown>) => Promise<{
    recognize: (img: Blob | string) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  }> } | null
> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import("tesseract.js" as any);
    return mod as { createWorker: (...args: unknown[]) => Promise<unknown> } as ReturnType<typeof tryLoadTesseract> extends Promise<infer T> ? T : never;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Run OCR on a single image blob (or data URL).
 * Returns empty string if tesseract.js is unavailable.
 */
export async function extractTextWithOCR(imageData: Blob | string): Promise<string> {
  const tesseract = await tryLoadTesseract();
  if (!tesseract) return "";

  try {
    const worker = await tesseract.createWorker(OCR_LANG, 1, {
      logger: () => {}, // silence progress logs
    });
    const { data } = await worker.recognize(imageData);
    await worker.terminate();
    return data.text ?? "";
  } catch (err) {
    console.warn(
      "[ocr.fallback] OCR failed:",
      err instanceof Error ? err.message : String(err),
    );
    return "";
  }
}

/**
 * Render each page of a PDF to a canvas and run OCR.
 * Returns joined text from up to MAX_PAGES pages.
 *
 * Requires a browser environment (canvas + pdfjs).
 * Returns empty string silently when running server-side or when tesseract is
 * not installed.
 */
export async function extractOCRFromPdfFile(file: File): Promise<string> {
  if (typeof document === "undefined") return ""; // server-side guard

  const MAX_PAGES = 5;
  const RENDER_SCALE = 2.0; // higher = better OCR quality, more RAM

  try {
    const { getDocument, GlobalWorkerOptions } = await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    );
    const { default: workerSrc } = await import(
      "pdfjs-dist/build/pdf.worker.min.mjs?url"
    );
    GlobalWorkerOptions.workerSrc = workerSrc as string;

    const buffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    const parts: string[] = [];

    for (let n = 1; n <= pageCount; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) continue;

      const text = await extractTextWithOCR(blob);
      if (text.trim()) parts.push(text);
    }

    return parts.join("\n");
  } catch (err) {
    console.warn(
      "[ocr.pdf] Failed to OCR PDF pages:",
      err instanceof Error ? err.message : String(err),
    );
    return "";
  }
}
