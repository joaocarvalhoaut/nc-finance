/**
 * exportRelatorio.ts — Gera e faz download do relatório PDF da Visão Geral.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Debtor } from "../types";

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORY_LABEL: Record<string, string> = {
  vencidos:  "Vencido",
  a_vencer:  "A Vencer",
  liquidado: "Liquidado",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent:    "Enviado",
  failed:  "Falhou",
};

export function exportRelatorio(
  debtors: Debtor[],
  filteredDebtors: Debtor[],
  userEmail: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR");
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // ── Paleta de cores ──────────────────────────────────────────────────────────
  const GREEN  = [16, 185, 129] as const;   // emerald-500
  const DARK   = [24, 24, 27]  as const;   // zinc-900
  const GRAY   = [113, 113, 122] as const; // zinc-500
  const WHITE  = [255, 255, 255] as const;
  const LIGHT  = [244, 244, 245] as const; // zinc-100

  // ── Header bar ───────────────────────────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 22, "F");

  doc.setFontSize(14);
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.text("NC Finance", 10, 13);

  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório da Visão Geral", 10, 19);

  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageW - 10, 12, { align: "right" });
  doc.text(`Usuário: ${userEmail}`, pageW - 10, 18, { align: "right" });

  // ── Linha separadora ─────────────────────────────────────────────────────────
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.5);
  doc.line(0, 22, pageW, 22);

  // ── Totais por categoria ──────────────────────────────────────────────────────
  const totalDebtors  = debtors.length;
  const vencidos      = debtors.filter(d => d.category === "vencidos");
  const aVencer       = debtors.filter(d => d.category === "a_vencer");
  const liquidados    = debtors.filter(d => d.category === "liquidado");

  const totalValor    = debtors.reduce((s, d) => s + (d.updatedValue || d.value), 0);
  const vencidosVal   = vencidos.reduce((s, d) => s + (d.updatedValue || d.value), 0);
  const aVencerVal    = aVencer.reduce((s, d) => s + (d.updatedValue || d.value), 0);
  const liquidadoVal  = liquidados.reduce((s, d) => s + d.value, 0);

  const cards = [
    { label: "Total de Registros", value: String(totalDebtors),   sub: BRL(totalValor) },
    { label: "Vencidos",           value: String(vencidos.length), sub: BRL(vencidosVal),  color: [239, 68, 68] as const },
    { label: "A Vencer",           value: String(aVencer.length),  sub: BRL(aVencerVal),   color: [245, 158, 11] as const },
    { label: "Liquidados",         value: String(liquidados.length), sub: BRL(liquidadoVal), color: [16, 185, 129] as const },
  ];

  const cardW = (pageW - 20) / cards.length;
  cards.forEach((card, i) => {
    const x = 10 + i * cardW;
    const y = 26;

    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, cardW - 3, 22, 2, 2, "F");

    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(card.label.toUpperCase(), x + 4, y + 6);

    const numColor = (card as { color?: readonly [number,number,number] }).color ?? DARK;
    doc.setFontSize(14);
    doc.setTextColor(...numColor);
    doc.setFont("helvetica", "bold");
    doc.text(card.value, x + 4, y + 14);

    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(card.sub, x + 4, y + 20);
  });

  // ── Filtro aplicado ───────────────────────────────────────────────────────────
  const isFiltered = filteredDebtors.length !== debtors.length;
  let tableY = 53;

  if (isFiltered) {
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "italic");
    doc.text(
      `* Filtro aplicado: exibindo ${filteredDebtors.length} de ${totalDebtors} registros`,
      10, tableY,
    );
    tableY += 5;
  }

  // ── Tabela principal ──────────────────────────────────────────────────────────
  const rows = filteredDebtors.map((d) => [
    d.client.slice(0, 35),
    d.supplier?.slice(0, 25) || "—",
    d.document || "—",
    d.dueDate || "—",
    BRL(d.value),
    d.updatedValue && d.updatedValue !== d.value ? BRL(d.updatedValue) : "—",
    CATEGORY_LABEL[d.category] ?? d.category,
    STATUS_LABEL[d.status] ?? d.status,
    d.phone || "—",
  ]);

  autoTable(doc, {
    startY: tableY,
    head: [[
      "Cliente",
      "Fornecedor / S.A",
      "Documento",
      "Vencimento",
      "Valor Original",
      "Valor Atualizado",
      "Categoria",
      "Status",
      "Telefone",
    ]],
    body: rows,
    styles: {
      fontSize: 7,
      cellPadding: 2.5,
      overflow: "ellipsize",
      textColor: [39, 39, 42],
    },
    headStyles: {
      fillColor: [...DARK],
      textColor: [...GREEN],
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 35 },
      2: { cellWidth: 22 },
      3: { cellWidth: 20 },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 18, halign: "center" },
      8: { cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const val = data.cell.raw as string;
        if (val === "Vencido")    { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = "bold"; }
        if (val === "A Vencer")   { data.cell.styles.textColor = [180, 83, 9]; }
        if (val === "Liquidado")  { data.cell.styles.textColor = [16, 185, 129]; }
      }
      if (data.section === "body" && data.column.index === 7) {
        const val = data.cell.raw as string;
        if (val === "Enviado")    { data.cell.styles.textColor = [16, 185, 129]; }
        if (val === "Falhou")     { data.cell.styles.textColor = [220, 38, 38]; }
      }
    },
  });

  // ── Rodapé ────────────────────────────────────────────────────────────────────
  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(
      `NC Finance · Relatório confidencial · Página ${p}/${pageCount}`,
      pageW / 2, doc.internal.pageSize.getHeight() - 5,
      { align: "center" },
    );
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  const fileName = `ncfinance_relatorio_${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
