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
 * Conta de 0 até `to` quando entra na tela. Inspirado no CountUp do reactbits.dev,
 * implementado com IntersectionObserver + requestAnimationFrame (robusto, sem
 * dependência nova, compatível com a CSP). Formata em pt-BR (ex.: 48.230,00).
 */
export default function CountUp({ to, duration = 1800, decimals = 0, prefix = "", className = "" }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const [val, setVal] = useState(0);

  const fmt = (v: number) =>
    prefix + v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setVal(to * eased);
        if (p < 1) requestAnimationFrame(step);
        else setVal(to);
      };
      requestAnimationFrame(step);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          run();
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [to, duration]);

  return <span ref={ref} className={className}>{fmt(val)}</span>;
}
