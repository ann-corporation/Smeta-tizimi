/**
 * KalitlarKarta - «Mening imzom»: bu qurilmada kalit yaratish, qurilmalar ro'yxati, bekor qilish (yo'qotilgan qurilma).
 * Maxfiy kalit brauzerda qoladi (ECDSA P-256, extractable:false, IndexedDB); serverga faqat ochiq kalit ketadi.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Smartphone } from 'lucide-react';
import { t } from '../../i18n/til';
import { Karta, Nota, INPUT_SINF, INPUT_STIL } from '../akkaunt/AkkauntUi';
import { Lbl } from './ImzoUi';
import { kalitBekorQil, kalitYaratVaYubor, kalitlarOl, xatoMatni, type QurilmaKalit } from '../../api/t2-imzo';
import { qurilmaKaliti, webCryptoBormi } from '../../lib/imzo/kalit-saqlash';
import { barmoqIzi } from '../../lib/imzo/yadro';
import { sanaMatni } from '../../lib/imzo/qr-varaq';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';

function Izi({ kalit }: { kalit: string }) {
  const [s, setS] = useState('');
  useEffect(() => { let ok = true; void barmoqIzi(kalit).then((x) => { if (ok) setS(x); }); return () => { ok = false; }; }, [kalit]);
  return <code className="text-[12px]">{s}</code>;
}

export function KalitlarKarta({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['imzo-kalitlar'], queryFn: async () => { const r = await kalitlarOl(); if (!r.ok) throw new Error(r.code); return r.kalitlar; } });
  const mahalliy = useQuery({ queryKey: ['imzo-mahalliy', userId], queryFn: () => qurilmaKaliti(userId) });
  const [nom, setNom] = useState(() => (typeof navigator !== 'undefined' ? (navigator.platform || 'Qurilma') : 'Qurilma'));
  const [parol, setParol] = useState('');
  const [bekorId, setBekorId] = useState<string | null>(null);
  const [sabab, setSabab] = useState(''); const [shubhali, setShubhali] = useState(false);
  const yangila = () => { void qc.invalidateQueries({ queryKey: ['imzo-kalitlar'] }); void qc.invalidateQueries({ queryKey: ['imzo-mahalliy', userId] }); };

  const yarat = useMutation({
    mutationFn: async () => { const r = await kalitYaratVaYubor(userId, nom.trim(), parol || null); if (!r.ok) throw new Error(r.code); },
    onSuccess: () => { setParol(''); toast(t('Bu qurilmada imzo kaliti yaratildi'), 'ok'); yangila(); },
    onError: (e: Error) => toast(xatoMatni(e.message), 'danger'),
  });
  const bekor = useMutation({
    mutationFn: async (k: QurilmaKalit) => { const r = await kalitBekorQil(userId, k.id, sabab.trim(), shubhali ? new Date().toISOString() : null); if (!r.ok) throw new Error(r.code); },
    onSuccess: () => { setBekorId(null); setSabab(''); setShubhali(false); toast(t('Kalit bekor qilindi'), 'ok'); yangila(); },
    onError: (e: Error) => toast(xatoMatni(e.message), 'danger'),
  });

  const bormi = webCryptoBormi();
  const faol = (q.data ?? []).filter((k) => !k.bekor_vaqt);
  const buQurilmadaFaol = !!mahalliy.data?.kalit_id && faol.some((k) => k.id === mahalliy.data?.kalit_id);

  return (
    <Karta sarlavha="Mening imzom" tavsif="Hujjatga shaxsiy elektron imzo qo‘yish uchun har qurilmada alohida kalit. Maxfiy kalit shu qurilmadan chiqmaydi.">
      <Nota tur="info">{t('Bu tizim ichidagi kriptografik imzo: hujjat o‘zgarsa darhol bilinadi. U O‘zbekiston qonunchiligidagi ERI (E-IMZO) o‘rnini bosmaydi.')}</Nota>
      {!bormi && <Nota tur="warn">{t('Bu brauzer kalitni xavfsiz saqlay olmaydi (IndexedDB/WebCrypto yo‘q yoki yopiq rejim).')}</Nota>}
      {bormi && !buQurilmadaFaol && (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) yarat.mutate(); }}>
          <Lbl yorliq="Qurilma nomi"><input className={INPUT_SINF} style={INPUT_STIL} value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} /></Lbl>
          <Lbl yorliq="Parol (qayta autentifikatsiya)" yordam="Parolli hisob uchun shart. Parolsiz kirgan bo‘lsangiz (Google/kod) - yaqinda kirgan bo‘lishingiz kerak.">
            <input className={INPUT_SINF} style={INPUT_STIL} type="password" autoComplete="current-password" value={parol} onChange={(e) => setParol(e.target.value)} />
          </Lbl>
          <button type="submit" className="fz-btn fz-btn--primary self-start" disabled={yarat.isPending || !nom.trim()}><KeyRound size={14} aria-hidden="true" /> {t('Bu qurilmada kalit yaratish')}</button>
        </form>
      )}
      {buQurilmadaFaol && <Nota tur="info">{t('Bu qurilmada faol kalit bor - hujjatlarni imzolashingiz mumkin.')}</Nota>}
      {q.isError && <Nota tur="danger">{xatoMatni((q.error as Error).message)}</Nota>}
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {(q.data ?? []).map((k) => (
          <li key={k.id} className="rounded-md border border-[var(--border)] p-3 flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[13px] flex items-center gap-1"><Smartphone size={14} aria-hidden="true" /> {k.qurilma}{k.id === mahalliy.data?.kalit_id ? ` (${t('shu qurilma')})` : ''}</b>
              <span className="text-[12px]" style={{ color: k.bekor_vaqt ? 'var(--danger, #cf222e)' : 'var(--ok, #1a7f37)' }}>{k.bekor_vaqt ? t('Bekor qilingan') : t('Faol')}</span>
            </div>
            <span className="text-[12px] text-text-dim">{t('Yaratilgan')}: {sanaMatni(k.yaratilgan)} · {t('Barmoq izi')}: <Izi kalit={k.ochiq_kalit} /></span>
            {k.bekor_vaqt && <span className="text-[12px] text-text-dim">{t('Bekor qilingan')}: {sanaMatni(k.bekor_vaqt)} - {k.bekor_sabab}{k.shubhali_dan ? ` · ${t('Shubhali vaqtdan')}: ${sanaMatni(k.shubhali_dan)}` : ''}</span>}
            {!k.bekor_vaqt && bekorId !== k.id && <button type="button" className="fz-btn self-start" onClick={() => setBekorId(k.id)}>{t('Bekor qilish')}</button>}
            {bekorId === k.id && (
              <form className="flex flex-col gap-2 mt-1" onSubmit={(e) => { e.preventDefault(); if (sabab.trim().length >= 3) bekor.mutate(k); }}>
                <Lbl yorliq="Sabab"><input className={INPUT_SINF} style={INPUT_STIL} value={sabab} maxLength={200} onChange={(e) => setSabab(e.target.value)} placeholder={t('masalan: qurilma yo‘qoldi')} /></Lbl>
                <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={shubhali} onChange={(e) => setShubhali(e.target.checked)} /> {t('Qurilma yo‘qolgan/egallangan: shu paytdan keyingi shu kalitdagi imzolar «shubhali» deb belgilansin')}</label>
                <div className="flex gap-2">
                  <button type="submit" className="fz-btn fz-btn--primary" disabled={bekor.isPending || sabab.trim().length < 3}>{t('Bekor qilishni tasdiqlash')}</button>
                  <button type="button" className="fz-btn" onClick={() => setBekorId(null)}>{t('Yopish')}</button>
                </div>
              </form>
            )}
          </li>
        ))}
        {q.data && !q.data.length && <li className="text-[13px] text-text-dim">{t('Hali kalit yaratilmagan.')}</li>}
      </ul>
    </Karta>
  );
}

/** Akkaunt markazi bo'limi. */
export function ImzoBolimi() {
  const k = useKompaniya();
  const id = k.foydalanuvchi?.id;
  if (!id) return <Karta sarlavha="Mening imzom"><Nota tur="warn">{t('Foydalanuvchi aniqlanmadi. Qaytadan kiring.')}</Nota></Karta>;
  return <KalitlarKarta userId={id} />;
}
