-- TEZLIK 2 (egasi: sahifalar 10 s -> 2-3 s). t2_obyekt_jami view'i ko'p sahifada o'qiladi va HAR O'QISHDA 140k qator t2_qator ni qayta yig'adi
-- (pg_stat_statements: ~770 chaqiruv, jami ~2900 s, o'rtacha 3,7 s, max 29 s; tinch bazada ~0,3 s — ya'ni yuklanishda navbat).
-- Yechim: obyektning jamlanma raqamlari (view'dagi AYNAN shu agregatlar) t2_obyekt_jami_kesh jadvalida saqlanadi va
-- mavjud "tayyor hisoblar" mexanizmi (t2_obyekt_kesh_iflos + _t2_kesh_hisobla_v1) bilan yangilanadi.
-- Eskirmaslik: obyekt "iflos" (t2_qator o'zgargan, kesh hali qayta hisoblanmagan) yoki keshda yo'q bo'lsa — view O'SHA obyekt uchun
-- eski formulani jonli hisoblaydi. Demak natija har doim jonli view bilan bir xil. Yangi pul mantig'i YO'Q.
-- Imzo, ustunlar, tartib va grantlar o'zgarmaydi. Oldingi: view ta'rifi (obyekt_jami_asl), md5(prosrc _t2_kesh_hisobla_v1) rollback faylida.
begin;

create table if not exists public.t2_obyekt_jami_kesh (
  obyekt_id   bigint primary key references public.t2_obyekt(id) on delete cascade,
  qator_soni  bigint not null default 0,
  razdel      bigint not null default 0,
  ish         bigint not null default 0,
  resurs      bigint not null default 0,
  jami        numeric,
  narxsiz     bigint not null default 0,
  chel        numeric,
  mash        numeric,
  mat         numeric,
  ob          numeric,
  hisoblandi  timestamptz not null default now()
);
alter table public.t2_obyekt_jami_kesh enable row level security;
revoke all on public.t2_obyekt_jami_kesh from anon, authenticated;
grant all on public.t2_obyekt_jami_kesh to service_role;

-- Bitta obyekt uchun view agregatining AYNAN o'zi (matn o'zgarmagan) — keshni to'ldiradi.
create or replace function public._t2_obyekt_jami_kesh_hisobla_v1(p_obyekt_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id) then
    delete from public.t2_obyekt_jami_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  insert into public.t2_obyekt_jami_kesh as k (obyekt_id, qator_soni, razdel, ish, resurs, jami, narxsiz, chel, mash, mat, ob, hisoblandi)
  select p_obyekt_id,
         COALESCE(a.qator_soni, 0), COALESCE(a.razdel, 0), COALESCE(a.ish, 0), COALESCE(a.resurs, 0), a.barg_asl,
         COALESCE(a.narxsiz, 0), a.chel, a.mash, a.mat, a.ob, now()
    from (SELECT count(*) AS qator_soni,
            count(*) FILTER (WHERE q.tur = 'rz'::text) AS razdel,
            count(*) FILTER (WHERE q.tur = 'bl'::text) AS ish,
            count(*) FILTER (WHERE q.tur = 'rs'::text) AS resurs,
            sum(q.summa) FILTER (WHERE ch.ota_id IS NULL AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS barg_asl,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS ob
           FROM t2_qator q
             LEFT JOIN ( SELECT DISTINCT c.ota_id
                   FROM t2_qator c
                  WHERE c.obyekt_id = p_obyekt_id AND c.ota_id IS NOT NULL) ch ON ch.ota_id = q.id
          WHERE q.obyekt_id = p_obyekt_id AND q.versiya_holat = 'faol'::text) a
  on conflict (obyekt_id) do update
    set qator_soni = excluded.qator_soni, razdel = excluded.razdel, ish = excluded.ish, resurs = excluded.resurs,
        jami = excluded.jami, narxsiz = excluded.narxsiz, chel = excluded.chel, mash = excluded.mash, mat = excluded.mat,
        ob = excluded.ob, hisoblandi = excluded.hisoblandi;
end $function$;
revoke all on function public._t2_obyekt_jami_kesh_hisobla_v1(bigint) from public, anon, authenticated;

-- Mavjud kesh hisoblash funksiyasi: faqat jami-keshni ham yangilaydi (qolgan mantiq o'zgarmagan).
CREATE OR REPLACE FUNCTION public._t2_kesh_hisobla_v1(p_obyekt_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_t0 timestamptz := clock_timestamp(); v_oy jsonb := '{}'::jsonb; m date;
  v_bugun date := (now() at time zone 'Asia/Tashkent')::date;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    delete from public.t2_obyekt_kesh where obyekt_id = p_obyekt_id;
    delete from public.t2_obyekt_jami_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  foreach m in array array[date_trunc('month', v_bugun)::date, (date_trunc('month', v_bugun) - interval '1 month')::date] loop
    v_oy := v_oy || jsonb_build_object(to_char(m, 'YYYY-MM'), public._t2_kesh_oy_paket_v1(p_obyekt_id, m));
  end loop;
  insert into public.t2_obyekt_kesh as k (obyekt_id, kompaniya_id, smeta, smeta_joriy, fakt, f2, f2_qoralama, f2_oy, hisoblandi, hisob_ms)
  values (p_obyekt_id, v_komp,
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),
          public._t2_kesh_joriy_v1(p_obyekt_id),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'fakt') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2_qoralama') p),
          v_oy, now(), (extract(epoch from clock_timestamp() - v_t0) * 1000)::int)
  on conflict (obyekt_id) do update
    set kompaniya_id = excluded.kompaniya_id, smeta = excluded.smeta, smeta_joriy = excluded.smeta_joriy, fakt = excluded.fakt, f2 = excluded.f2,
        f2_qoralama = excluded.f2_qoralama, f2_oy = excluded.f2_oy, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
  perform public._t2_obyekt_jami_kesh_hisobla_v1(p_obyekt_id);
end $function$;

-- Hozirgi obyektlar uchun boshlang'ich to'ldirish (view eski formulasi bilan bir xil agregat).
do $backfill$
declare r record;
begin
  for r in select id from public.t2_obyekt order by id loop
    perform public._t2_obyekt_jami_kesh_hisobla_v1(r.id);
  end loop;
end
$backfill$;

-- View: ustunlar/tartib/turlar o'zgarmagan. Toza (iflos emas) kesh qatori bo'lsa — keshdan; aks holda eski jonli agregat.
CREATE OR REPLACE VIEW public.t2_obyekt_jami AS
 SELECT o.id,
    o.nom,
    o.tur,
    COALESCE(jk.qator_soni, a.qator_soni, 0::bigint) AS qator_soni,
    COALESCE(jk.razdel, a.razdel, 0::bigint) AS razdel,
    COALESCE(jk.ish, a.ish, 0::bigint) AS ish,
    COALESCE(jk.resurs, a.resurs, 0::bigint) AS resurs,
    COALESCE(jk.jami, a.barg_asl) AS jami,
    COALESCE(jk.narxsiz, a.narxsiz, 0::bigint) AS narxsiz,
    COALESCE(jk.chel, a.chel) AS chel,
    COALESCE(jk.mash, a.mash) AS mash,
    COALESCE(jk.mat, a.mat) AS mat,
    COALESCE(jk.ob, a.ob) AS ob,
    o.yangilandi,
    o.kompaniya_id,
    o.lat,
    o.lng,
    o.versiya,
    o.loyiha_id
   FROM t2_obyekt o
     LEFT JOIN ( SELECT k.*
           FROM t2_obyekt_jami_kesh k
          WHERE NOT EXISTS (SELECT 1 FROM t2_obyekt_kesh_iflos i WHERE i.obyekt_id = k.obyekt_id)) jk ON jk.obyekt_id = o.id
     LEFT JOIN LATERAL ( SELECT count(*) AS qator_soni,
            count(*) FILTER (WHERE q.tur = 'rz'::text) AS razdel,
            count(*) FILTER (WHERE q.tur = 'bl'::text) AS ish,
            count(*) FILTER (WHERE q.tur = 'rs'::text) AS resurs,
            sum(q.summa) FILTER (WHERE ch.ota_id IS NULL AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS barg_asl,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS ob
           FROM t2_qator q
             LEFT JOIN ( SELECT DISTINCT c.ota_id
                   FROM t2_qator c
                  WHERE c.obyekt_id = o.id AND c.ota_id IS NOT NULL AND jk.obyekt_id IS NULL) ch ON ch.ota_id = q.id
          WHERE q.obyekt_id = o.id AND q.versiya_holat = 'faol'::text AND jk.obyekt_id IS NULL) a ON true
  WHERE o.holat <> 'bekor'::text;

comment on table public.t2_obyekt_jami_kesh is 'versiya: texnik. t2_obyekt_jami view agregatlarining keshi; _t2_kesh_hisobla_v1 yangilaydi, iflos obyekt uchun view jonli hisoblaydi.';
comment on function public._t2_obyekt_jami_kesh_hisobla_v1(bigint) is 'versiya: texnik. Bitta obyektning t2_obyekt_jami agregatini keshga yozadi (view bilan bir xil formula).';

commit;
