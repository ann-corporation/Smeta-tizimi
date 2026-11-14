-- 20261221950000 - PUL BO'YICHA YOPILADIGAN ISH + SMETA JAMI JUFTLIGI (asl / joriy). v2: joriy prod ta'rifiga matn-yamoq.
-- (PR #429 ko'chirmasi; eski 20261219000000_t2_pul_bilan_yopiladi_v1 hech qachon qo'llanmagan va eskirgan ta'rifdan edi — chiqarib tashlangan.)
-- Egasi 2026-11-13:
--  (1) «Smeta jami» — asosiy raqam ASL smeta (qo'shimcha/zamena kirmaydi), joriy smeta (ular bilan) yonida kichik. Nakopitelniy javobiga
--      jami.smeta_asl / jami.smeta_joriy qo'shiladi — yagona summa dvigateli (_t2_summa_paket_kesh_v1 'smeta' / 'smeta_joriy'), yangi formula yo'q;
--      hisoblab bo'lmasa NULL (noma'lum, 0 emas).
--  (2) Pul bo'yicha yopiladigan qator: birlik «сум»/«сўм»/«so'm»/«sum»/«UZS» VA narx = 1 (hajm = pul summasi). Bunday qatorda hajm/narx farqi
--      hisoblanmaydi: row.narx_variance_summa / jami_baseline_summa / jami_actual_summa = NULL (qo'llanmaydi, 0 emas); jami.baseline_summa va
--      jami.narx_variance_summa ularni chiqarib tashlaydi; qator bajarilishi — yopilgan pul foizi. jami.pul_bilan_soni / pul_bilan_summa.
--      Tasdiqlangan aktlar va ma'lumot O'ZGARTIRILMAYDI. Predikat frontend bilan bir xil: lib/hisob-yadro/pul-bilan-yopiladi.ts.
-- t2_nakopitelniy_v2 tanasi prod ta'rifidan (pg_get_functiondef) olinadi; har yamoq aynan 1 marta topilishi shart, aks holda xato (drift himoyasi).
-- Imzo, SECURITY DEFINER, grant — o'zgarmaydi (create or replace). Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.
begin;

create or replace function public.t2_pul_bilan_yopiladi_v1(p_birlik text, p_narx numeric)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $f$
  select p_narx is not null and p_narx = 1
     and regexp_replace(lower(coalesce(p_birlik, '')), '[\s.''’ʻʼ‘`]', '', 'g') in ('сум', 'сўм', 'som', 'sum', 'uzs')
$f$;

revoke all on function public.t2_pul_bilan_yopiladi_v1(text, numeric) from public, anon, authenticated;
grant execute on function public.t2_pul_bilan_yopiladi_v1(text, numeric) to service_role;
comment on function public.t2_pul_bilan_yopiladi_v1(text, numeric) is 'versiya: texnik. Pul bo''yicha yopiladigan qator predikati (birlik so''m va narx = 1); frontend lib/hisob-yadro/pul-bilan-yopiladi.ts bilan bir xil.';

create or replace function pg_temp.rep(d text, a text, b text) returns text language plpgsql as $f$
declare n int;
begin
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  if n <> 1 then raise exception 'PUL_BILAN_YOPILADI: yamoq topilmadi yoki takror (% marta): %', n, left(a, 90); end if;
  return replace(d, a, b);
end $f$;

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  if position('t2_pul_bilan_yopiladi_v1' in d) > 0 then return; end if;  -- allaqachon qo'llangan

  -- E1) o'zgaruvchilar
  n := pg_temp.rep(d, $a$  v_nak jsonb := null;$a$, $b$  v_nak jsonb := null;
  v_asl jsonb := null; v_joriy jsonb := null;$b$);

  -- Q1) qator: pul belgisi + baseline/actual/farq pul qatorida NULL
  n := pg_temp.rep(n, $a$      'jami_baseline_summa', coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0),$a$,
    $b$      /* pul_bilan_yopiladi_v2 */ 'pul_bilan', public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx),
      'jami_baseline_summa', case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx) then null else coalesce(p.oldingi_baseline,0) + coalesce(p.joriy_baseline,0) end,$b$);
  n := pg_temp.rep(n, $a$      'jami_actual_summa',   p.jami_actual_summa,$a$,
    $b$      'jami_actual_summa',   case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx) then null else p.jami_actual_summa end,$b$);
  n := pg_temp.rep(n, $a$'narx_variance_summa', case when p.oldingi_baseline is null and p.joriy_baseline is null then null else$a$,
    $b$'narx_variance_summa', case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx) or (p.oldingi_baseline is null and p.joriy_baseline is null) then null else$b$);
  -- Q2) qator bajarilishi: pul qatorida — yopilgan pul / reja pul
  n := pg_temp.rep(n, $a$'bajarilish_foiz', case when coalesce(zr.v, q.hajm, 0) <> 0 then round($a$,
    $b$'bajarilish_foiz', case when public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)
        then case when coalesce(q.summa, 0) <> 0 then round((coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) / q.summa * 100, 1) end
        when coalesce(zr.v, q.hajm, 0) <> 0 then round($b$);

  -- J1) jami: baseline/variance pul qatorlarisiz; pul qatorlari soni va summasi
  n := pg_temp.rep(n, $a$coalesce(sum(x.oldingi_baseline),0) + coalesce(sum(x.joriy_baseline),0) as baseline_summa, coalesce(sum(x.oldingi_vr),0) + coalesce(sum(x.joriy_vr),0) as vr_summa$a$,
    $b$coalesce(sum(x.oldingi_baseline) filter (where not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)),0) + coalesce(sum(x.joriy_baseline) filter (where not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)),0) as baseline_summa,
        coalesce(sum(x.oldingi_vr) filter (where not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)),0) + coalesce(sum(x.joriy_vr) filter (where not public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)),0) as vr_summa,
        count(*) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol' and public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as pul_bilan_soni,
        sum(q.summa) filter (where q.tur in ('rs','mat','ob') and q.versiya_holat = 'faol' and public.t2_pul_bilan_yopiladi_v1(q.birlik, q.narx)) as pul_bilan_summa$b$);
  n := pg_temp.rep(n, $a$      'narx_variance_summa', vr_summa - baseline_summa,$a$,
    $b$      'narx_variance_summa', vr_summa - baseline_summa,
      'pul_bilan_soni', pul_bilan_soni,
      'pul_bilan_summa', pul_bilan_summa,$b$);

  -- J2) smeta jami juftligi: yagona summa dvigateli; xato/yo'q — NULL (noma'lum)
  n := pg_temp.rep(n, $a$    v_jami := v_jami || jsonb_build_object('smeta_nakrutka', v_nak);$a$,
    $b$    v_jami := v_jami || jsonb_build_object('smeta_nakrutka', v_nak);

    -- Smeta jami juftligi (egasi 2026-11-13): ASL (qo'shimcha/zamena kirmaydi) va JORIY (ular bilan); hisoblab bo'lmasa NULL (noma'lum).
    begin
      select p.paket into v_asl from public._t2_summa_paket_kesh_v1(array[p_obyekt_id], 'smeta') p limit 1;
      select p.paket into v_joriy from public._t2_summa_paket_kesh_v1(array[p_obyekt_id], 'smeta_joriy') p limit 1;
    exception when others then
      v_asl := null; v_joriy := null;
    end;
    v_jami := v_jami || jsonb_build_object('smeta_asl', v_asl, 'smeta_joriy', v_joriy);$b$);

  execute n;

  -- R) Rahbar paneli: obyekt va portfel qatoriga `smeta_joriy` (kesh paketi; allaqachon v_sj da bor, faqat javobga chiqmagan edi).
  --    Portfel joriysi — faqat HAMMA obyektda joriy bor bo'lsa (qisman yig'indi yolg'on bo'lardi) → aks holda NULL (noma'lum).
  d := pg_get_functiondef('public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)'::regprocedure);
  if position($a$'smeta_joriy', case when x.smx_joriy$a$ in d) = 0 then
    n := pg_temp.rep(d, $a$'smeta', x.sm, 'fakt', x.fk, 'f2', x.f2,$a$,
      $b$'smeta', x.sm, 'smeta_joriy', case when x.smx_joriy then x.smx end, 'fakt', x.fk, 'f2', x.f2,$b$);
    n := pg_temp.rep(n, $a$'shartnoma_soni', v_sh_soni, 'smeta', j_sm),$a$,
      $b$'shartnoma_soni', v_sh_soni, 'smeta', j_sm,
        'smeta_joriy', case when v_sj is not null and (select count(*) from jsonb_object_keys(v_sj)) = coalesce(array_length(v_ob, 1), 0)
                            then public._t2_summa_paket_jam_v1((select jsonb_agg(value) from jsonb_each(v_sj))) end),$b$);
    execute n;
  end if;
end $mig$;

commit;
