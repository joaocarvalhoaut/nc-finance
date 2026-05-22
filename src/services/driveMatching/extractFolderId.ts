/**
 * extractFolderId — extrai o ID de uma pasta do Google Drive a partir de URLs.
 *
 * Suporta:
 *   https://drive.google.com/drive/folders/{id}
 *   https://drive.google.com/drive/u/0/folders/{id}
 *   https://drive.google.com/open?id={id}
 *   https://drive.google.com/drive/u/2/folders/{id}?usp=sharing
 *   Um ID puro (26-45 caracteres alfanuméricos)
 */

/**
 * Extrai o folderId de uma URL do Drive ou retorna null se inválida.
 * Puro (sem side effects). Seguro para uso no frontend.
 */
export function extractFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // Plain ID (no protocol / path)
  if (/^[A-Za-z0-9_-]{25,45}$/.test(s)) return s;

  const patterns: RegExp[] = [
    /\/folders\/([A-Za-z0-9_-]{25,45})/,
    /[?&]id=([A-Za-z0-9_-]{25,45})/,
    /\/d\/([A-Za-z0-9_-]{25,45})/,
  ];

  for (const pattern of patterns) {
    const m = s.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Returns true if the input looks like a valid Drive folder URL or ID.
 */
export function isValidDriveUrl(input: string): boolean {
  return extractFolderId(input) !== null;
}
