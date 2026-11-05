-- 20261203000300 — t2_qator_ota_jami_rollup_v1: qo'shimcha/almashtirish ishlaridan keyin ota bl/rz summasi qayta yig'iladi.
--
-- Muammo (2026-11-05, read-only audit): t2_ish_abc_saqla_v1 (qo'shimcha ish / zamena, resurs narxi bilan) va
-- t2_ish_abc_ochir_ichki (qo'shilgan ishni o'chirish) yangi qator va ota bl summasini yozadi, lekin ota rz ni
-- qayta yig'maydi. t2_rollup chaqirilmaydi. rz.summa esa JORIY jami sifatida o'qiladi: t2_obyekt_jami.jami = Σ rz.summa,
-- daraxt bo'lim ustuni (sbT2TreeQur rzJami), SmetaAnatomiya KPI, F2 reestr, rahbar/boss paneli, AI konteksti.
--
-- Qoida (o'zgarmaydi, t2_rollup bilan bir xil):
--   bl.summa = Σ faol bolalar (rs, mat, ob); bolasi umuman yo'q bl — NULL;
--   rz.summa = Σ O'Z faol bolalari (bl, mat, ob, rs); ichki rz KIRMAYDI (obyekt jami = Σ barcha rz — double-count yo'q).
--   Bolasi yo'q rz tegilmaydi. NULL ≠ 0: hamma bola NULL bo'lsa — NULL.
-- Asl smeta CONST: asl qatorlar (hajm/narx/summa) o'zgarmaydi. Ota bl/rz summasi hosila jami (t2_qator_qosh / t2_qator_tahrir /
-- narxlash allaqachon t2_rollup orqali qo'shimchani rz ga qo'shadi). Asl summa = change_type IS NULL va qoshimcha=false bolalar yig'indisi.
--
-- Shu migratsiya:
--   1) public.t2_qator_ota_jami_yangila_v1(bigint[]) — berilgan qatorlar (o'zi bl/rz bo'lsa) va ularning barcha ota bl/rz
--      zanjirini ildizgacha qayta yig'adi. Faqat summasi haqiqatan o'zgarganini yangilaydi (versiya ortiqcha oshmasin).
--   2) t2_rollup: bl yig'indisiga rs bilan birga mat/ob bolalar ham kiradi (t2_ish_abc_saqla_v1 bl summasini shunday yozadi;
--      avval keyingi t2_rollup aralash (rs+mat) qo'shimcha ishning material summasini jimgina tashlab yuborardi).
--      Import qilingan smetada bl ostida mat/ob yo'q (2026-11-05: 0 ta) — asl smeta jamiga ta'siri yo'q.
--   3) t2_ish_abc_saqla_v1, t2_ish_abc_ochir_ichki, t2_fakt_smetadan_tashqari_v1 oxirida (1) chaqiriladi
--      (t2_resurs_ish_zamena_v1 va ochir_v1/v2 ular orqali qamraladi). Patch usuli 20261106840000 bilan bir xil:
--      joriy ta'rif o'qiladi, langar aynan bir marta topilmasa — to'xtaydi.
--   4) Bir martalik tuzatish: hozir eskirgan faol bl/rz qatorlari (2026-11-05: 9 ta rz, faqat qo'shimcha sabab)
--      qayta yig'iladi; eski qiymat public.t2_qator_ota_jami_tuzatish_v1 ga yoziladi (rollback tiklaydi).

begin;

create or replace function public.t2_qator_ota_jami_yangila_v1(p_qator_ids bigint[])
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_ids bigint[]; v_bl int := 0; v_rz int := 0;
begin
  if p_qator_ids is null or cardinality(p_qator_ids) = 0 then
    return jsonb_build_object('ok', true, 'bl', 0, 'rz', 0);
  end if;
  -- O'zi + ildizgacha otalar (UNION — sikl bo'lsa ham to'xtaydi).
  with recursive t(id, ota_id) as (
    select q.id, q.ota_id from public.t2_qator q where q.id = any(p_qator_ids)
    union
    select q.id, q.ota_id from public.t2_qator q join t on q.id = t.ota_id
  )
  select coalesce(array_agg(q.id), '{}') into v_ids
    from public.t2_qator q join t on t.id = q.id
   where q.tur in ('bl', 'rz') and q.versiya_holat = 'faol';
  if cardinality(v_ids) = 0 then return jsonb_build_object('ok', true, 'bl', 0, 'rz', 0); end if;

  -- 1) bl: Σ faol rs/mat/ob; bolasi umuman yo'q — NULL; faqat boshqa turdagi bolasi bor — tegilmaydi.
  update public.t2_qator b set summa = x.jami, yangilandi = now()
    from (select b2.id,
                 (select sum(c.summa) from public.t2_qator c
                   where c.ota_id = b2.id and c.versiya_holat = 'faol' and c.tur in ('rs', 'mat', 'ob')) jami,
                 exists (select 1 from public.t2_qator c
                   where c.ota_id = b2.id and c.versiya_holat = 'faol' and c.tur in ('rs', 'mat', 'ob')) barg_bor,
                 exists (select 1 from public.t2_qator c where c.ota_id = b2.id) bola_bor
            from public.t2_qator b2 where b2.id = any(v_ids) and b2.tur = 'bl') x
   where b.id = x.id and (x.barg_bor or not x.bola_bor) and b.summa is distinct from x.jami;
  get diagnostics v_bl = row_count;

  -- 2) rz: Σ O'Z faol bolalari (bl/mat/ob/rs), ichki rz kirmaydi; o'z bolasi yo'q rz — tegilmaydi.
  update public.t2_qator r set summa = x.jami, yangilandi = now()
    from (select c.ota_id id, sum(c.summa) jami from public.t2_qator c
           where c.ota_id = any(v_ids) and c.versiya_holat = 'faol' and c.tur in ('bl', 'mat', 'ob', 'rs')
           group by c.ota_id) x
   where r.id = x.id and r.tur = 'rz' and r.summa is distinct from x.jami;
  get diagnostics v_rz = row_count;

  return jsonb_build_object('ok', true, 'bl', v_bl, 'rz', v_rz);
end $function$;

comment on function public.t2_qator_ota_jami_yangila_v1(bigint[]) is
  'Berilgan qatorlar va ularning ota bl/rz zanjirini qayta yig''adi (t2_rollup qoidasi, faqat faol bolalar). Ichki: faqat SECURITY DEFINER RPC lar chaqiradi.';
revoke all on function public.t2_qator_ota_jami_yangila_v1(bigint[]) from public, anon, authenticated;
grant execute on function public.t2_qator_ota_jami_yangila_v1(bigint[]) to service_role;

-- 2) t2_rollup: bl yig'indisi rs + mat + ob (qolgani 20261115100000 bilan aynan bir xil).
CREATE OR REPLACE FUNCTION public.t2_rollup(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_jami numeric; v_toliq boolean; v_miss int; v_yetim int;
begin
  perform t2_manba_belgila('rollup');

  /* ota_jami_rollup_v1: bl = Σ rs + mat + ob (t2_ish_abc_saqla_v1 bilan bir xil). Avval faqat rs — aralash
     qo'shimcha ishning material summasi keyingi rollupda jimgina yo'qolardi. */
  update t2_qator b set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and ota_id is not null
        group by ota_id) c
  where b.id = c.ota_id and b.tur = 'bl'
    and b.summa is distinct from c.jami;

  update t2_qator b set summa = null
  where b.obyekt_id = p_obyekt_id and b.tur='bl'
    and b.summa is not null
    and not exists (select 1 from t2_qator c where c.ota_id = b.id);

  /* ⚠️ 'rs' SHU YERDA QO'SHILDI — busiz rz ostidagi yakka resurs
     jimgina yo'qolardi. */
  update t2_qator r set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur in ('bl','mat','ob','rs')
          and ota_id is not null
        group by ota_id) c
  where r.id = c.ota_id and r.tur = 'rz'
    and r.summa is distinct from c.jami;

  select sum(summa) into v_jami
  from t2_qator where obyekt_id = p_obyekt_id and tur = 'rz' and versiya_holat = 'faol';

  select count(*) into v_miss
  from t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and narx is null and versiya_holat = 'faol';

  /* ⚠️ YETIM QATOR NAZORATI: otasi yo'q (rz emas) qator jamiga
     KIRMAYDI. Soni javobda qaytadi — jim qolmasin. */
  select count(*) into v_yetim
  from t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur <> 'rz' and q.ota_id is null;

  v_toliq := (v_miss = 0);

  return jsonb_build_object('ok', true, 'jami', v_jami, 'toliq', v_toliq,
    'narxsiz_qator', v_miss, 'yetim_qator', v_yetim,
    'izoh', case when v_toliq then 'Barcha qator narxlangan — jami ishonchli.'
                 else v_miss || ' qatorda narx topilmadi. JAMI TO''LIQ EMAS — ' ||
                      'bu raqam ustida moliyaviy qaror qabul qilmang.' end ||
           case when v_yetim > 0 then ' ⚠️ ' || v_yetim ||
                     ' ta otasiz qator jamiga KIRMADI.' else '' end);
end $function$;

-- 3) Qo'shish / almashtirish / o'chirish RPC lari oxirida ota jami.
do $migration$
declare spec record; original text; patched text;
begin
  for spec in select * from (values
    ('t2_ish_abc_saqla_v1',
     '    perform public.t2_audit_yoz(p_kompaniya_id, ''resurs_zamena'', ''smeta''',
     '    perform public.t2_qator_ota_jami_yangila_v1(array[v_id]); -- ota_jami_rollup_v1' || chr(10)),
    ('t2_ish_abc_saqla_v1',
     '  perform public.t2_audit_yoz(p_kompaniya_id, ''ish_abc_'' || p_command',
     '  perform public.t2_qator_ota_jami_yangila_v1(array[v_id] || v_ids); -- ota_jami_rollup_v1' || chr(10)),
    ('t2_ish_abc_ochir_ichki',
     '  perform public.t2_audit_yoz(p_kompaniya_id, ''ish_abc_ochir''',
     '  if v_ota is not null then perform public.t2_qator_ota_jami_yangila_v1(array[v_ota]); end if; -- ota_jami_rollup_v1' || chr(10)),
    ('t2_fakt_smetadan_tashqari_v1',
     '  if not v_takror then',
     '  perform public.t2_qator_ota_jami_yangila_v1(array[v_qator_id] || v_res_ids); -- ota_jami_rollup_v1' || chr(10))
  ) as x(fn, langar, qator) loop
    select pg_get_functiondef(p.oid) into strict original from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = spec.fn;
    if position(spec.qator in original) > 0 then continue; end if;   -- idempotent
    if (length(original) - length(replace(original, spec.langar, ''))) / length(spec.langar) <> 1 then
      raise exception 'OTA_JAMI_LANGAR_TOPILMADI: % — %', spec.fn, spec.langar;
    end if;
    patched := replace(original, spec.langar, spec.qator || spec.langar);
    execute patched;
  end loop;
end $migration$;

-- 4) Bir martalik tuzatish: hozir eskirgan faol bl/rz (shu migratsiya qoidasi bo'yicha). Eski qiymat saqlanadi.
create table if not exists public.t2_qator_ota_jami_tuzatish_v1 (
  qator_id bigint primary key,
  obyekt_id bigint not null,
  kompaniya_id bigint,
  tur text not null,
  eski_summa numeric,
  yangi_summa numeric,
  sabab text not null,
  yaratildi timestamptz not null default now()
);
alter table public.t2_qator_ota_jami_tuzatish_v1 enable row level security;
revoke all on public.t2_qator_ota_jami_tuzatish_v1 from public, anon, authenticated;

with bola as (
  select p.id, p.obyekt_id, p.kompaniya_id, p.tur, p.summa,
         sum(c.summa) filter (where c.versiya_holat = 'faol' and (p.tur = 'rz' and c.tur in ('bl','mat','ob','rs') or p.tur = 'bl' and c.tur in ('rs','mat','ob'))) jami,
         count(c.id) filter (where c.versiya_holat = 'faol' and (p.tur = 'rz' and c.tur in ('bl','mat','ob','rs') or p.tur = 'bl' and c.tur in ('rs','mat','ob'))) n_bola,
         count(c.id) n_hamma,
         bool_or(c.versiya_holat = 'faol' and (coalesce(c.qoshimcha, false) or c.change_type is not null)) qoshimcha_bor
    from public.t2_qator p left join public.t2_qator c on c.ota_id = p.id
   where p.tur in ('bl', 'rz') and p.versiya_holat = 'faol'
   group by p.id, p.obyekt_id, p.kompaniya_id, p.tur, p.summa
)
insert into public.t2_qator_ota_jami_tuzatish_v1(qator_id, obyekt_id, kompaniya_id, tur, eski_summa, yangi_summa, sabab)
select id, obyekt_id, kompaniya_id, tur, summa, jami,
       case when coalesce(qoshimcha_bor, false) then 'qoshimcha_rollupsiz' else 'boshqa' end
  from bola
 where (n_bola > 0 or (tur = 'bl' and n_hamma = 0)) and summa is distinct from jami
on conflict (qator_id) do nothing;

select public.t2_qator_ota_jami_yangila_v1(array_agg(qator_id)) from public.t2_qator_ota_jami_tuzatish_v1;

commit;
