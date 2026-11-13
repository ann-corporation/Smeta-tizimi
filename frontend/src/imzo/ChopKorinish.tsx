/**
 * ChopKorinish - hujjatning CHOP KO'RINISHI (brauzer chop oynasi -> «PDF sifatida saqlash»). Xlsx ning kanonik katak qiymatlaridan
 * (lib/imzo/mazmun.ts) oddiy HTML jadval; tepasida manba QR, pastida imzo bloki (tomon, kompaniya, F.I.Sh., sana, kod).
 * Soddalashtirilgan: Excel formatlash (rang, chegara, birlashtirilgan kataklar) saqlanmaydi - asl ko'rinish uchun Excel nusxasi.
 * Faqat kirgan va ruxsati bor odamga ochiladi (asl fayl hujjat-ol orqali olingan).
 */
import { Printer, X } from 'lucide-react';
import { t } from '../i18n/til';
import { qrMatritsa } from '../lib/imzo/qr';
import { sanaMatni, tekshiruvHavolasi } from '../lib/imzo/qr-varaq';
import type { KanonMazmun } from '../lib/imzo/mazmun';
import type { ImzoKorinish } from '../api/t2-imzo';
import { tomonMatni } from '../components/imzo/ImzoUi';

const MAX_QATOR = 3000;
const ustunRaqami = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? 'A')].reduce((s, c) => s * 26 + c.charCodeAt(0) - 64, 0);
const qatorRaqami = (ref: string) => Number(/\d+$/.exec(ref)?.[0] ?? 0);
const qiymat = (tur: string, v: string) => (tur === 'n' ? Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 6 }) : tur === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v);

export function QrSvg({ url, olcham = 96 }: { url: string; olcham?: number }) {
  const m = qrMatritsa(url); const n = m.length; const q = 4; const w = n + q * 2;
  const yol = m.flatMap((r, y) => r.map((d, x) => (d ? `M${x + q} ${y + q}h1v1h-1z` : ''))).join('');
  return <svg role="img" aria-label={t('QR kod')} width={olcham} height={olcham} viewBox={`0 0 ${w} ${w}`} shapeRendering="crispEdges"><rect width={w} height={w} fill="#fff" /><path d={yol} fill="#000" /></svg>;
}

export function ChopKorinish({ kanon, token, origin, sarlavha, imzolar, yopish }: { kanon: KanonMazmun; token: string; origin: string; sarlavha: string; imzolar: readonly ImzoKorinish[]; yopish: () => void }) {
  const url = tekshiruvHavolasi(origin, token);
  return (
    <div className="chop-qobiq" role="dialog" aria-modal="true" aria-label={t('Chop ko‘rinishi')}>
      <style>{`
        .chop-qobiq{position:fixed;inset:0;z-index:1000;background:#fff;color:#000;overflow:auto;padding:16px}
        .chop-qobiq table{border-collapse:collapse;font-size:11px;width:100%;margin:0 0 12px}
        .chop-qobiq td{border:1px solid #bbb;padding:2px 4px;vertical-align:top;word-break:break-word}
        .chop-qobiq .chop-amal{display:flex;gap:8px;margin-bottom:12px}
        @media print{body *{visibility:hidden}.chop-qobiq,.chop-qobiq *{visibility:visible}.chop-qobiq{position:absolute;inset:auto;left:0;top:0;width:100%;overflow:visible;padding:0}.chop-amal{display:none!important}@page{size:A4 landscape;margin:10mm}}
      `}</style>
      <div className="chop-amal">
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => window.print()}><Printer size={14} aria-hidden="true" /> {t('Chop etish')}</button>
        <button type="button" className="fz-btn" onClick={yopish}><X size={14} aria-hidden="true" /> {t('Yopish')}</button>
        <span style={{ fontSize: 12 }}>{t('Chop oynasida «PDF sifatida saqlash» ni tanlang. Bu oddiy jadval ko‘rinishi: Excel formatlash saqlanmaydi.')}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <QrSvg url={url} olcham={94} />
        <div><b style={{ fontSize: 14 }}>{sarlavha}</b><div style={{ fontSize: 11 }}>{url.replace(/^https?:\/\//, '')}</div></div>
      </div>
      {kanon.varaqlar.map((v) => {
        const qator = new Map<number, Map<number, string>>(); let maxU = 0;
        for (const [ref, tur, val] of v.kataklar) {
          const r = qatorRaqami(ref); const u = ustunRaqami(ref); if (r > MAX_QATOR) continue;
          if (!qator.has(r)) qator.set(r, new Map()); qator.get(r)!.set(u, qiymat(tur, val)); maxU = Math.max(maxU, u);
        }
        const raqamlar = [...qator.keys()].sort((a, b) => a - b);
        return (
          <section key={v.nom}>
            <h3 style={{ fontSize: 12, margin: '8px 0 4px' }}>{v.nom}</h3>
            <table><tbody>{raqamlar.map((r) => <tr key={r}>{Array.from({ length: maxU }, (_, i) => <td key={i}>{qator.get(r)!.get(i + 1) ?? ''}</td>)}</tr>)}</tbody></table>
          </section>
        );
      })}
      <section>
        <h3 style={{ fontSize: 12, margin: '8px 0 4px' }}>{t('Imzolar')}</h3>
        {imzolar.length === 0 ? <p style={{ fontSize: 11 }}>{t('Hali imzo qo‘yilmagan.')}</p> : (
          <table><tbody>{imzolar.map((q, i) => (
            <tr key={i}><td>{tomonMatni(q)}</td><td>{q.imzolovchi_kompaniya}</td><td>{q.imzolovchi}</td><td>{t('Elektron imzolangan')}</td><td>{sanaMatni(q.vaqt)}</td><td>{q.kod}</td></tr>
          ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
