/**
 * DIREKTOR PULTI (V3) — bitta ekran, 6 katta plitka; har biri tegishli sahifani ochadi.
 * Raqamlar serverdan (`t2_rahbar_pult_v1`, «tayyor hisoblar» orqali tez); bu yerda hisob YO'Q.
 * Pul — har doim uchlik (QQS bilan birinchi · ustamali QQS siz · ustamasiz). Noma'lum — «—», nol emas.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { SmetaJamiJuft } from '../../umumiy/ui/SmetaJamiJuft';
import { smetaJuftlik } from '../../lib/smeta-jami';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { useRahbarPult, type RahbarPult } from '../../api/t2-rahbar-pult';

/** Plitka: sarlavha, katta raqam, izoh; butun plitka havola. */
export function Plitka({ yol, nom, children, ost, xavf = false, testId }: {
  yol: string; nom: string; children: ReactNode; ost?: ReactNode; xavf?: boolean; testId?: string;
}) {
  return (
    <Link to={yol} data-testid={testId} aria-label={t(nom)}
      className={`karta group flex min-h-[168px] min-w-0 flex-col gap-2 p-5 transition hover:border-accent ${xavf ? 'border-danger' : ''}`}>
      <span className="flex items-center justify-between text-[12px] font-medium uppercase tracking-[0.04em] text-text-dim">
        {t(nom)}<ArrowUpRight size={16} aria-hidden="true" className="opacity-50 group-hover:opacity-100" />
      </span>
      <div className="min-w-0 text-[22px] font-semibold tabular-nums text-text">{children}</div>
      {ost && <div className="mt-auto text-[13px] text-text-mute tabular-nums">{ost}</div>}
    </Link>
  );
}

const yoq = <span className="text-text-mute">—</span>;
const soniMatn = (n: number) => String(n);

export function PultPlitkalari({ d }: { d: RahbarPult }) {
  const { portfel, bajarildi_oy: oy, hujjat, qarz, kechikkan, xavfli } = d;
  const deb = qarz.debitor;
  const kechSoni = kechikkan.predpisaniya.kechikkan + kechikkan.topshiriq.kechikkan;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Plitka yol="/admin/obyektlar" nom="Portfel" testId="pult-portfel"
        ost={<>{t('Obyektlar')}: {soniMatn(portfel.obyekt_soni)} · {t('Shartnomalar')}: {soniMatn(portfel.shartnoma_soni)}
          {portfel.shartnoma_qqs_bilan != null && <> · {t('Shartnoma, QQS bilan')}: <FmtN val={portfel.shartnoma_qqs_bilan} kasr={0} /></>}</>}>
        {portfel.smeta ? <SmetaJamiJuft juft={smetaJuftlik(portfel.smeta)} kichik kesimYoq /> : yoq}
      </Plitka>

      <Plitka yol="/admin/f2-reestr" nom="Bu oy bajarildi" testId="pult-oy"
        ost={<>{t('Tasdiqlangan aktlar')}: {soniMatn(oy.akt_soni)}{portfel.foiz_shartnoma != null && <> · {t('Shartnomadan')}: {portfel.foiz_shartnoma}%</>}</>}>
        {oy.paket ? <SummaJuft paket={oy.paket} yorliq={t('F2, QQS bilan')} kichik kesimYoq /> : yoq}
      </Plitka>

      <Plitka yol="/admin/f2-reestr" nom="F2 / F3 holati" testId="pult-hujjat"
        ost={<>{t('F2 tekshiruvda')}: {soniMatn(hujjat.f2_tekshiruvda)} · {t('F3 chiqarilgan')}: {soniMatn(hujjat.f3_soni)}</>}
        xavf={hujjat.f3_chiqarilmagan > 0}>
        <span>{soniMatn(hujjat.f2_tasdiqlangan)} <span className="text-[13px] font-normal text-text-mute">{t('F2 tasdiqlangan')}</span></span>
        <span className="mt-1 block text-[15px] font-medium">
          {soniMatn(hujjat.f2_qoralama)} <span className="font-normal text-text-mute">{t('qoralama')}</span> · {soniMatn(hujjat.f3_chiqarilmagan)}{' '}
          <span className="font-normal text-text-mute">{t('F3 chiqarilmagan')}</span>
        </span>
      </Plitka>

      <Plitka yol="/admin/moliya" nom="Qarzlar" testId="pult-qarz" xavf={(deb.yosh?.k60 ?? 0) > 0}
        ost={deb.qiymat == null
          ? t('To‘lov yozuvlari kiritilmagan')
          : <>{t('Hujjatlangan')}: <FmtN val={deb.hujjatlangan} kasr={0} /> · {t('To‘langan')}: <FmtN val={deb.tolangan} kasr={0} />
              {deb.yosh && deb.yosh.k60 > 0 && <> · {t('60 kundan oshgan')}: <FmtN val={deb.yosh.k60} kasr={0} /></>}</>}>
        {deb.qiymat == null ? yoq : <><FmtN val={deb.qiymat} kasr={0} /> <span className="text-[13px] font-normal text-text-mute">{t('QQS bilan, debitor')}</span></>}
      </Plitka>

      <Plitka yol="/admin/murojaatlar" nom="Kechikkanlar" testId="pult-kechikkan" xavf={kechSoni > 0}
        ost={<>{t('Predpisaniya ochiq')}: {soniMatn(kechikkan.predpisaniya.ochiq)} · {t('Topshiriq ochiq')}: {soniMatn(kechikkan.topshiriq.ochiq)}</>}>
        <span>{soniMatn(kechikkan.predpisaniya.kechikkan)} <span className="text-[13px] font-normal text-text-mute">{t('kechikkan predpisaniya')}</span></span>
        <span className="mt-1 block text-[15px] font-medium">{soniMatn(kechikkan.topshiriq.kechikkan)} <span className="font-normal text-text-mute">{t('kechikkan topshiriq')}</span></span>
      </Plitka>

      <Plitka yol="/admin/dashboard" nom="Xavfli obyektlar" testId="pult-xavfli" xavf={xavfli.length > 0}
        ost={xavfli.length === 0 ? t('Xavfli obyekt yo‘q') : t('Batafsil — rahbar paneli')}>
        {xavfli.length === 0 ? yoq : (
          <ul className="flex flex-col gap-1 text-[14px] font-medium">
            {xavfli.slice(0, 3).map((o) => (
              <li key={o.obyekt_id} className="flex items-center justify-between gap-2">
                <span className="truncate">{o.nom}</span>
                {o.kritik > 0 && <span className="fz-chip fz-chip--danger">{o.kritik}</span>}
              </li>
            ))}
            {xavfli.length > 3 && <li className="text-[12px] font-normal text-text-mute">+{xavfli.length - 3}</li>}
          </ul>
        )}
      </Plitka>
    </div>
  );
}

export default function DirektorPult() {
  const { joriy } = useKompaniya();
  const q = useRahbarPult(joriy?.id);
  if (!joriy?.id) return <KompaniyaKerak nima={t('Direktor pulti')} />;
  const d = q.data;
  const yangilanmoqda = !!d && d.kesh.toza_soni < d.kesh.obyekt_soni;
  return (
    <Sahifa sarlavha={t('Direktor pulti')} tavsif={t('Kompaniya bir qarashda: oltita asosiy ko‘rsatkich. Har birini bosing — tegishli sahifa ochiladi.')}
      amallar={<>
        <span className="text-[12px] text-text-mute">{joriy.nom}</span>
        <button type="button" onClick={() => void q.refetch()} className="fz-btn fz-btn--ghost" disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />{t('Yangilash')}
        </button>
      </>}>
      <div className="os-workbench mx-auto flex w-full max-w-[1280px] flex-col gap-4 text-text">
        {q.isLoading && <Skelet qatorlar={6} />}
        {q.isError && (
          <div role="alert" className="fz-note fz-note--danger">
            <AlertTriangle aria-hidden="true" />
            <span>{t('Direktor pulti yuklanmadi. Qayta urinib ko‘ring.')}</span>
            <button type="button" className="fz-btn fz-btn--sm ml-auto" onClick={() => void q.refetch()}>{t('Qayta urinish')}</button>
          </div>
        )}
        {d && <PultPlitkalari d={d} />}
        {yangilanmoqda && (
          <p className="text-[12px] text-text-mute" role="status">
            {t('Ba’zi obyektlar hisobi yangilanmoqda (jonli hisoblanadi), ko‘rsatkichlar to‘g‘ri, lekin sekinroq yuklanishi mumkin.')}
          </p>
        )}
        <p className="text-[12px] text-text-mute">
          <Link className="underline" to="/admin/dashboard">{t('To‘liq rahbar paneli')}</Link>
        </p>
      </div>
    </Sahifa>
  );
}
