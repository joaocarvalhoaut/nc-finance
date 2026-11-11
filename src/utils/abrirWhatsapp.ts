/**
 * Abre a conversa do WhatsApp direto, sem a página intermediária do wa.me
 * ("Continuar para a conversa"): no celular vai para o app, no computador
 * para o WhatsApp Web.
 *
 * Use no onClick de um <a href="https://wa.me/..."> — o href fica como
 * reserva para quem abre sem JavaScript (e para o HTML pré-renderizado).
 * Nada da conta do usuário vai na URL: só o número e um texto genérico.
 */
import type React from "react";

export function abrirWhatsapp(
  e: React.MouseEvent<HTMLAnchorElement>,
  numero: string,
  texto?: string,
): void {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  // Ctrl/Cmd/Shift/botão do meio: deixa o navegador fazer o que o usuário pediu.
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;

  const celular = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const q = texto ? `text=${encodeURIComponent(texto)}` : "";
  const url = celular
    ? `https://wa.me/${numero}${q ? `?${q}` : ""}`
    : `https://web.whatsapp.com/send?phone=${numero}${q ? `&${q}` : ""}`;

  e.preventDefault();
  window.open(url, "_blank", "noopener,noreferrer");
}
