import { useEffect, useState } from "react";
import { Check, CheckCheck, Clock3, Send, Zap } from "lucide-react";

/**
 * Looping "video-like" simulation: mass WhatsApp collection dispatch
 * rendered inside a new-generation iPhone frame (Dynamic Island, thin bezels).
 * Pure CSS/React animation — no video asset needed, loops forever.
 */

interface SimClient {
  initials: string;
  name: string;
  doc: string;
  value: string;
}

const CLIENTS: SimClient[] = [
  { initials: "CM", name: "Carlos Mendes", doc: "1082-3", value: "R$ 715,66" },
  { initials: "DA", name: "Distrib. Alfa LTDA", doc: "4239-2", value: "R$ 1.240,00" },
  { initials: "MB", name: "Menezes & Batista", doc: "5511-1", value: "R$ 982,40" },
  { initials: "JS", name: "Joana Souza ME", doc: "3304-7", value: "R$ 458,90" },
  { initials: "RF", name: "RF Comércio", doc: "7820-5", value: "R$ 2.103,75" },
  { initials: "PL", name: "Padaria Lumiar", doc: "6647-9", value: "R$ 327,18" },
];

// Dispatch in pairs of 2 → "several messages at the same time".
// Steps 0..2: each step a new pair starts sending; pair delivered next step.
// Steps 3: last pair delivers. Steps 4-5: all-done pause. Then loop.
const GROUPS = CLIENTS.length / 2;
const CYCLE = GROUPS + 3;
const TICK_MS = 1100;

type RowStatus = "idle" | "sending" | "delivered";

function rowStatus(index: number, step: number): RowStatus {
  const group = Math.floor(index / 2);
  if (step < group) return "idle";
  if (step === group) return "sending";
  return "delivered";
}

export default function PhoneDispatchSimulation() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % CYCLE), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const deliveredCount = Math.min(step, GROUPS) * 2;
  const allDone = deliveredCount === CLIENTS.length;

  return (
    <div className="relative w-full max-w-[330px] group select-none">
      {/* Glow ring behind phone */}
      <div className="absolute -inset-2 bg-gradient-to-b from-emerald-500/40 to-emerald-300/10 rounded-[3.4rem] blur-xl opacity-30 group-hover:opacity-45 transition duration-1000" />

      {/* iPhone 17 frame: titanium edge + thin bezels */}
      <div className="relative rounded-[3.2rem] p-[3px] bg-gradient-to-b from-zinc-500 via-zinc-700 to-zinc-600 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="rounded-[3rem] bg-black p-[7px]">
          <div className="relative rounded-[2.6rem] overflow-hidden bg-[#0b141a] aspect-[9/19.2]">

            {/* Dynamic Island */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-24 h-7 bg-black rounded-full z-20 flex items-center justify-end pr-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 ring-1 ring-zinc-800" />
            </div>

            {/* Status bar */}
            <div className="flex justify-between items-center px-7 pt-3.5 pb-1 text-[10px] font-semibold text-zinc-200 relative z-10">
              <span>14:02</span>
              <span className="font-mono text-[9px] text-zinc-400">5G ▮▮▮▯</span>
            </div>

            {/* WhatsApp header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#1f2c34] border-b border-black/30">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#00a884] flex items-center justify-center">
                  <Send className="w-3.5 h-3.5 text-white -rotate-12" />
                </div>
                <div>
                  <div className="text-[12px] font-bold text-zinc-100 leading-tight">WhatsApp</div>
                  <div className="text-[9px] text-[#00a884] leading-tight">NC Finance • disparo em massa</div>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[8px] font-mono uppercase tracking-widest transition-colors duration-500 ${
                  allDone
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-[#00a884]/10 text-[#00a884] border border-[#00a884]/30"
                }`}
              >
                {allDone ? "Concluído" : "Enviando"}
              </span>
            </div>

            {/* Dispatch progress banner */}
            <div className="px-4 py-2 bg-[#0b141a]">
              <div className="flex items-center justify-between text-[9px] text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Zap className={`w-2.5 h-2.5 text-[#00a884] ${allDone ? "" : "animate-pulse"}`} />
                  Cobranças automáticas
                </span>
                <span className="font-mono text-zinc-300">
                  {deliveredCount}/{CLIENTS.length} enviadas
                </span>
              </div>
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00a884] to-emerald-300 transition-all duration-700 ease-out"
                  style={{ width: `${(deliveredCount / CLIENTS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Chat list */}
            <div className="px-2 pt-1 space-y-0.5">
              {CLIENTS.map((c, i) => {
                const status = rowStatus(i, step);
                return (
                  <div
                    key={c.name}
                    className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all duration-500 ${
                      status === "sending"
                        ? "bg-[#00a884]/10 ring-1 ring-[#00a884]/30 scale-[1.02]"
                        : status === "delivered"
                          ? "bg-white/[0.025]"
                          : "opacity-45"
                    }`}
                  >
                    <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-200">
                      {c.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-zinc-100 truncate">{c.name}</span>
                        <span className="text-[8px] text-zinc-500 font-mono shrink-0">14:02</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {status === "idle" && (
                          <span className="text-[9px] text-zinc-500 truncate">Na fila de disparo…</span>
                        )}
                        {status === "sending" && (
                          <>
                            <Clock3 className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                            <span className="text-[9px] text-[#00a884] truncate animate-pulse">
                              Enviando boleto {c.doc}…
                            </span>
                          </>
                        )}
                        {status === "delivered" && (
                          <>
                            <CheckCheck className="w-3 h-3 text-[#53bdeb] shrink-0" />
                            <span className="text-[9px] text-zinc-300 truncate">
                              Boleto {c.doc} • {c.value} 📄
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* All-done toast */}
            <div
              className={`absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-3 py-1.5 backdrop-blur transition-all duration-500 ${
                allDone ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
              }`}
            >
              <Check className="w-3 h-3 text-emerald-300" strokeWidth={3} />
              <span className="text-[9px] font-semibold text-emerald-200 whitespace-nowrap">
                {CLIENTS.length} cobranças entregues
              </span>
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-zinc-600" />
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400 italic">
        Simulação: disparo simultâneo de cobranças com boleto via WhatsApp
      </p>
    </div>
  );
}
