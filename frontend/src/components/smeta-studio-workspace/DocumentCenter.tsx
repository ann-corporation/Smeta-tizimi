import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n/til';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import { workspaceReview } from '../../lib/smeta-studio/workspace-review';

/** Reuses the real generators and canonical object documents; never fabricates execution. */
export function DocumentCenter({doc,calculation,children,onReview}: {doc:EstimateDoc;calculation:DocCalc;children:ReactNode;onReview:()=>void}) {
  const issues=workspaceReview(doc,calculation),objectId=doc.context.objectId;
  const routes=[{path:'f2-tayyorlash',title:'F-2 tayyorlash',description:'Bajarilgan hajmlar va obyektning amaldagi smetasi bo‘yicha'},
    {path:'f2-reestr',title:'F-2 reestri',description:'Bajarilgan ishlar hujjatlari va tasdiqlash holati'},
    {path:'oferta',title:'Tijorat taklifi',description:'Obyekt uchun mavjud oferta ish joyi'}];
  return <section className="space-y-4" aria-label={t('Hujjatlar markazi')}>
    <div className="karta flex flex-wrap items-center gap-3 p-4"><div className="flex-1"><h2 className="text-lg font-semibold">{t('Hujjatlar markazi')}</h2><p className="text-xs text-text-dim">{doc.context.title || doc.context.objectLabel || t('Joriy smeta')} · {t('Qoralama — tasdiqlanmagan')}</p></div><button className="tugma px-3 py-2" onClick={onReview}>{t('Ochiq masalalar')}: {issues.length}</button></div>
    {children}
    <div className="karta p-4 space-y-3"><h3 className="font-medium">{t('Obyekt hujjatlari')}</h3><p className="text-xs text-text-dim">{t('Bu hujjatlar obyektning tasdiqlangan smetasi va bajarilish ma’lumotlaridan olinadi. Studio qoralamasi ularni avtomatik almashtirmaydi.')}</p>
      <div className="grid gap-3 md:grid-cols-3">{routes.map(route=><div key={route.path} className="rounded-lg border border-border p-3"><p className="font-medium">{t(route.title)}</p><p className="my-2 text-xs text-text-dim">{t(route.description)}</p>{objectId ? <Link className="text-sm text-accent underline" to={`/admin/${route.path}?obyekt=${objectId}`}>{t('Ish joyini ochish')} →</Link> : <span className="text-xs text-text-dim">{t('Avval smetani obyektga bog‘lang')}</span>}</div>)}</div>
    </div>
  </section>;
}
