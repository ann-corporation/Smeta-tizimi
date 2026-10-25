import { useEffect, useRef } from 'react';

/**
 * Girih lattice of 45° rhombi drawn on a 2D canvas. Near the pointer the tiles turn turquoise and grow,
 * like light catching glazed Registan tilework. Static (single draw) under reduced motion; paused off-screen.
 */
export function GirihField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true;
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    let colors = { line: '#2b3338', accent: '#2ec4b6' };
    const readColors = () => {
      const cs = getComputedStyle(canvas);
      colors = { line: cs.getPropertyValue('--border-strong').trim() || colors.line, accent: cs.getPropertyValue('--accent').trim() || colors.accent };
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readColors();
      draw();
    };
    const STEP = 34;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      pointer.x += (pointer.tx - pointer.x) * 0.18;
      pointer.y += (pointer.ty - pointer.y) * 0.18;
      for (let row = -1; row * (STEP / 2) < h + STEP; row++) {
        const y = row * (STEP / 2);
        const off = row % 2 ? STEP / 2 : 0;
        for (let x = -STEP + off; x < w + STEP; x += STEP) {
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          const k = Math.max(0, 1 - d / 190);
          const fade = Math.min(1, Math.max(0.15, 1 - y / (h * 1.05)));
          const s = 3.6 + k * 7.5;
          ctx.globalAlpha = k > 0.02 ? 0.25 + k * 0.75 : 0.32 * fade;
          ctx.fillStyle = k > 0.02 ? colors.accent : colors.line;
          ctx.beginPath();
          ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
          if (k > 0.02) ctx.fill(); else { ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;
    };
    const loop = () => {
      draw();
      const moving = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.5;
      raf = moving && visible ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => { if (!raf && visible && !reduced) raf = requestAnimationFrame(loop); };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = e.clientX - r.left; pointer.ty = e.clientY - r.top;
      if (pointer.x < -9000) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
      kick();
    };
    const onLeave = () => { pointer.tx = -9999; pointer.ty = -9999; pointer.x = -9999; pointer.y = -9999; kick(); draw(); };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    io?.observe(canvas);
    const host = canvas.parentElement;
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onScheme = () => { readColors(); draw(); };
    scheme?.addEventListener?.('change', onScheme);
    if (!reduced && fine && host) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); }
    return () => {
      cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect();
      scheme?.removeEventListener?.('change', onScheme);
      host?.removeEventListener('pointermove', onMove); host?.removeEventListener('pointerleave', onLeave);
    };
  }, []);
  return <canvas ref={ref} className={`entry-girih ${className ?? ''}`} aria-hidden="true" />;
}
