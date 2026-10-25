import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sbIshTurlariOl, type T2IshTuri } from '../api/supabase';

export default function TestSpravochnik() {
  const [params] = useSearchParams();
  const aktKomp = Number(params.get('kompaniya') || '1');
  const [ishTurlari, setIshTurlari] = useState<T2IshTuri[]>([]);
  const [xato, setXato] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  useEffect(() => {
    setYuklanmoqda(true);
    sbIshTurlariOl(aktKomp).then(r => {
      setYuklanmoqda(false);
      if (r.ok && r.qatorlar) {
        setIshTurlari(r.qatorlar);
      } else {
        setXato(r.error || 'Xato');
      }
    });
  }, [aktKomp]);

  return (
    <div className="p-4 bg-[var(--surface)] text-[var(--text)] min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-[var(--info)]">Ish Turlari Ma'lumotnomasi (Spravochnik)</h1>
      {xato && <div className="text-[var(--danger)] mb-2">{xato}</div>}
      
      {yuklanmoqda ? <div>Yuklanmoqda...</div> : (
        <table className="w-full text-left border-collapse border border-[var(--border)] mt-4">
          <thead>
            <tr className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <th className="p-2">Kod</th>
              <th className="p-2">Nomi</th>
              <th className="p-2">Birligi</th>
              <th className="p-2">Kategoriya</th>
              <th className="p-2 text-right">Norma</th>
              <th className="p-2 text-right">Narx</th>
            </tr>
          </thead>
          <tbody>
            {ishTurlari.map((f, i) => (
              <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-3)] text-[13px]">
                <td className="p-2 text-[var(--text-dim)] font-mono">{f.kod}</td>
                <td className="p-2">{f.nomi}</td>
                <td className="p-2">{f.birligi}</td>
                <td className="p-2 text-[var(--text-dim)]">{f.kategoriya}</td>
                <td className="p-2 text-right">{f.norma}</td>
                <td className="p-2 text-right font-bold text-[var(--ok)]">{f.narx}</td>
              </tr>
            ))}
            {ishTurlari.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-[var(--text-mute)]">
                  Ish turlari topilmadi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
