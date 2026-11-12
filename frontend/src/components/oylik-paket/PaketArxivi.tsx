/** Shartnoma oylik paketi arxivi: har versiya, «topshirilgandan keyin o'zgargan» belgisi va aynan saqlangan ZIP ni yuklab olish. */
import { useCallback, useEffect, useState } from 'react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { oylikPaketlarRoyxati, saqlanganZipniOl, type OylikPaketYozuv } from '../../api/t2-shartnoma-oylik-paket';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { izFarqi } from '../../lib/f2-oylik-paket/shartnoma';
import { paketSanasi } from '../../lib/f2-oylik-paket/ogoh';
import { kimMatni, raqamTozala } from '../../lib/raqam-belgi';

export function PaketArxivi({ kompaniyaId, shartnomaId, yangilash }: { kompaniyaId: number; shartnomaId: number | null; yangilash: number }) {
  const [paketlar, setPaketlar] = useState<OylikPaketYozuv[] | null>(null);
  const [xato, setXato] = useState('');
  const [band, setBand] = useState<number | null>(null);

  const yukla = useCallback(async () => {
    const r = await oylikPaketlarRoyxati({ kompaniyaId, shartnomaId });
    if (r.ok) { setPaketlar(r.paketlar); setXato(''); } else { setPaketlar([]); setXato(r.error); }
  }, [kompaniyaId, shartnomaId]);
  useEffect(() => { void yukla(); }, [yukla, yangilash]);

  async function yuklab(p: OylikPaketYozuv) {
    if (band != null) return;
    setBand(p.id);
    try {
      const z = await saqlanganZipniOl(p);
      if (!z.ok) { toast(z.xato, 'danger'); return; }
      // Aynan saqlangan baytlar: mazmun xeshi bo'yicha qayta yuklash bepul. Ichidagi hujjatlar topshirishda to'langan - ZIP o'zi hisoblangan katak sanamaydi.
      const nom = `ПАКЕТ_${p.shartnoma_raqam}_${p.oy}_v${p.versiya}.zip`.replace(/[\\/:*?"<>|\s]+/g, '_');
      const q = await hujjatTokenBilan({ kompaniyaId, bytes: z.bytes, hujjat: 'SHARTNOMA_OYLIK_PAKET', sabab: `Пакет по договору № ${raqamTozala(p.shartnoma_raqam)} · ${p.oy} · v${p.versiya}`, yacheykalar: 0 }, () => downloadBlob(z.bytes, nom));
      if (!q.ok) toast(q.xabar, 'danger'); else if (q.xabar) toast(q.xabar, 'ok');
    } finally { setBand(null); }
  }

  if (paketlar == null) return <p role="status" className="text-[11.5px] text-text-mute">{t('Arxiv yuklanmoqda…')}</p>;
  return <div className="rounded-lg border border-border/60 p-3" aria-label={t('Topshirilgan paketlar arxivi')}>
    <p className="text-[12px] font-semibold text-text">{t('Topshirilgan paketlar arxivi')}</p>
    {xato && <p className="text-[11.5px] text-danger">{xato}</p>}
    {!paketlar.length ? <p className="text-[11.5px] text-text-mute">{t('Hali topshirilgan paket yo‘q.')}</p> : <ul className="mt-1 space-y-1 text-[12px]">
      {paketlar.map((p) => {
        const ozgargan = izFarqi(p.manifest?.iz, p.hozirgi_iz).length > 0;
        return <li key={p.id} className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-1">
          <b>№ {raqamTozala(p.shartnoma_raqam)}</b><span>{p.oy}</span><span>v{p.versiya}</span><span className="text-text-mute">{paketSanasi(p.vaqt)}{kimMatni(p.kim) ? ` · ${kimMatni(p.kim)}` : ''}</span>
          <span className="text-text-mute">{t('{n} ta fayl', { n: String(p.manifest?.fayllar?.length ?? 0) })}</span>
          {ozgargan && <span className="rounded bg-warn/10 px-1.5 py-0.5 text-warn" title={t('Topshirilgandan keyin fakt yoki F2 o‘zgargan — yangi versiya kerak bo‘lishi mumkin')}>{t('topshirilgandan keyin o‘zgargan')}</span>}
          <button type="button" disabled={band != null || p.hujjat_id == null} onClick={() => void yuklab(p)} className="ml-auto text-accent underline disabled:opacity-50">
            {band === p.id ? '…' : t('ZIP yuklab olish')}</button>
        </li>;
      })}
    </ul>}
  </div>;
}
