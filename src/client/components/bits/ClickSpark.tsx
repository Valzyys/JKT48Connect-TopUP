// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: the canvas sits above the content (pointer-events none), is
// sized for the device pixel ratio, animates only while sparks are alive, and
// does nothing under reduced motion. Its pixels exist only while sparks do: an
// idle full-section canvas is a large layer the page pays for on every scroll.
import { type ReactNode, useEffect, useRef } from "react";

interface Spark {
  x: number;
  y: number;
  angle: number;
  start: number;
}

export function ClickSpark({ children, color = "currentColor", size = 10, radius = 22, count = 8, duration = 420, className = "" }: { children: ReactNode; color?: string; size?: number; radius?: number; count?: number; duration?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<Spark[]>([]);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** Gives the canvas pixels for the section's current size. */
  function allocate(c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(now: number) {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = color === "currentColor" ? getComputedStyle(c).color : color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    sparks.current = sparks.current.filter((s) => {
      const t = (now - s.start) / duration;
      if (t >= 1) return false;
      const e = t * (2 - t);
      const d = e * radius;
      const len = size * (1 - e);
      ctx.beginPath();
      ctx.moveTo(s.x + d * Math.cos(s.angle), s.y + d * Math.sin(s.angle));
      ctx.lineTo(s.x + (d + len) * Math.cos(s.angle), s.y + (d + len) * Math.sin(s.angle));
      ctx.stroke();
      return true;
    });
    if (sparks.current.length) frame.current = requestAnimationFrame(draw);
    else {
      frame.current = 0;
      c.width = c.height = 0; // release the pixels until the next click
    }
  }

  function spark(e: React.PointerEvent) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = canvas.current!;
    if (!frame.current) allocate(c);
    const r = c.getBoundingClientRect();
    const now = performance.now();
    for (let i = 0; i < count; i++) sparks.current.push({ x: e.clientX - r.left, y: e.clientY - r.top, angle: (2 * Math.PI * i) / count, start: now });
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }

  return (
    <div className={`relative ${className}`} onPointerDown={spark}>
      {children}
      <canvas ref={canvas} width={0} height={0} aria-hidden className="pointer-events-none absolute inset-0 z-10 size-full" />
    </div>
  );
}
