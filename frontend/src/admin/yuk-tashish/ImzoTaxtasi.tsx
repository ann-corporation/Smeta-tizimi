/** Imzo taxtasi (barmoq bilan chizish). `blob()` — PNG yoki null (hech narsa chizilmagan bo'lsa). */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { t } from '../../i18n/til';

export type ImzoRef = { blob(): Promise<Blob | null>; tozala(): void };

export const ImzoTaxtasi = forwardRef<ImzoRef, { yorliq: string }>(function ImzoTaxtasi({ yorliq }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const chizmoqda = useRef(false);
  const [bor, setBor] = useState(false);
  const nuqta = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * cv.current!.width, y: ((e.clientY - r.top) / r.height) * cv.current!.height }; };
  useImperativeHandle(ref, () => ({
    blob: () => new Promise((res) => { if (!bor || !cv.current) return res(null); cv.current.toBlob((b) => res(b), 'image/png'); }),
    tozala: () => { const c = cv.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setBor(false); },
  }), [bor]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-text-mute">{yorliq}</span>
      <canvas ref={cv} width={600} height={200} aria-label={yorliq} style={{ touchAction: 'none' }} className="w-full rounded-lg border border-border bg-white"
        onPointerDown={(e) => { chizmoqda.current = true; const c = cv.current!.getContext('2d')!; const p = nuqta(e); c.beginPath(); c.moveTo(p.x, p.y); c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#111'; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!chizmoqda.current) return; const c = cv.current!.getContext('2d')!; const p = nuqta(e); c.lineTo(p.x, p.y); c.stroke(); setBor(true); }}
        onPointerUp={() => { chizmoqda.current = false; }} />
      <button type="button" className="self-start text-[12px] underline" onClick={() => { const c = cv.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setBor(false); }}>{t('Tozalash')}</button>
    </div>
  );
});
