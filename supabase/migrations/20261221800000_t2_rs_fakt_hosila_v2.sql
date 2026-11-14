-- RS fakti hosila v2 (TEZ) — 20261219300000 ning qaytarilgan (20261221700000) qoidasi, set-based.
--
-- Sabab: v1 har RS qatoriga LATERAL _t2_rs_hosila_v1(q.id) (qatorma-qator funksiya chaqiruvi) qo'shgan edi; katta obyektda
-- holat sekinlashdi va qaytarildi. Qoida o'zgarmaydi (norma NULL RS yoki ota=rz RS: fakt = RS smeta hajmi x ota fakt ulushi;
-- frontend: lib/fakt-f2-tenglash.ts, samarali norma = rs smeta / ish smeta):
--  1) ota BL, norma NULL: hajm = RS hajmi x (BL fakt hajmi, f2_sertifikat nusxasisiz) / BL smeta hajmi.
--  2) ota rz (foizli transport): hajm = RS hajmi x (bo'lim MAT fakt summasi, f2_sertifikatsiz) / (bo'lim MAT smeta summasi).
--  3) Eskirgan nusxa (norma NULL RS ning hamma faol fakt qatori bekor F-2 dan ko'chirilgan): hosila ustun (0 ham).
-- Yangi: yordamchi funksiya EMAS, balki yagona view t2_rs_hosila_v1 (faqat nomzod RS qatorlari: ota BL/rz, norma NULL,
-- bir necha yuz qator; hech qachon har RS uchun chaqirilmaydi). Planner view ni oddiy join sifatida yoyadi (obyekt/qator
-- sharti ichkariga tushadi), t2_akt_qator ga indeks (qator_id) orqali kiradi. 3 o'lchov funksiyasi va t2_qator_holat unga LEFT JOIN.
-- Yamoq: mavjud ta'rif pg_get_functiondef/pg_get_viewdef dan olinib matn bo'yicha o'zgartiriladi (har almashtirish
-- tekshiriladi). Teskari: .rollback.sql.

create or replace view public.t2_rs_hosila_v1 as
select r.id as qator_id,
       r.obyekt_id,
       case when c.stale then x.h else nullif(x.h, 0::numeric) end as hajm,
       coalesce(c.stale and x.h is not null, false) as stale
  from public.t2_qator r
  join public.t2_qator p on p.id = r.ota_id and p.obyekt_id = r.obyekt_id
 cross join lateral (
   select case when p.tur = 'rz' then
            (select sum(m.summa) from public.t2_qator m
              where m.ota_id = p.id and m.tur = 'mat' and m.versiya_holat is distinct from 'almashtirilgan') end as den,
          case when p.tur = 'rz' then
            (select sum(paq.summa) filter (where paq.narx_manba is distinct from 'f2_sertifikat')
               from public.t2_qator m
               join public.t2_akt_qator paq on paq.qator_id = m.id
               join public.t2_akt pa on pa.id = paq.akt_id and pa.tur = 'fakt' and pa.holat <> 'bekor'
              where m.ota_id = p.id and m.tur = 'mat' and m.versiya_holat is distinct from 'almashtirilgan') end as num
   offset 0) z
 cross join lateral (
   select case
            when p.tur = 'bl' and r.norma is null then
              case when p.hajm is not null and p.hajm <> 0 then
                r.hajm * coalesce((select sum(paq.hajm) filter (where paq.narx_manba is distinct from 'f2_sertifikat')
                                     from public.t2_akt_qator paq
                                     join public.t2_akt pa on pa.id = paq.akt_id and pa.tur = 'fakt' and pa.holat <> 'bekor'
                                    where paq.qator_id = p.id), 0::numeric) / p.hajm
              end
            when p.tur = 'rz' then
              case when coalesce(z.den, 0::numeric) <> 0 then r.hajm * coalesce(z.num, 0::numeric) / z.den end
          end as h
   offset 0) x
 cross join lateral (
   select case when r.norma is null and x.h is not null then
            coalesce((select count(*) > 0 and count(*) filter (where not (aq.narx_manba = 'f2_sertifikat'
                                          and exists (select 1 from public.t2_akt sa where sa.id = aq.narx_manba_id and sa.tur = 'f2' and sa.holat = 'bekor'))) = 0
                        from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.tur = 'fakt' and a.holat <> 'bekor'
                       where aq.qator_id = r.id), false)
          else false end as stale
   offset 0) c
 where r.tur = 'rs' and r.hajm is not null and r.versiya_holat is distinct from 'almashtirilgan'
   and x.h is not null
   and (r.norma is null or p.tur = 'rz');

revoke all on public.t2_rs_hosila_v1 from public, anon, authenticated;
grant select on public.t2_rs_hosila_v1 to service_role;
comment on view public.t2_rs_hosila_v1 is 'RS fakt hosilasi (norma NULL RS / ota=rz): hajm = RS hajmi x ota fakt ulushi; t2_qator_holat va 3 o''lchov funksiyasi ishlatadi. versiya: tarix (almashtirilgan RS chiqariladi; fakt t2_akt_qator orqali)';
do $migr$
declare
  v_frag_fn constant text := ' LEFT JOIN (SELECT h0.qator_id, h0.hajm, h0.stale FROM public.t2_rs_hosila_v1 h0 WHERE h0.obyekt_id = ANY(p_obyekt_ids) OFFSET 0) hs ON hs.qator_id = q.id';
  v_frag_view constant text := ' LEFT JOIN LATERAL (SELECT h0.hajm, h0.stale FROM public.t2_rs_hosila_v1 h0 WHERE h0.qator_id = q.id AND q.tur = ''rs'' AND (q.norma IS NULL OR EXISTS (SELECT 1 FROM public.t2_qator p0 WHERE p0.id = q.ota_id AND p0.tur = ''rz'')) OFFSET 0) hs ON true';
  v_cond_new constant text := '((bl.bl_soni > 0) OR (hs.hajm IS NOT NULL)) AND ((d.direct_fakt_hajm = (0)::numeric) OR COALESCE(hs.stale, false))';
  v_norma_old constant text := '(bl.fakt_hajm - bl.f2s_hajm) * q.norma';
  v_norma_new constant text := 'COALESCE(hs.hajm, (bl.fakt_hajm - bl.f2s_hajm) * q.norma)';
  r record; v_def text; v_n int; v_cnt int;
begin
  -- 3 funksiya: ta'rif matni bo'yicha yamoq.
  for r in select unnest(array['_t2_fakt_olchov_v1','_t2_qator_holat_v2','_t2_ortiqcha_olchov_v1']) as fn loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = to_regprocedure('public.' || r.fn || '(bigint[])');
    if v_def is null then raise exception 'YAMOQ: % topilmadi', r.fn; end if;
    if position('_t2_rs_hosila_v1' in v_def) > 0 then continue; end if;
    -- shart: ((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))
    v_cnt := (length(v_def) - length(replace(v_def, '((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))', ''))) / length('((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))');
    if v_cnt < 1 then raise exception 'YAMOQ: % da shart topilmadi', r.fn; end if;
    v_def := replace(v_def, '((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))', '(' || v_cond_new || ')');
    v_cnt := (length(v_def) - length(replace(v_def, v_norma_old, ''))) / length(v_norma_old);
    if v_cnt < 1 then raise exception 'YAMOQ: % da norma ifodasi topilmadi', r.fn; end if;
    v_def := replace(v_def, v_norma_old, v_norma_new);
    select count(*) into v_n from regexp_matches(v_def, 'FROM public\.t2_qator q\s', 'g');
    if v_n <> 1 then raise exception 'YAMOQ: % da FROM t2_qator q % marta (kutilgan 1)', r.fn, v_n; end if;
    v_def := regexp_replace(v_def, '(FROM public\.t2_qator q)(\s)', '\1' || replace(v_frag_fn, '\', '\\') || '\2');
    execute v_def;
  end loop;

  -- view: pretty ko'rinish.
  v_def := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  if position('_t2_rs_hosila_v1' in v_def) = 0 then
    v_cnt := (length(v_def) - length(replace(v_def, 'bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric', ''))) / length('bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric');
    if v_cnt < 1 then raise exception 'YAMOQ: view da shart topilmadi'; end if;
    v_def := replace(v_def, 'bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric', v_cond_new);
    v_cnt := (length(v_def) - length(replace(v_def, v_norma_old, ''))) / length(v_norma_old);
    if v_cnt < 1 then raise exception 'YAMOQ: view da norma ifodasi topilmadi'; end if;
    v_def := replace(v_def, v_norma_old, v_norma_new);
    select count(*) into v_n from regexp_matches(v_def, 'FROM (public\.)?t2_qator q\s', 'g');
    if v_n <> 1 then raise exception 'YAMOQ: view da FROM t2_qator q % marta (kutilgan 1)', v_n; end if;
    v_def := regexp_replace(v_def, '(FROM (?:public\.)?t2_qator q)(\s)', '\1' || replace(v_frag_view, '\', '\\') || '\2');
    execute 'CREATE OR REPLACE VIEW public.t2_qator_holat AS ' || v_def;
  end if;
end
$migr$;
