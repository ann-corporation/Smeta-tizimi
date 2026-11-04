/**
 * Bitim bosqichini o'zgartirish (kanban kartasi va bitim kartasi uchun bitta joy):
 *  oddiy o'tish — bitimSaqla (kutilgan_versiya bilan); «bron» — faqat bron dialogi; «shartnoma» — birlik va summa
 *  bo'lsa, tasdiq bilan (birlik SOTILGAN bo'ladi); «bekor» — sabab so'raladi. Bronni bo'shatish — bronBekor.
 */
import { useState } from 'react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import { bitimSaqla, bronBekor, type Bosqich } from '../../api/t2-sotuv';
import { otishlar, shartnomaYetishmaydi } from '../../lib/sotuv/bitim-korinish';
import { Maydon } from './umumiy';
import { BOSQICH_NOMI, kirit, useSotuvYangila, xatoMatn } from './sotuv-umumiy';
import { BronDialog } from './ShaxmatkaDialoglar';

export type BosqichBitim = { id: number; versiya: number; bosqich: Bosqich; birlik_id: number | null; summa: number | null; mijoz: string };

export function BosqichTanla({ kid, bitim, binolar, kartaOch, ixcham = false }: {
  kid: number; bitim: BosqichBitim; binolar: ReadonlyArray<{ id: number; nom: string }>; kartaOch?: (id: number) => void; ixcham?: boolean;
}) {
  const [dialog, setDialog] = useState<null | 'bron' | 'bekor'>(null);
  const [band, setBand] = useState(false);
  const yangila = useSotuvYangila();
  const variant = otishlar(bitim.bosqich);
  if (!variant.length) return null;

  const ot = async (b: Bosqich) => {
    const o = variant.find((x) => x.bosqich === b);
    if (!o) return;
    if (o.tur === 'bron') { setDialog('bron'); return; }
    if (o.tur === 'bekor') { setDialog('bekor'); return; }
    if (o.tur === 'shartnoma') {
      const yoq = shartnomaYetishmaydi(bitim);
      if (yoq.length) {
        toast(yoq.includes('birlik') ? t('Shartnoma uchun birlik tanlang.') : t('Shartnoma summasi kerak.'), 'warn');
        kartaOch?.(bitim.id);
        return;
      }
      if (!(await tasdiqSora({ matn: t('Shartnoma tuzilsinmi? Birlik «Sotilgan» bo‘ladi.') }))) return;
    }
    setBand(true);
    const r = await bitimSaqla(kid, { id: bitim.id, kutilgan_versiya: bitim.versiya, bosqich: b });
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); yangila(); return; }
    toast(t('Bosqich: {b}', { b: BOSQICH_NOMI[b]() })); yangila();
  };

  return (
    <>
      <select className={`${kirit} ${ixcham ? 'py-0.5 text-[11.5px]' : ''}`} value="" disabled={band} aria-label={t('Bosqichni o‘zgartirish')}
        onChange={(e) => { const v = e.target.value as Bosqich; e.target.value = ''; if (v) void ot(v); }}>
        <option value="">{t('O‘tkazish…')}</option>
        {variant.map((o) => <option key={o.bosqich} value={o.bosqich}>{BOSQICH_NOMI[o.bosqich]()}</option>)}
      </select>
      {dialog === 'bron' && (
        <BronDialog kid={kid} bitim={{ id: bitim.id, mijoz: bitim.mijoz }} binolar={binolar} yop={() => setDialog(null)} tayyor={() => setDialog(null)} />
      )}
      {dialog === 'bekor' && <BekorDialog kid={kid} bitim={bitim} yop={() => setDialog(null)} />}
    </>
  );
}

function BekorDialog({ kid, bitim, yop }: { kid: number; bitim: BosqichBitim; yop: () => void }) {
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const yangila = useSotuvYangila();
  const saqla = async () => {
    setBand(true);
    const r = await bitimSaqla(kid, { id: bitim.id, kutilgan_versiya: bitim.versiya, bosqich: 'bekor', bekor_sabab: sabab.trim() });
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); yangila(); return; }
    toast(t('Bitim bekor qilindi')); yangila(); yop();
  };
  return (
    <ModalOyna sarlavha={t('Bitimni bekor qilish')} yop={yop} kenglik={420}>
      <div className="space-y-3 text-[13px]">
        <p className="text-text-dim">{t('Bron va sotilgan birlik bo‘shatiladi, grafik o‘chiriladi. Bekor qilingan bitim qayta ochilmaydi.')}</p>
        <Maydon nom={t('Sabab')}><input className={kirit} value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Sabab')} autoFocus /></Maydon>
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--danger" disabled={!sabab.trim() || band} onClick={saqla}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}

/** Faol bronni bo'shatish (bitim «Ko'rsatildi» ga qaytadi). */
export function BronBekorTugma({ kid, bronId }: { kid: number; bronId: number }) {
  const [och, setOch] = useState(false);
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const yangila = useSotuvYangila();
  const saqla = async () => {
    setBand(true);
    const r = await bronBekor(kid, bronId, sabab.trim());
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('Bron bekor qilindi')); yangila(); setOch(false);
  };
  return (
    <>
      <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setOch(true)}>{t('Bronni bekor qilish')}</button>
      {och && (
        <ModalOyna sarlavha={t('Bronni bekor qilish')} yop={() => setOch(false)} kenglik={420}>
          <div className="space-y-3 text-[13px]">
            <Maydon nom={t('Sabab')}><input className={kirit} value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Sabab')} autoFocus /></Maydon>
            <div className="flex justify-end gap-2">
              <button type="button" className="fz-btn fz-btn--ghost" onClick={() => setOch(false)}>{t('Yopish')}</button>
              <button type="button" className="fz-btn fz-btn--danger" disabled={!sabab.trim() || band} onClick={saqla}>{t('Bronni bekor qilish')}</button>
            </div>
          </div>
        </ModalOyna>
      )}
    </>
  );
}
