/**
 * ParticipantsPage.tsx — canonical /admin/participants.
 * Wires Codex's ParticipantNetworkPage to the REAL ENT participant backend
 * (t2_loyiha_qatnashchilar_royxat via sbLoyihaQatnashchilarOl). No demo data.
 * EGALIK: Claude (integration lane).
 */
import { useEffect, useState } from 'react';
import { ParticipantNetworkPage } from '../participants/ParticipantNetworkPage';
import type { ProjectParticipant } from '../../components/participants';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { t } from '../../i18n/til';
import { sbT2LoyihalarOl, sbLoyihaQatnashchilarOl, type Loyiha, type LoyihaRol } from '../../api/t2-loyiha';

const ROL_MAP: Record<string, ProjectParticipant['role']> = {
  zakazchik: 'zakazchik', buyurtmachi: 'zakazchik',
  bosh_pudratchi: 'bosh_pudratchi', subpudratchi: 'subpudratchi',
  loyihachi: 'loyihachi', taminotchi: 'taminotchi',
};

export default function ParticipantsPage() {
  const { joriy } = useKompaniya();
  const [loyihalar, setLoyihalar] = useState<Loyiha[]>([]);
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<ProjectParticipant[]>([]);
  const [loyihaNom, setLoyihaNom] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    if (!joriy?.id) return;
    sbT2LoyihalarOl(joriy.id).then((r) => {
      const rows = (r.ok ? (r.qatorlar as Loyiha[]) : []) || [];
      setLoyihalar(rows);
      setLoyihaId((prev) => prev ?? rows[0]?.id ?? null);
    });
  }, [joriy?.id]);

  useEffect(() => {
    if (loyihaId == null) { setParticipants([]); return; }
    setYuklanmoqda(true); setXato(null);
    sbLoyihaQatnashchilarOl(loyihaId).then((r) => {
      setYuklanmoqda(false);
      if (!r.ok) { setXato(r.error || t('Ishtirokchilar o‘qilmadi')); return; }
      const row = (r.qatorlar as any[])?.[0];
      setLoyihaNom(row?.loyiha_nom || '');
      const list: ProjectParticipant[] = (row?.qatnashchilar || []).map((q: any) => ({
        id: String(q.id),
        company: q.kompaniya_nom || q.kontragent_nom || ('Taraf #' + q.id),
        role: ROL_MAP[(q.rol as LoyihaRol) || ''] || 'subpudratchi',
        status: 'active',
        joinedAt: null,
        contact: null,
        contractRelation: q.izoh || null,
      }));
      setParticipants(list);
    });
  }, [loyihaId]);

  if (!joriy?.id) return <KompaniyaKerak nima="Loyiha ishtirokchilari" />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5">
        <label className="flex items-center gap-2 text-[12px] font-medium text-text-dim">{t('Loyiha')}
          <select value={loyihaId ?? ''} onChange={(e) => setLoyihaId(Number(e.target.value))} className="input min-w-[220px] px-2.5 py-1.5 text-[13px]">
            {loyihalar.length === 0 && <option value="">{t('— loyiha yo‘q —')}</option>}
            {loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </select>
        </label>
        <span className="fz-chip">{t('{n} ta ishtirokchi', { n: participants.length })}</span>
      </div>
      <ParticipantNetworkPage
        demo={false}
        projectName={loyihaNom || loyihalar.find((l) => l.id === loyihaId)?.nom || '—'}
        ownerCompany={joriy.nom}
        participants={participants}
        invitations={[]}
        loading={yuklanmoqda}
        error={xato}
      />
      <p className="px-6 pb-6 text-[11.5px] text-text-mute">
        {t('Hozircha faqat loyihadagi mavjud ishtirokchilar ko‘rsatiladi. Yangi ishtirokchini taklif qilish tez orada qo‘shiladi.')}
      </p>
    </div>
  );
}
