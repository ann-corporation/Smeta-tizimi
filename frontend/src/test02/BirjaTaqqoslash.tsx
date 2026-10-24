import { t } from '../i18n/til';
import { FmtN } from '../lib/format';
import { birjaQatori } from '../lib/yetkazuvchi/birja-moslash';
import { qatorniTaqqosla } from '../lib/yetkazuvchi/taqqoslash';
import type { BirjaRfq, BirjaTaklif } from '../api/t2-birja';

/** RFQ takliflarini taqqoslash jadvali: har yetkazuvchi narxi (NDS siz), o'rtacha, eng arzon. Ma'lumot yo'q bo'lsa bo'sh holat. */
export function BirjaTaqqoslash({ rfq, takliflar }: { rfq: BirjaRfq; takliflar: BirjaTaklif[] }) {
  if (takliflar.length === 0) return <p className="text-sm text-text-dim">{t("Hozircha taqqoslash uchun taklif yo'q.")}</p>;
  const q = birjaQatori(rfq, takliflar);
  const r = qatorniTaqqosla(q);
  const oxirgi = new Map(q.takliflar.map((x) => [x.yetkazuvchiId, x]));
  const qatorlar = [...oxirgi.values()].sort((a, b) => (a.narx ?? Infinity) - (b.narx ?? Infinity));
  return (
    <div className="mb-6 bg-surface border border-border rounded-xl p-4">
      <div className="flex flex-wrap gap-4 mb-3 text-sm">
        <div><span className="text-text-dim">{t("O'rtacha narx (NDS siz)")}: </span>{r.ortacha == null ? '—' : <b className="text-sky-400"><FmtN val={r.ortacha} /></b>}</div>
        <div><span className="text-text-dim">{t("Eng arzon")}: </span>{r.eng?.narx == null ? '—' : <b className="text-emerald-400"><FmtN val={r.eng.narx} /></b>}</div>
      </div>
      {r.xabar && <p className="text-xs text-amber-400 mb-3">{t("{n} ta yetkazuvchi narxi o'rtachalandi", { n: r.narxliSoni })}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-text-dim text-xs uppercase"><th className="py-1">{t("Yetkazuvchi")}</th><th className="py-1 text-right">{t("Narx, NDS siz")}</th><th className="py-1 text-right">{t("O'rtachadan farq")}</th></tr></thead>
        <tbody>
          {qatorlar.map((x) => {
            const farq = x.narx != null && r.ortacha ? ((x.narx - r.ortacha) / r.ortacha) * 100 : null;
            return (
              <tr key={x.yetkazuvchiId} className="border-t border-border/50">
                <td className="py-1.5">{t("Kompaniya")} {x.yetkazuvchiNom}{r.eng?.yetkazuvchiId === x.yetkazuvchiId && <span className="ml-2 text-[10px] text-emerald-400 font-bold uppercase">{t("Eng arzon")}</span>}</td>
                <td className="py-1.5 text-right font-mono">{x.narx == null ? '—' : <FmtN val={x.narx} />}</td>
                <td className="py-1.5 text-right font-mono text-text-dim">{farq == null ? '—' : `${farq > 0 ? '+' : ''}${farq.toFixed(1)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
