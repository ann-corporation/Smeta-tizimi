import { AlertTriangle, Info } from 'lucide-react';
import { xatKaliti, xatQatoriNarxi, type HamrohTanlovKalitlari } from '../../lib/smeta-anatomiya/yuklash';
import type { ErkinVaraq, SvodQatorTuri, SvodVaraq, TushunilmaganVaraq } from '../../lib/smeta-anatomiya/turlar';
import { t } from '../../i18n/til';

/**
 * Smeta yuklash — «hamroh varaqlar» paneli (C4 PR-1, 2026-10-26).
 *
 * Svod, tn·km perevozka va «tushunilmadi» varaqlari endi jim tashlanmaydi: anatomiya o'qigan qatorlar shu yerda
 * ko'rinadi. Smetaga hech narsa o'zi yozilmaydi — operator belgilagan tn·km varag'i (har material alohida perevozka
 * resursi) va svod xat qatorlari (yaxlit, resurssiz ish) «Import qilish» da LRV daraxtiga alohida bo'lim bo'lib qo'shiladi.
 */

const fmt = (x: number | null | undefined, kasr = 2): string => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: kasr }));

function turNomi(tur: SvodQatorTuri): string {
  switch (tur) {
    case 'lokal': return t('lokal smeta');
    case 'modda': return t('xarajat moddasi');
    case 'foiz': return t('foizli ustama');
    case 'xat_lumpsum': return t('xat bo‘yicha yaxlit');
    case 'jami': return t('jami');
    case 'nds': return t('НДС');
    case 'snijenie': return t('snijenie / farq');
    case 'buyurtmachi_xarajati': return t('buyurtmachi xarajati');
  }
}

function birlikMatni(m: 1 | 1000 | null | undefined): string {
  return m === 1000 ? t('ming so‘m') : m === 1 ? t('so‘m') : '';
}

function isbotBelgisi(isbot: { tnKm: boolean | null; summa: boolean | null }) {
  if (isbot.tnKm === false || isbot.summa === false) return <span className="text-warn">{t('mos emas')}</span>;
  if (isbot.tnKm && isbot.summa) return <span className="text-success">{t('mos')}</span>;
  return <span className="text-text-mute">{t('tekshirib bo‘lmadi')}</span>;
}

function ndsMatni(v: boolean | null | undefined): string {
  return v === true ? t('НДС bilan') : v === false ? t('НДС siz') : t('НДС holati noma’lum');
}

export function HamrohVaraqlarPaneli({ erkin, svod, tushunilmadi, tanlov, onTanlov }: {
  erkin: readonly ErkinVaraq[];
  svod: readonly SvodVaraq[];
  tushunilmadi: readonly TushunilmaganVaraq[];
  tanlov: HamrohTanlovKalitlari;
  onTanlov: (t: HamrohTanlovKalitlari) => void;
}) {
  const transportlar = erkin.filter((e) => e.rol === 'transport');
  const perevozkaRes = erkin.filter((e) => e.rol === 'perevozka_res');
  const svodlar = svod.filter((s) => s.shakl === 'modda' && s.qatorlar.length);
  if (!transportlar.length && !perevozkaRes.length && !svodlar.length && !tushunilmadi.length) return null;

  const almashTransport = (nom: string, on: boolean) => onTanlov({ ...tanlov, transport: on ? [...tanlov.transport, nom] : tanlov.transport.filter((x) => x !== nom) });
  const almashXat = (k: string, on: boolean) => onTanlov({ ...tanlov, xatlar: on ? [...tanlov.xatlar, k] : tanlov.xatlar.filter((x) => x !== k) });

  return (
    <div className="fz-panel" data-testid="hamroh-varaqlar">
      <p className="text-[12px] font-semibold text-text">{t('Hamroh varaqlar — svod, perevozka va tushunilmagan varaqlar')}</p>
      <p className="text-[11px] text-text-mute">
        {t('Bu varaqlar LRV yoki RES emas. Ularning qatorlari smetaga o‘zi yozilmaydi: kerakli qatorni belgilang — «Import qilish» bosilganda LRV daraxtiga alohida bo‘lim bo‘lib qo‘shiladi.')}
      </p>

      {tushunilmadi.map((x) => (
        <div key={`tu-${x.varaq}`} role="alert" className="fz-note fz-note--warn">
          <AlertTriangle aria-hidden="true" />
          <span>
            {t('«{v}» varag‘i tushunilmadi: {n} ta sonli qator bor, lekin hech bir shakl o‘qimadi.', { v: x.varaq, n: x.sonliQatorlar })}
            {x.engKattaSumma && <> {t('Eng katta summa: {s} ({y}, {q}-qator).', { s: fmt(x.engKattaSumma.qiymat), y: x.engKattaSumma.yorliq || '—', q: x.engKattaSumma.manzil.qator })}</>}
            {' '}{x.taklif}
          </span>
        </div>
      ))}

      {transportlar.map((e) => {
        const qatorlar = e.qatorlar ?? [];
        const tanlangan = tanlov.transport.includes(e.varaq);
        return (
          <details key={`tr-${e.varaq}`} className="pt-1 border-t border-border/40" open={tanlangan}>
            <summary className="text-[12px] cursor-pointer">
              {t('«{v}» — tn·km perevozka hisobi: {n} ta material, ИТОГО {y} so‘m', { v: e.varaq, n: qatorlar.length, y: fmt(e.yakuniy?.qiymat) })}
              {e.jamiMos === true && <span className="text-success"> · {t('qatorlar jami ИТОГО bilan teng')}</span>}
              {e.jamiMos === false && <span className="text-warn"> · {t('qatorlar jami {j} so‘m ИТОГО dan farq qiladi', { j: fmt(e.qatorlarJami) })}</span>}
            </summary>
            {e.svodQatori && (
              <p className="text-[11px] text-text-mute">
                {t('Svodda: «{v}» {q}-qator — {x} ({d})', { v: e.svodQatori.manzil.varaq, q: e.svodQatori.manzil.qator, x: e.svodQatori.xom, d: e.svodQatori.dalil.qoida === 'formula' ? t('formula bilan isbotlangan') : t('faqat qiymat tengligi') })}
              </p>
            )}
            {!qatorlar.length && <p className="text-[11px] text-warn">{t('Material qatorlari ustunlari tanilmadi — smetaga qo‘shib bo‘lmaydi.')}</p>}
            {qatorlar.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-[12px] py-1">
                  <input type="checkbox" aria-label={t('«{v}» — smetaga qo‘shish', { v: e.varaq })} checked={tanlangan} onChange={(ev) => almashTransport(e.varaq, ev.target.checked)} />
                  {t('Smetaga qo‘shish — har material alohida perevozka resursi (т·км), F2 da qisman bajarish mumkin')}
                </label>
                <table className="fz-table text-[11px]">
                  <thead>
                    <tr className="text-text-mute text-left">
                      <th className="font-normal">{t('Material')}</th><th className="font-normal">{t('Tonna')}</th><th className="font-normal">{t('Masofa, km')}</th>
                      <th className="font-normal">{t('т·км')}</th><th className="font-normal">{t('Narx (т·км)')}</th><th className="font-normal">{t('Summa, so‘m')}</th><th className="font-normal">{t('Arifmetika')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qatorlar.map((q) => (
                      <tr key={q.manzil.qator} className="border-t border-border/40">
                        <td>{q.xom}</td><td>{fmt(q.tonna, 3)}</td><td>{fmt(q.masofa, 3)}</td><td>{fmt(q.tnKm, 3)}</td><td>{fmt(q.narx)}</td><td>{fmt(q.summa)}</td>
                        <td>{isbotBelgisi(q.isbot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </details>
        );
      })}

      {perevozkaRes.map((e) => (
        <div key={`pr-${e.varaq}`} className="fz-note fz-note--info">
          <Info aria-hidden="true" />
          <span>
            {t('«{v}» — sarlavhasiz perevozka RES: ИТОГО {y} so‘m. Resurslari RES sifatida o‘qildi (narx manbai).', { v: e.varaq, y: fmt(e.yakuniy?.qiymat) })}
            {e.svodQatori && <> {t('Svodda: «{v}» {q}-qator.', { v: e.svodQatori.manzil.varaq, q: e.svodQatori.manzil.qator })}</>}
          </span>
        </div>
      ))}

      {svodlar.map((s) => {
        const xatlar = s.qatorlar.filter((q) => q.tur === 'xat_lumpsum');
        return (
          <details key={`sv-${s.varaq}`} className="pt-1 border-t border-border/40" open={xatlar.length > 0}>
            <summary className="text-[12px] cursor-pointer">
              {t('«{v}» svodi: {n} ta qator, shundan {x} ta xat bo‘yicha yaxlit qator', { v: s.varaq, n: s.qatorlar.length, x: xatlar.length })}
            </summary>
            <p className="text-[11px] text-text-mute">
              {s.nds ? t('НДС stavkasi svoddan: {p}% ({d})', { p: fmt(s.nds.stavka * 100), d: s.nds.dalil }) : t('НДС stavkasi svodda topilmadi')}
            </p>
            <table className="fz-table text-[11px]">
              <thead>
                <tr className="text-text-mute text-left">
                  <th className="font-normal">{t('Qator')}</th><th className="font-normal">{t('Tur')}</th><th className="font-normal">{t('Nomi')}</th>
                  <th className="font-normal">{t('Hujjatda')}</th><th className="font-normal">{t('Smetaga (НДС siz, so‘m)')}</th><th className="font-normal">{t('Tanlash')}</th>
                </tr>
              </thead>
              <tbody>
                {s.qatorlar.map((q) => {
                  const xat = q.tur === 'xat_lumpsum';
                  const narx = xat ? xatQatoriNarxi(s, q) : null;
                  const k = xatKaliti(s, q);
                  const sabab = q.nusxa ? t('«{v}» {q}-qatorning nusxasi — ikki marta sanalmaydi', { v: q.nusxa.varaq, q: q.nusxa.qator }) : narx?.sabab ?? null;
                  return (
                    <tr key={q.manzil.qator} className="border-t border-border/40">
                      <td>{q.manzil.qator}</td>
                      <td>{turNomi(q.tur)}{q.foiz ? ` ${fmt(q.foiz.foiz, 4)}%` : ''}</td>
                      <td>{q.xom}</td>
                      <td>{q.summa ? `${fmt(q.summa.qiymat)} ${birlikMatni(q.summa.masshtab)} · ${ndsMatni(q.summa.ndsBilan)}` : '—'}</td>
                      <td>{xat ? (narx?.narx != null && !q.nusxa ? fmt(narx.narx) : <span className="text-warn">{sabab}</span>) : ''}</td>
                      <td>
                        {xat && (
                          <input type="checkbox" aria-label={t('{v} — smeta tarkibiga yaxlit qator', { v: q.xom })}
                            disabled={narx?.narx == null || !!q.nusxa}
                            checked={tanlov.xatlar.includes(k)} onChange={(ev) => almashXat(k, ev.target.checked)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {xatlar.length > 0 && (
              <p className="text-[11px] text-text-mute">
                {t('Belgilangan xat qatori smeta TARKIBIGA yaxlit (resurssiz) ish bo‘lib kiradi: kod ustunida «ПИСЬМО ЗАКАЗЧИКА №…», qo‘shimcha ish emas.')}
              </p>
            )}
          </details>
        );
      })}
    </div>
  );
}
