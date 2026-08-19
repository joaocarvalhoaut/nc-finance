import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  to: number;
  /** duração da contagem em ms */
  duration?: number;
  decimals?: number;
  prefix?: string;
  className?: string;
}

/**
 * Conta até `to` quando entra na tela. Inspirado no CountUp do reactbits.dev,
 * feito com IntersectionObserver + requestAnimationFrame (robusto, sem
 * dependência nova, compatível com a CSP). Formata em pt-BR (ex.: 48.230,00).
 * Re-anima do valor atual para o novo sempre que `to` muda (ex.: dashboard com
 * dados que atualizam).
 */
export default function CountUp({ to, duration = 1800, decimals = 0, prefix = "", className = "" }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useRef(false);
  const fromRef = useRef(0);
  const rafRef = useRef(0);
  const [val, setVal] = useState(0);

  const fmt = (v: number) =>
    prefix + v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const animate = (target: number) => {
    cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const cur = from + (target - from) * eased;
      setVal(cur);
      fromRef.current = cur;
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else { setVal(target); fromRef.current = target; }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Dispara ao entrar na tela (uma vez).
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          inView.current = true;
          animate(to);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(node);
    return () => { obs.disconnect(); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-anima quando o alvo muda (após já estar visível).
  useEffect(() => {
    if (inView.current) animate(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  // Reserva a largura do valor FINAL (span invisível como "molde") e sobrepõe o
  // valor animado por cima — assim a largura não muda a cada frame e o layout
  // não treme. tabular-nums mantém os dígitos com largura igual.
  return (
    <span ref={ref} className={`relative inline-block whitespace-nowrap tabular-nums ${className}`}>
      <span aria-hidden="true" className="invisible">{fmt(to)}</span>
      <span className="absolute left-0 top-0">{fmt(val)}</span>
    </span>
  );
}
