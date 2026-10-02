/**
 * DocumentsPage.tsx — canonical /admin/documents = FAYL MENEJERI (egasi 2026-10-02: "saytdagi R2 ni xuddi fayl
 * exploreri darajasida"). Eski DocumentCenter ro'yxati (yassi ro'yxat + Drive replika holati) shu sahifada
 * almashtirildi — bitta hujjat ro'yxati, dublikat yo'q.
 *   o'qish: /api/sb `fayl_explorer_v1` (a'zolik serverda) · yuklab olish: /api/hujjat-ol (R2) · yuklash: /api/hujjat-yukla.
 * Drive/Sheets — faqat replika; kanonik haqiqat R2 + Supabase.
 */
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { FaylMenejer } from '../sahifalar/FaylMenejer';

export default function DocumentsPage() {
  const { joriy } = useKompaniya();
  // Kompaniya konteksti majburiy: tanlanmagan bo'lsa — professional tanlash holati (KompaniyaKerak), xom matn emas.
  if (!joriy?.id) return <KompaniyaKerak nima="Hujjatlar" />;
  return (
    <div className="flex h-full min-h-[calc(100vh-80px)] flex-col bg-bg p-4 text-text">
      <FaylMenejer kompaniyaId={joriy.id} />
    </div>
  );
}
