/**
 * AosrTaqdimKorinish.tsx — yuborilgan АОСР ning (taqdim snapshoti) o'qish ko'rinishi: buyurtmachi / texnadzor qaror
 * chiqarishdan oldin akt mazmunini ko'radi. Faqat o'qish; qiymat yo'q bo'lsa «—» (o'ylab topilmaydi).
 */
import { t } from '../../i18n/til';
import { sana } from './tomon-yordam';

type Komissiya = { rol?: string; fio?: string; lavozim?: string; tashkilot?: string };
type Protokol = { raqam?: string | null; sana?: string | null; sinov_turi?: string | null; natija?: string | null };
const matn = (v: unknown): string => (typeof v === 'string' && v.trim() ? v : '—');
const kun = (v: unknown): string => (typeof v === 'string' && v ? sana(v).split(',')[0] : '—');

const MAYDONLAR: Array<[string, string]> = [
  ['ish_nomi', 'Ish nomi'], ['ish_tavsifi', 'Ish tavsifi'], ['loyiha_tashkiloti', 'Loyiha tashkiloti'], ['loyiha_hujjati', 'Loyiha hujjati (chizma)'],
  ['materiallar', 'Materiallar va sifat hujjatlari'], ['chetlanishlar', 'Loyihadan chetlanishlar'], ['keyingi_ishlar', 'Keyingi ishlarga ruxsat'], ['izoh', 'Izoh'],
];

export function AosrTaqdimKorinish({ snapshot }: { snapshot: Record<string, unknown> }) {
  const komissiya = Array.isArray(snapshot.komissiya) ? (snapshot.komissiya as Komissiya[]) : [];
  const protokollar = Array.isArray(snapshot.protokollar) ? (snapshot.protokollar as Protokol[]) : [];
  return (
    <div className="fz-table-wrap" data-testid="aosr-taqdim">
      <table className="fz-table">
        <tbody>
          <tr><th className="w-48 text-left">{t('Raqam / sana')}</th><td>№ {matn(snapshot.raqam)} · {kun(snapshot.sana)}</td></tr>
          <tr><th className="text-left">{t('Davr')}</th><td>{kun(snapshot.boshlanish_sana)} — {kun(snapshot.tugash_sana)}</td></tr>
          {MAYDONLAR.map(([k, nom]) => <tr key={k}><th className="text-left">{t(nom)}</th><td className="whitespace-pre-wrap">{matn(snapshot[k])}</td></tr>)}
          <tr><th className="text-left">{t('Bog‘langan smeta ishlari')}</th><td>{Number(snapshot.ish_soni ?? 0)}</td></tr>
          <tr><th className="text-left">{t('Laboratoriya protokollari')}</th>
            <td>{protokollar.length === 0 ? <span className="text-text-mute">{t('ulanmagan')}</span> : protokollar.map((p, i) => <div key={i}>№ {matn(p.raqam)} · {kun(p.sana)} · {matn(p.sinov_turi)} · {matn(p.natija)}</div>)}</td></tr>
          <tr><th className="text-left">{t('Komissiya')}</th>
            <td>{komissiya.length === 0 ? '—' : komissiya.map((k, i) => <div key={i}>{[k.rol, k.fio, k.lavozim, k.tashkilot].filter(Boolean).join(' · ') || '—'}</div>)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
