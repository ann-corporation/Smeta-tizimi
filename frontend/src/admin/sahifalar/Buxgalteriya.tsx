import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, RefreshCw } from 'lucide-react';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { yangiOperationId } from '../../api/supabase';
import { buxAvto, buxBoshlash, buxHolatOl, buxXato, type AvtoNatija, type BuxHolat } from '../../api/t2-bux-hisob';
import { HisobKitob } from '../buxgalteriya/HisobKitob';
import { Bank } from '../buxgalteriya/Bank';
import { Osv } from '../buxgalteriya/Osv';
import { Nds } from '../buxgalteriya/Nds';
import { Jurnal } from '../buxgalteriya/Jurnal';
import { Sozlama } from '../buxgalteriya/Sozlama';
import { Kartochka } from '../buxgalteriya/Kartochka';
import { Hisobot } from '../buxgalteriya/Hisobot';
import { Saldo } from '../buxgalteriya/Saldo';
import { Tannarx } from '../buxgalteriya/Tannarx';
import { SverkaTomon } from '../buxgalteriya/SverkaTomon';
import { BankAniq } from '../buxgalteriya/BankAniq';
import { Kassa } from '../buxgalteriya/Kassa';
import { useYordamchiSahifaAmallari } from '../../lib/yordamchi/sahifa-amal-store';
import { Izoh, XatoQator } from '../buxgalteriya/umumiy';
import { bugun, bugunOyBoshi, chorakBoshi, kirit, yilBoshi, type Davr } from '../buxgalteriya/yordamchi';

type Tab = 'hisobkitob' | 'bank' | 'osv' | 'kartochka' | 'nds' | 'jurnal' | 'reja' | 'qoida' | 'davr' | 'hisobot' | 'saldo' | 'tannarx' | 'sverka' | 'bankaniq' | 'kassa';
const TABLAR: Array<[Tab, () => string, () => string]> = [
  ['hisobkitob', () => t('Kontragent bilan hisob-kitob'), () => t('Kim bizga qarz, biz kimga qarz — hujjatlargacha, akt-sverka bilan.')],
  ['bank', () => t('Bank va kassa'), () => t('To‘lovlar va bank ko‘chirmasini yuklash.')],
  ['osv', () => t('Oborot-saldo'), () => t('Davr uchun hamma hisoblar: boshlang‘ich saldo, oborot, oxirgi saldo.')],
  ['nds', () => t('QQS reyestri'), () => t('Sotuv va xarid bo‘yicha QQS.')],
  ['kartochka', () => t('Hisob kartochkasi'), () => t('Bitta hisob bo‘yicha hamma provodka va yuruvchi saldo (карточка счёта).')],
  ['jurnal', () => t('Provodkalar jurnali'), () => t('Barcha provodkalar (журнал проводок). Hujjatga o‘tish, qo‘lda provodka va storno.')],
  ['reja', () => t('Hisoblar rejasi'), () => t('Hisoblar ro‘yxati (план счетов); T — buxgalter tasdig‘i kutilmoqda.')],
  ['qoida', () => t('Qoidalar'), () => t('Qaysi hujjat qaysi hisoblarga yoziladi (правила проводок); tomon shabloni.')],
  ['bankaniq', () => t('Bank: aniqlash'), () => t('Bank ko‘chirmasi qatorlari: taklif, bir bosishda qabul, aniqlanmaganlar navbati (выписка банка).')],
  ['kassa', () => t('Kassa'), () => t('Kassa orderlari (ПКО/РКО), kunlik kassa kitobi, chop etish (касса).')],
  ['sverka', () => t('Akt sverki (tomonlar)'), () => t('Ikki kompaniya o‘rtasida akt sverki: ikkala daftardan, qator-ma‘qator farq (акт сверки).')],
  ['hisobot', () => t('Balans va foyda-zarar'), () => t('Balans va foyda-zarar hisoboti jurnaldan (баланс, прибыли и убытки); Excel.')],
  ['tannarx', () => t('Tannarx'), () => t('Obyekt xarajatini sotilgan tannarxga o‘tkazish: ko‘rik, yozish, bekor (себестоимость).')],
  ['saldo', () => t('Boshlang‘ich qoldiq'), () => t('1C dan o‘tish: ОСВ eksportini yuklash, ko‘rik, bitta partiya bilan yozish (начальные остатки).')],
  ['davr', () => t('Davrni yopish'), () => t('Oyni yopish va yopiq oyga yozishni bloklash (закрытие периода).')],
];

export function Buxgalteriya() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const perm = (joriy as { permissions?: string[] } | null | undefined)?.permissions;
  const yozadi = perm ? perm.includes('accounting.write') || perm.includes('financial.write') : true;
  const tasdiqlaydi = perm ? perm.includes('accounting.approve') : true;

  const [holat, setHolat] = useState<BuxHolat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('hisobkitob');
  const [davr, setDavr] = useState<Davr>({ dan: bugunOyBoshi(), gacha: bugun() });
  const [versiya, setVersiya] = useState(0);
  const [jurnalHisob, setJurnalHisob] = useState('');
  const [kutmoqda, setKutmoqda] = useState<AvtoNatija | null>(null);
  const [band, setBand] = useState(false);
  const boshOp = useRef(yangiOperationId());

  const yukla = useCallback(async () => {
    if (!kid) return;
    const r = await buxHolatOl(kid);
    if (r.ok) { setHolat(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  /** Hujjatlardan nechta yangi provodka chiqishini oldindan ko'rsatadi (hech narsa yozilmaydi). */
  const oldindan = useCallback(async () => {
    if (!kid || !holat?.boshlangan) return;
    const r = await buxAvto(kid, true, yangiOperationId());
    if (r.ok) setKutmoqda(r); else setKutmoqda(null);
  }, [kid, holat?.boshlangan]);
  useEffect(() => { void oldindan(); }, [oldindan, versiya]);

  const ozgardi = useCallback(() => { setVersiya((v) => v + 1); void yukla(); }, [yukla]);

  /** Jarvis (yagona yordamchi): «oborotka», «60 schyot kartochkasi», «provodkalar» — kerakli bo'limni ochadi. */
  useYordamchiSahifaAmallari(holat?.boshlangan ? [
    { id: 'bux_osv', nom: t('Oborot-saldo vedomostni ochish'), kalitlar: ['oborotka', 'oborot saldo', 'оборотка', 'осв', 'trial balance'], run: () => setTab('osv') },
    { id: 'bux_kartochka_60', nom: t('60-hisob (6010) kartochkasi'), kalitlar: ['60 schyot kartochkasi', '60 hisob kartochkasi', 'карточка 60', 'карточка счета 60', 'account card 60'], run: () => { setJurnalHisob('6010'); setTab('kartochka'); } },
    { id: 'bux_kartochka', nom: t('Hisob kartochkasini ochish'), kalitlar: ['schyot kartochkasi', 'hisob kartochkasi', 'карточка счета', 'account card'], run: () => setTab('kartochka') },
    { id: 'bux_jurnal', nom: t('Provodkalar jurnalini ochish'), kalitlar: ['provodkalar', 'provodka jurnali', 'проводки', 'журнал проводок', 'journal entries'], run: () => setTab('jurnal') },
    { id: 'bux_reja', nom: t('Hisoblar rejasini ochish'), kalitlar: ['hisoblar rejasi', 'план счетов', 'chart of accounts'], run: () => setTab('reja') },
    { id: 'bux_bankaniq', nom: t('Bank ko‘chirmasini aniqlashni ochish'), kalitlar: ['bank kochirmasi', 'банковская выписка', 'bank statement'], run: () => setTab('bankaniq') },
    { id: 'bux_kassa', nom: t('Kassani ochish'), kalitlar: ['kassa', 'касса', 'cash desk'], run: () => setTab('kassa') },
    { id: 'bux_sverka', nom: t('Akt sverkini ochish'), kalitlar: ['akt sverki', 'акт сверки', 'reconciliation act'], run: () => setTab('sverka') },
    { id: 'bux_balans', nom: t('Balansni ochish'), kalitlar: ['balans', 'баланс', 'balance sheet'], run: () => setTab('hisobot') },
    { id: 'bux_foyda_zarar', nom: t('Foyda zarar hisobotini ochish'), kalitlar: ['foyda zarar hisoboti', 'отчет о прибылях и убытках', 'profit and loss'], run: () => setTab('hisobot') },
    { id: 'bux_saldo', nom: t('Boshlang‘ich qoldiq importini ochish'), kalitlar: ['boshlangich qoldiq', 'начальные остатки', 'opening balances'], run: () => setTab('saldo') },
    { id: 'bux_tannarx', nom: t('Tannarx qadamini ochish'), kalitlar: ['tannarx', 'себестоимость', 'cost of sales'], run: () => setTab('tannarx') },
    { id: 'bux_davr', nom: t('Davrni yopish bo‘limini ochish'), kalitlar: ['davrni yopish', 'закрытие периода', 'close period'], run: () => setTab('davr') },
  ] : []);

  const boshlash = async () => {
    if (!kid) return;
    setBand(true);
    const r = await buxBoshlash(kid, boshOp.current);
    setBand(false);
    if (!r.ok) { setXato(buxXato(r)); boshOp.current = yangiOperationId(); return; }
    toast(t('Hisoblar rejasi yaratildi'), 'ok'); void yukla();
  };

  const yangila = async () => {
    if (!kid) return;
    setBand(true);
    const r = await buxAvto(kid, false, yangiOperationId());
    setBand(false);
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(t('{yangi} ta provodka yozildi, {storno} ta storno', { yangi: r.yangi ?? 0, storno: r.storno ?? 0 }), 'ok');
    if ((r.yopiq_davr_otkazildi ?? 0) > 0) toast(t('{n} ta o‘zgarish yopiq oyga tegishli — yozilmadi (davrni qayta oching)', { n: r.yopiq_davr_otkazildi ?? 0 }), 'danger');
    if ((r.yopiq_davr_ogohlantirish ?? 0) > 0) toast(t('Diqqat: {n} ta provodka yopilgan oyga tushdi', { n: r.yopiq_davr_ogohlantirish ?? 0 }), 'danger');
    ozgardi();
  };

  const tayyor = (kutmoqda?.yangi ?? 0) + (kutmoqda?.storno ?? 0);
  const davrTugma = (nom: string, dan: string) => (
    <button type="button" className="fz-btn" onClick={() => setDavr({ dan, gacha: bugun() })}>{nom}</button>
  );

  return (
    <Sahifa
      sarlavha={t('Buxgalteriya')}
      tavsif={t('Hujjatlardan avtomatik provodka, kontragent hisob-kitobi, bank va QQS. Summalar QQS bilan; Debet — Kredit.')}
      onYangila={() => ozgardi()}
      amallar={(
        <div className="flex gap-2">
          {holat?.boshlangan && yozadi && (
            <button type="button" className="fz-btn" disabled={band || !kid} title={t('Forma-3, to‘lov, ombor kirimi va subpudrat aktlaridan provodka yaratadi. Takror bosish zarar qilmaydi.')} onClick={() => void yangila()}>
              <BookOpen size={14} /> {t('Hujjatlardan yangilash')}{tayyor > 0 ? ` (${tayyor})` : ''}
            </button>
          )}
          <button type="button" className="fz-btn" aria-label={t('Yangilash')} onClick={() => ozgardi()}><RefreshCw size={14} /></button>
        </div>
      )}
    >
      <div className="space-y-3">
        <XatoQator xato={xato} />
        {!kid && <p className="text-[13px] text-text-mute">{t('Kompaniya tanlanmagan')}</p>}
        {kid && holat && !holat.boshlangan && (
          <div className="fz-panel space-y-2">
            <p className="text-[13px]">{t('Buxgalteriya hali yoqilmagan. «Boshlash» hisoblar rejasi (NSBU № 21 asosida namuna) va provodka qoidalarini yaratadi; keyin ularni tahrirlash mumkin.')}</p>
            {yozadi
              ? <button type="button" className="fz-btn" disabled={band} onClick={() => void boshlash()}>{t('Boshlash')}</button>
              : <p className="text-[12px] text-text-mute">{t('Boshlash uchun buxgalteriyani yozish ruxsati kerak.')}</p>}
          </div>
        )}
        {kid && holat?.boshlangan && (
          <>
            {tayyor > 0 && yozadi && (
              <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-[12.5px]">
                {t('Hujjatlardan {n} ta yangi provodka tayyor (hali jurnalga yozilmagan).', { n: tayyor })}
                <button type="button" className="fz-btn" disabled={band} onClick={() => void yangila()}>{t('Yozish')}</button>
              </div>
            )}
            {((kutmoqda?.f3_summasiz ?? 0) > 0 || (kutmoqda?.asos_summasiz ?? 0) > 0) && (
              <p className="flex items-center gap-1 text-[12px] text-warn"><AlertTriangle size={13} />
                {t('Summasi kiritilmagan hujjatlar provodka bermaydi (Forma-3: {f3}, qarz asoslari: {asos}).', { f3: kutmoqda?.f3_summasiz ?? 0, asos: kutmoqda?.asos_summasiz ?? 0 })}
                <Izoh matn={t('Summa noma‘lum bo‘lsa, 0 deb yozilmaydi. Hujjatga summa kiriting.')} />
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Davr: dan')}</span><input type="date" aria-label={t('Davr boshi')} className={`${kirit} w-36`} value={davr.dan} onChange={(e) => e.target.value && setDavr((d) => ({ ...d, dan: e.target.value }))} /></div>
              <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('gacha')}</span><input type="date" aria-label={t('Davr oxiri')} className={`${kirit} w-36`} value={davr.gacha} onChange={(e) => e.target.value && setDavr((d) => ({ ...d, gacha: e.target.value }))} /></div>
              {davrTugma(t('Bu oy'), bugunOyBoshi())}{davrTugma(t('Chorak'), chorakBoshi())}{davrTugma(t('Yil'), yilBoshi())}
            </div>
            <div role="tablist" aria-label={t('Buxgalteriya bo‘limlari')} className="flex flex-wrap gap-1 border-b border-border">
              {TABLAR.map(([k, nom, izoh]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} title={izoh()} onClick={() => setTab(k)}
                  className={`px-3 py-1.5 text-[12.5px] ${tab === k ? 'border-b-2 border-accent font-semibold text-text' : 'text-text-mute hover:text-text'}`}>{nom()}</button>
              ))}
            </div>
            <div role="tabpanel">
              {tab === 'hisobkitob' && <HisobKitob kid={kid} davr={davr} versiya={versiya} />}
              {tab === 'bank' && <Bank kid={kid} davr={davr} versiya={versiya} onOzgardi={ozgardi} />}
              {tab === 'osv' && <Osv kid={kid} davr={davr} versiya={versiya} onHisob={(k) => { setJurnalHisob(k); setTab('kartochka'); }} />}
              {tab === 'kartochka' && <Kartochka kid={kid} davr={davr} versiya={versiya} hisoblar={holat.hisoblar} hisob={jurnalHisob} onHisob={setJurnalHisob} />}
              {tab === 'bankaniq' && <BankAniq kid={kid} versiya={versiya} yozadi={yozadi} onOzgardi={ozgardi} />}
              {tab === 'kassa' && <Kassa kid={kid} davr={davr} versiya={versiya} hisoblar={holat.hisoblar} yozadi={yozadi} onOzgardi={ozgardi} />}
              {tab === 'sverka' && <SverkaTomon kid={kid} davr={davr} versiya={versiya} />}
              {tab === 'hisobot' && <Hisobot kid={kid} davr={davr} versiya={versiya} />}
              {tab === 'tannarx' && <Tannarx kid={kid} onOzgardi={ozgardi} tasdiqlaydi={tasdiqlaydi} />}
              {tab === 'saldo' && <Saldo kid={kid} onOzgardi={ozgardi} tasdiqlaydi={tasdiqlaydi} />}
              {tab === 'nds' && <Nds kid={kid} davr={davr} versiya={versiya} />}
              {tab === 'jurnal' && <Jurnal kid={kid} davr={davr} versiya={versiya} hisoblar={holat.hisoblar} hisob={jurnalHisob} onHisob={setJurnalHisob} onOzgardi={ozgardi} yozadi={yozadi} />}
              {(tab === 'reja' || tab === 'qoida' || tab === 'davr') && <Sozlama kid={kid} holat={holat} onOzgardi={ozgardi} yozadi={yozadi} tasdiqlaydi={tasdiqlaydi} bolim={tab} versiya={versiya} />}
            </div>
          </>
        )}
      </div>
    </Sahifa>
  );
}

export default Buxgalteriya;
