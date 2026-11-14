-- Svod bo'limida FAKT F-2 bilan BIR XIL usulda hisoblanadi (egasi qoidasi: «F-2 bor qatorda fakt summasi F-2 narxida»; sinov-fakt 2026-11-14).
-- Avval: F-2 o'lchovlarida svod bo'limidagi pudratchi mehnati (ЧЕЛ/МАШ) oddiy kategoriya (ustama bilan), fakt esa yaxlit (ustamasiz) —
-- bir xil summali fakt va F-2 QQS bilan ~2,5% farq qilardi. Endi 'fakt' ham shu ro'yxatda. Faqat _t2_summa_agg_v1 ning ustama_bor sharti;
-- smeta/smeta_joriy/f2 o'zgarmaydi. Mijoz tomoni (SmetaAnatomiya fakt kartasi) shu qoida bilan mos (yig(..., masshtab=false, f2=true)).
-- ESLATMA: _t2_summa_paket_kesh_v1 keshi bo'lsa — fakt paketlari keshini yangilang (eski qiymat TTL gacha qolishi mumkin).
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure);
  n := replace(d, $a$p_olchov in ('f2', 'f2_qoralama', 'aktlar') and b.turi = 'svod'$a$, $b$p_olchov in ('f2', 'f2_qoralama', 'aktlar', 'fakt') and b.turi = 'svod'$b$);
  if n = d then raise exception 'FAKT_SVOD: ustama_bor sharti topilmadi'; end if;
  execute n;
end
$mig$;