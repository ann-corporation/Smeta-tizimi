import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Paperclip, Send } from 'lucide-react';
import { fikrYubor } from '../../api/t2-agent-ish';
import { hujjatYukla } from '../../api/t2-hujjat-canonical';
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { t } from '../../i18n/til';
import { toast } from './Toast';

const TURLAR: Array<[string, string]> = [['muammo', 'Muammo'], ['fikr', 'Fikr / taklif'], ['etiroz', 'E’tiroz'], ['savol', 'Savol']];
const RASM_TURLARI = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_TAHLIL_BAYT = 1_400_000;
const MATN_NAMUNA = 'Nima bo‘ldi? Nimani kutgan edingiz?';

function base64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Fayl o‘qilmadi'));
    r.readAsDataURL(file);
  });
}

/** Foydalanuvchi fikri/e'tirozi/muammosi + skrinshot → yordamchi agent javob beradi; tozalangan umumiy xulosa tizimni o'rgatadi. */
export function AiFikrPanel({ kompaniyaId, sahifa }: { kompaniyaId: number | undefined; sahifa: string }) {
  const [tur, setTur] = useState('muammo');
  const [matn, setMatn] = useState('');
  const [rasm, setRasm] = useState<File | null>(null);
  const [band, setBand] = useState(false);
  const [javob, setJavob] = useState<string | null>(null);

  const rasmTanla = (f: File | null | undefined) => {
    if (!f) return;
    if (!RASM_TURLARI.includes(f.type)) { toast(t('Faqat PNG, JPG yoki WebP rasm'), 'warn'); return; }
    setRasm(f);
  };

  const yubor = async () => {
    if (!kompaniyaId || matn.trim().length < 3 || band) return;
    setBand(true); setJavob(null);
    try {
      let skrinIds: number[] | undefined; let skrinTahlil: { mimeType: string; data: string } | undefined;
      if (rasm) {
        const l = await sbLoyihaUmumiy(kompaniyaId);
        if (l.ok && l.id) {
          const y = await hujjatYukla({ file: rasm, kompaniyaId, loyihaId: l.id, documentType: 'fikr_skrin' });
          if (y.ok) skrinIds = [y.data.document_id]; else toast(y.xato || t('Skrinshot saqlanmadi'), 'warn');
        }
        if (rasm.size <= MAX_TAHLIL_BAYT) skrinTahlil = { mimeType: rasm.type, data: await base64(rasm) };
      }
      const r = await fikrYubor(kompaniyaId, { tur, matn: matn.trim(), sahifa, skrinIds, skrinTahlil });
      if (!r.ok) { toast(r.error, 'danger'); return; }
      setJavob(r.natija.javob || t('Fikringiz qabul qilindi. Rahmat!'));
      setMatn(''); setRasm(null);
      toast(t('Fikr yuborildi'), 'ok');
    } finally { setBand(false); }
  };

  if (!kompaniyaId) return <p className="p-4 text-sm text-text-dim">{t('Fikr yuborish uchun kompaniyani tanlang')}</p>;
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
      <p className="text-xs text-text-dim">{t('Muammo, fikr yoki e’tirozingizni yozing — skrinshot qo‘shsangiz, AI uni ko‘rib tahlil qiladi. Tizim shu orqali o‘rganadi.')}</p>
      <label className="block">
        <span className="text-xs text-text-dim">{t('Turi')}</span>
        <select value={tur} onChange={(e) => setTur(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5">
          {TURLAR.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
        </select>
      </label>
      <textarea
        value={matn} onChange={(e) => setMatn(e.target.value)} rows={5} maxLength={4000} placeholder={t(MATN_NAMUNA)}
        onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => RASM_TURLARI.includes(x.type)); if (f) { e.preventDefault(); rasmTanla(f); } }}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 focus:outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-white/5">
          <Paperclip size={14} /> {t('Skrinshot')}
          <input type="file" accept={RASM_TURLARI.join(',')} className="hidden" aria-label={t('Skrinshot')} onChange={(e) => rasmTanla(e.target.files?.[0])} />
        </label>
        {rasm && <span className="truncate text-xs text-text-dim">{rasm.name}</span>}
        <button type="button" disabled={band || matn.trim().length < 3} onClick={() => void yubor()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-white disabled:opacity-50">
          <Send size={14} /> {band ? t('Yuborilmoqda…') : t('Yuborish')}
        </button>
      </div>
      {javob && (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-text-mute">{t('AI javobi')}</div>
          <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{javob}</ReactMarkdown></div>
        </div>
      )}
    </div>
  );
}
