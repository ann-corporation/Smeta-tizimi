-- t2_direktor_pult_v1 (2026-11-11): DIREKTOR PULTI + «TAYYOR HISOBLAR» (t2_obyekt_kesh) — rahbar paneli tezligi.
--
-- MUAMMO: t2_rahbar_panel_v1 butun kompaniya (38 obyekt, ~140k qator) uchun smeta/fakt/F2/F2-qoralama paketlarini har so'rovda
--   qayta hisoblaydi (o'lchov, read-only EXPLAIN ANALYZE: smeta 7,6 s + fakt 16,1 s + F2 11,2 s = ~35 s bazada).
-- YECHIM (hisob YADROSI O'ZGARMAYDI): har obyekt uchun tayyor paket jadvali t2_obyekt_kesh. Paketni HISOBLAGAN funksiya shu
--   _t2_summa_paket_v1 — ya'ni formula ikkinchi marta yozilmagan; kesh faqat uning natijasini saqlaydi.
-- TOZALIK (kesh hech qachon eskirgan raqam ko'rsatmaydi):
--   1) Manba jadvallarga (t2_qator, t2_akt, t2_akt_qator, t2_svod_yaxlit, t2_nakrutka_koef, t2_nakrutka_podval, t2_shartnoma_bog,
--      t2_shartnoma) STATEMENT-darajali AFTER trigger: o'zgargan obyektlarni t2_obyekt_kesh_iflos («iflos» belgisi, versiya hisoblagich)
--      ga yozadi. Trigger qator emas, so'rov bo'yicha BIR marta ishlaydi (import 100k qator = bitta upsert).
--   2) O'qish funksiyasi (_t2_summa_paket_kesh_v1) iflos belgisi bor yoki keshi yo'q obyektni KESHDAN O'QIMAYDI — shu obyekt uchun
--      jonli hisob (eski yo'l) ishlaydi. Ya'ni iflos obyekt sekinroq, lekin HAR DOIM to'g'ri.
--   3) Keshni t2_obyekt_kesh_yangila_v1 yangilaydi: pg_cron har daqiqa (iflos obyektlar) + har tun to'liq qayta hisob (o'z-o'zini
--      tuzatish). Hisoblash paytida yozuv bo'lsa — iflos versiyasi o'zgaradi, belgi O'CHMAYDI (poyga himoyasi).
-- FAQAT SHU HOLATLAR KESHDAN: smeta / fakt / f2 / f2_qoralama (davrsiz) va f2 BIR kalendar oy uchun (oy boshi..oy oxiri; joriy va
--   oldingi oy). Boshqa davr / akt-filtri — avvalgidek jonli.
-- Panel matni (pg_get_functiondef + anchor, drift himoyasi) _t2_summa_paket_v1 -> _t2_summa_paket_kesh_v1 almashtiriladi; anchor topilmasa — xato.
-- Yangi RPC: t2_rahbar_pult_v1 — direktor bosh ekrani (6 plitka), panelning keshdan ishlaydigan natijasidan yig'iladi.
-- DB hajmi: 38 obyekt x ~5 paket x ~3 KB = ~0,6 MB (+ iflos jadval ~ 0). Oyiga o'sish ~0 (obyekt soniga mutanosib, qator soniga emas).
-- Birinchi to'ldirish: migratsiya oxirida hamma obyekt «iflos» qilinadi, cron ~10 daqiqada to'ldiradi (shu paytgacha jonli hisob).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Jadvallar
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.t2_obyekt_kesh (
  obyekt_id    bigint primary key references public.t2_obyekt(id) on delete cascade,
  kompaniya_id bigint not null,
  smeta        jsonb,
  fakt         jsonb,
  f2           jsonb,
  f2_qoralama  jsonb,
  f2_oy        jsonb not null default '{}'::jsonb,   -- 'YYYY-MM' -> F2 paketi (shu oy, tasdiqlangan)
  hisoblandi   timestamptz not null default now(),
  hisob_ms     integer
);
create index if not exists t2_obyekt_kesh_komp_idx on public.t2_obyekt_kesh (kompaniya_id);

create table if not exists public.t2_obyekt_kesh_iflos (
  obyekt_id    bigint primary key,
  kompaniya_id bigint not null,
  versiya      bigint not null default 1,
  sabab        text,
  vaqt         timestamptz not null default clock_timestamp()
);

alter table public.t2_obyekt_kesh enable row level security;
alter table public.t2_obyekt_kesh_iflos enable row level security;
revoke all on public.t2_obyekt_kesh from public, anon, authenticated;
revoke all on public.t2_obyekt_kesh_iflos from public, anon, authenticated;
grant all on public.t2_obyekt_kesh to service_role;
grant all on public.t2_obyekt_kesh_iflos to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Iflos belgilash (tartiblangan upsert — o'zaro deadlock yo'q)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_kesh_belgila_v1(p_ids bigint[], p_sabab text)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  insert into public.t2_obyekt_kesh_iflos (obyekt_id, kompaniya_id, sabab)
  select o.id, o.kompaniya_id, p_sabab
    from public.t2_obyekt o
   where o.id = any(coalesce(p_ids, '{}'::bigint[]))
   order by o.id
  on conflict (obyekt_id) do update
    set versiya = public.t2_obyekt_kesh_iflos.versiya + 1, vaqt = clock_timestamp(), sabab = excluded.sabab;
$$;
revoke all on function public._t2_kesh_belgila_v1(bigint[], text) from public, anon, authenticated;
grant execute on function public._t2_kesh_belgila_v1(bigint[], text) to service_role;

-- Statement-darajali triggerlar (har jadval uchun insert/update/delete). Funksiyalar shu blokda generatsiya qilinadi:
-- {T} — o'tish jadvali nomi (yangi / eski). ikkala=true — UPDATE da eski qiymatlar ham (kichik jadvallar).
do $gen$
declare
  j record; op text; v_nom text; v_ifoda text; v_ref text;
begin
  for j in
    select * from (values
      ('t2_qator',            'select t.obyekt_id from {T} t', false),
      ('t2_akt',              'select t.obyekt_id from {T} t', false),
      ('t2_akt_qator',        'select coalesce(t.obyekt_id, a.obyekt_id) from {T} t left join public.t2_akt a on a.id = t.akt_id', false),
      ('t2_svod_yaxlit',      'select t.obyekt_id from {T} t', true),
      ('t2_nakrutka_podval',  'select t.obyekt_id from {T} t where t.obyekt_id is not null union select o.id from {T} t join public.t2_obyekt o on o.kompaniya_id = t.kompaniya_id where t.obyekt_id is null', true),
      ('t2_nakrutka_koef',    'select o.id from {T} t join public.t2_obyekt o on o.kompaniya_id = t.kompaniya_id where t.shartnoma_id is null union select b.obyekt_id from {T} t join public.t2_shartnoma_bog b on b.shartnoma_id = t.shartnoma_id', true),
      ('t2_shartnoma_bog',    'select t.obyekt_id from {T} t', true),
      ('t2_shartnoma',        'select b.obyekt_id from {T} t join public.t2_shartnoma_bog b on b.shartnoma_id = t.id', true)
    ) as x(tbl, ifoda, ikkala)
  loop
    foreach op in array array['ins', 'upd', 'del'] loop
      v_nom := 't2_kesh_' || j.tbl || '_' || op;
      if op = 'ins' then
        v_ifoda := replace(j.ifoda, '{T}', 'yangi');
        v_ref := 'referencing new table as yangi';
      elsif op = 'del' then
        v_ifoda := replace(j.ifoda, '{T}', 'eski');
        v_ref := 'referencing old table as eski';
      elsif j.ikkala then
        v_ifoda := replace(j.ifoda, '{T}', 'yangi') || ' union ' || replace(j.ifoda, '{T}', 'eski');
        v_ref := 'referencing new table as yangi old table as eski';
      else
        v_ifoda := replace(j.ifoda, '{T}', 'yangi');
        v_ref := 'referencing new table as yangi';
      end if;
      execute format($f$
        create or replace function public._%1$s() returns trigger language plpgsql security definer
        set search_path = public, pg_temp as $b$
        begin
          perform public._t2_kesh_belgila_v1(array(select s.x from (%2$s) s(x) where s.x is not null), %3$L);
          return null;
        end $b$;$f$, v_nom, v_ifoda, j.tbl);
      execute format('revoke all on function public._%1$s() from public, anon, authenticated', v_nom);
      execute format('drop trigger if exists %1$s on public.%2$I', v_nom, j.tbl);
      execute format('create trigger %1$s after %2$s on public.%3$I %4$s for each statement execute function public._%1$s()',
        v_nom, case op when 'ins' then 'insert' when 'upd' then 'update' else 'delete' end, j.tbl, v_ref);
    end loop;
  end loop;
end $gen$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Hisoblash (kesh to'ldirish). Paketni FAQAT mavjud _t2_summa_paket_v1 beradi.
-- ─────────────────────────────────────────────────────────────────────────────
-- Bitta kalendar oy uchun F2 paketi. Oyda tasdiqlangan akt bo'lmasa — bo'sh agregatdan paket (jonli hisob bilan AYNAN bir xil:
-- agregat 0 lar beradi; acceptance buni solishtiradi). Oy boshi..oy oxiri oralig'i.
create or replace function public._t2_kesh_oy_paket_v1(p_obyekt_id bigint, p_oy date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_dan date := date_trunc('month', p_oy)::date;
  v_gacha date := (date_trunc('month', p_oy) + interval '1 month')::date - 1;
  v_nk jsonb; v_p jsonb;
begin
  if exists (select 1 from public.t2_akt a
              where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan' and a.oy >= v_dan and a.oy <= v_gacha) then
    select p.paket into v_p from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2', null, v_dan, v_gacha) p;
    return v_p;
  end if;
  v_nk := public._t2_obyekt_nk_v1(p_obyekt_id);
  if v_nk is null then return null; end if;
  return public._t2_summa_paket_hisob_v1('{}'::jsonb, v_nk->'nk')
         || jsonb_build_object('nk_manba', v_nk->>'nk_manba', 'podval_id', v_nk->'podval_id', 'olchov', 'f2');
end $$;
revoke all on function public._t2_kesh_oy_paket_v1(bigint, date) from public, anon, authenticated;
grant execute on function public._t2_kesh_oy_paket_v1(bigint, date) to service_role;

create or replace function public._t2_kesh_hisobla_v1(p_obyekt_id bigint)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_komp bigint; v_t0 timestamptz := clock_timestamp(); v_oy jsonb := '{}'::jsonb; m date;
  v_bugun date := (now() at time zone 'Asia/Tashkent')::date;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    delete from public.t2_obyekt_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  foreach m in array array[date_trunc('month', v_bugun)::date, (date_trunc('month', v_bugun) - interval '1 month')::date] loop
    v_oy := v_oy || jsonb_build_object(to_char(m, 'YYYY-MM'), public._t2_kesh_oy_paket_v1(p_obyekt_id, m));
  end loop;
  insert into public.t2_obyekt_kesh as k (obyekt_id, kompaniya_id, smeta, fakt, f2, f2_qoralama, f2_oy, hisoblandi, hisob_ms)
  values (p_obyekt_id, v_komp,
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'fakt') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2_qoralama') p),
          v_oy, now(), (extract(epoch from clock_timestamp() - v_t0) * 1000)::int)
  on conflict (obyekt_id) do update
    set kompaniya_id = excluded.kompaniya_id, smeta = excluded.smeta, fakt = excluded.fakt, f2 = excluded.f2,
        f2_qoralama = excluded.f2_qoralama, f2_oy = excluded.f2_oy, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
end $$;
revoke all on function public._t2_kesh_hisobla_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_kesh_hisobla_v1(bigint) to service_role;

-- Yangilovchi. p_byudjet_s — yangi obyektni boshlamaslik chegarasi (sekund). rejim: 'iflos' (iflos + joriy oy kaliti yo'q obyektlar)
-- yoki 'hammasi' (tungi o'z-o'zini tuzatish). Poyga himoyasi: belgi faqat o'qilgan versiya bo'yicha o'chadi.
create or replace function public.t2_obyekt_kesh_yangila_v1(p_byudjet_s integer default 40, p_rejim text default 'iflos')
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_qoldi int := 0;
  v_kalit text := to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM');
begin
  if not pg_try_advisory_xact_lock(hashtext('t2_obyekt_kesh_yangila_v1')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id, i.versiya
      from public.t2_obyekt o
      left join public.t2_obyekt_kesh_iflos i on i.obyekt_id = o.id
      left join public.t2_obyekt_kesh k on k.obyekt_id = o.id
     where p_rejim = 'hammasi' or i.obyekt_id is not null or k.obyekt_id is null or jsonb_typeof(k.f2_oy->v_kalit) is distinct from 'object'
     order by i.vaqt nulls last, o.id
  loop
    if extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s then v_qoldi := v_qoldi + 1; continue; end if;
    perform public._t2_kesh_hisobla_v1(r.obyekt_id);
    if r.versiya is not null then
      delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id and versiya = r.versiya;
    end if;
    v_soni := v_soni + 1;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'qoldi', v_qoldi);
end $$;
revoke all on function public.t2_obyekt_kesh_yangila_v1(integer, text) from public, anon, authenticated;
grant execute on function public.t2_obyekt_kesh_yangila_v1(integer, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O'qish: keshdan (toza obyektlar) + jonli (iflos / keshsiz / boshqa davr). Natija _t2_summa_paket_v1 bilan bir xil shakl.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_summa_paket_kesh_v1(
  p_obyekt_ids bigint[], p_olchov text, p_dan date default null, p_gacha date default null)
returns table(obyekt_id bigint, paket jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_rejim text; v_kalit text; r record; v_toza bigint[] := '{}'; v_qolgan bigint[];
begin
  if p_olchov in ('smeta', 'fakt', 'f2', 'f2_qoralama') and p_dan is null and p_gacha is null then
    v_rejim := 'jami';
  elsif p_olchov = 'f2' and p_dan is not null and p_gacha is not null
        and p_dan = date_trunc('month', p_dan)::date
        and p_gacha >= p_dan and p_gacha <= (date_trunc('month', p_dan) + interval '1 month')::date - 1
        and not exists (   -- oy ichida p_gacha dan keyingi sanali tasdiqlangan akt bo'lsa, oy-kaliti jonli natijadan farq qiladi
              select 1 from public.t2_akt a
               where a.obyekt_id = any(p_obyekt_ids) and a.tur = 'f2' and a.holat = 'tasdiqlangan'
                 and a.oy > p_gacha and a.oy <= (date_trunc('month', p_dan) + interval '1 month')::date - 1) then
    v_rejim := 'oy';
    v_kalit := to_char(p_dan, 'YYYY-MM');
  else
    return query select * from public._t2_summa_paket_v1(p_obyekt_ids, p_olchov, null, p_dan, p_gacha);
    return;
  end if;

  for r in
    select k.obyekt_id as oid,
           case when v_rejim = 'oy' then k.f2_oy->v_kalit
                else case p_olchov when 'smeta' then k.smeta when 'fakt' then k.fakt when 'f2' then k.f2 else k.f2_qoralama end
           end as p
      from public.t2_obyekt_kesh k
     where k.obyekt_id = any(p_obyekt_ids)
       and k.hisoblandi > now() - interval '3 days'
       and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id)
  loop
    if r.p is not null and jsonb_typeof(r.p) = 'object' then
      obyekt_id := r.oid; paket := r.p; return next;
      v_toza := v_toza || r.oid;
    end if;
  end loop;

  v_qolgan := array(select x from unnest(p_obyekt_ids) x where x <> all (v_toza));
  if cardinality(v_qolgan) > 0 then
    return query select * from public._t2_summa_paket_v1(v_qolgan, p_olchov, null, p_dan, p_gacha);
  end if;
end $$;
revoke all on function public._t2_summa_paket_kesh_v1(bigint[], text, date, date) from public, anon, authenticated;
grant execute on function public._t2_summa_paket_kesh_v1(bigint[], text, date, date) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Rahbar paneli: 5 ta chaqiruv keshga (matn almashtirish, drift himoyasi).
-- ─────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_eski text; v_yangi text; v_juft text[]; i int;
begin
  select pg_get_functiondef('public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)'::regprocedure) into v_eski;
  if v_eski is null then raise exception 'KESH_PATCH: t2_rahbar_panel_v1 topilmadi'; end if;
  if position('_t2_summa_paket_kesh_v1' in v_eski) > 0 then return; end if;   -- allaqachon almashtirilgan
  v_yangi := v_eski;
  v_juft := array[
    '_t2_summa_paket_v1(v_ob, ''smeta'') p',                           '_t2_summa_paket_kesh_v1(v_ob, ''smeta'') p',
    '_t2_summa_paket_v1(v_ob, ''fakt'') p',                            '_t2_summa_paket_kesh_v1(v_ob, ''fakt'') p',
    '_t2_summa_paket_v1(v_ob, ''f2'') p',                              '_t2_summa_paket_kesh_v1(v_ob, ''f2'') p',
    '_t2_summa_paket_v1(v_ob, ''f2_qoralama'') p',                     '_t2_summa_paket_kesh_v1(v_ob, ''f2_qoralama'') p',
    '_t2_summa_paket_v1(v_ob, ''f2'', null, v_dan, v_gacha) p',        '_t2_summa_paket_kesh_v1(v_ob, ''f2'', v_dan, v_gacha) p'];
  i := 1;
  while i < array_length(v_juft, 1) loop
    if position(v_juft[i] in v_yangi) = 0 then raise exception 'KESH_PATCH: anchor topilmadi: %', v_juft[i]; end if;
    v_yangi := replace(v_yangi, v_juft[i], v_juft[i + 1]);
    i := i + 2;
  end loop;
  execute v_yangi;
end $patch$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DIREKTOR PULTI — 6 plitka. Hisob YO'Q: panel (kesh orqali) + yengil sanoqlar.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.t2_rahbar_pult_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_bugun date := (now() at time zone 'Asia/Tashkent')::date;
  v_dan date; v_gacha date; v_p jsonb; v_hujjat jsonb; v_kech jsonb; v_xavfli jsonb; v_kesh jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  v_dan := date_trunc('month', v_bugun)::date;
  v_gacha := (v_dan + interval '1 month')::date - 1;

  v_p := public.t2_rahbar_panel_v1(p_kompaniya_id, p_actor_id, v_dan, v_gacha, null);
  if coalesce((v_p->>'ok')::boolean, false) is not true then return v_p; end if;

  -- F2 / F3 holati: hujjat sanoqlari (yengil).
  select jsonb_build_object(
           'f2_tasdiqlangan', count(*) filter (where a.holat = 'tasdiqlangan'),
           'f2_qoralama', count(*) filter (where a.holat = 'qoralama'),
           'f2_tekshiruvda', count(*) filter (where a.holat = 'qoralama' and a.lifecycle_status in ('submitted', 'checked')),
           'f3_chiqarilmagan', count(*) filter (where a.holat = 'tasdiqlangan' and a.forma3_id is null))
    into v_hujjat
    from public.t2_akt a where a.kompaniya_id = p_kompaniya_id and a.tur = 'f2';
  v_hujjat := v_hujjat || jsonb_build_object(
    'f3_soni', (select count(*) from public.t2_forma3 f where f.kompaniya_id = p_kompaniya_id and f.holat <> 'bekor'),
    'f3_chiqarilmagan_summa', (select (d->>'summa_tasir')::numeric from jsonb_array_elements(v_p->'diqqat') d where d->>'kod' = 'f3_chiqarilmagan' and d->>'obyekt_id' is null limit 1));

  -- Kechikkan predpisaniya (bizga yo'llangan, ochiq, muddati o'tgan) va topshiriqlar.
  v_kech := jsonb_build_object(
    'predpisaniya', jsonb_build_object(
      'ochiq', (select count(*) from public.t2_tomon_murojaat m where m.ijrochi_kompaniya_id = p_kompaniya_id and m.turi = 'predpisaniya' and m.holat = 'ochiq'),
      'kechikkan', (select count(*) from public.t2_tomon_murojaat m where m.ijrochi_kompaniya_id = p_kompaniya_id and m.turi = 'predpisaniya' and m.holat = 'ochiq' and m.muddat < v_bugun)),
    'topshiriq', jsonb_build_object(
      'ochiq', (select count(*) from public.t2_topshiriq t where t.kompaniya_id = p_kompaniya_id and t.holat in ('berildi', 'qabul_qilindi', 'bajarilmoqda', 'qaytarildi')),
      'kechikkan', (select count(*) from public.t2_topshiriq t where t.kompaniya_id = p_kompaniya_id and t.holat in ('berildi', 'qabul_qilindi', 'bajarilmoqda', 'qaytarildi') and t.muddat < v_bugun)));

  -- Xavfli obyektlar: kritik signal va diqqat sabablari bo'yicha top-5.
  select coalesce(jsonb_agg(z.j order by z.ball desc, z.nom), '[]'::jsonb) into v_xavfli
    from (
      select o->>'nom' as nom, (coalesce((o->'signal'->>'kritik')::int, 0) * 100 + coalesce(dq.n, 0) * 10 + least(coalesce((o->'signal'->>'soni')::int, 0), 9)) as ball,
             jsonb_build_object('obyekt_id', (o->>'obyekt_id')::bigint, 'nom', o->>'nom', 'kritik', coalesce((o->'signal'->>'kritik')::int, 0),
               'signal_soni', coalesce((o->'signal'->>'soni')::int, 0), 'sabablar', coalesce(dq.kodlar, '[]'::jsonb),
               'qarz', o->'qarz', 'f2_qqs_bilan', o->'f2'->'qqs_bilan') as j
        from jsonb_array_elements(v_p->'obyektlar') o
        left join lateral (select jsonb_agg(d->>'kod') as kodlar, count(*) as n
                             from jsonb_array_elements(v_p->'diqqat') d where d->>'obyekt_id' = o->>'obyekt_id') dq on true
       where coalesce((o->'signal'->>'kritik')::int, 0) > 0 or coalesce(dq.n, 0) > 0
       order by 2 desc, 1 limit 5) z;

  -- Kesh holati (shaffoflik): nechta obyekt tayyor hisobdan o'qildi.
  select jsonb_build_object('obyekt_soni', count(*),
           'toza_soni', count(*) filter (where k.obyekt_id is not null and i.obyekt_id is null),
           'eng_eski', min(k.hisoblandi))
    into v_kesh
    from public.t2_obyekt o
    left join public.t2_obyekt_kesh k on k.obyekt_id = o.id
    left join public.t2_obyekt_kesh_iflos i on i.obyekt_id = o.id
   where o.kompaniya_id = p_kompaniya_id;

  return jsonb_build_object(
    'ok', true, 'generated_at', now(), 'versiya', 1,
    'oy', jsonb_build_object('oy', to_char(v_dan, 'YYYY-MM'), 'dan', v_dan, 'gacha', v_gacha),
    'portfel', jsonb_build_object(
      'obyekt_soni', v_p->'qamrov'->'obyekt_soni',
      'shartnoma_qqs_bilan', v_p->'kartalar'->'portfel'->'shartnoma_qqs_bilan',
      'shartnoma_soni', v_p->'kartalar'->'portfel'->'shartnoma_soni',
      'smeta', v_p->'kartalar'->'portfel'->'smeta',
      'f2_jami', v_p->'kartalar'->'bajarildi'->'jami',
      'foiz_shartnoma', v_p->'kartalar'->'bajarildi'->'foiz_shartnoma'),
    'bajarildi_oy', jsonb_build_object('paket', v_p->'kartalar'->'bajarildi'->'davr', 'akt_soni', v_p->'kartalar'->'bajarildi'->'akt_soni'),
    'hujjat', v_hujjat,
    'qarz', jsonb_build_object('debitor', v_p->'kartalar'->'debitor', 'tolandi', v_p->'kartalar'->'tolandi'),
    'kechikkan', v_kech,
    'xavfli', v_xavfli,
    'kesh', v_kesh);
end $fn$;
revoke all on function public.t2_rahbar_pult_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_rahbar_pult_v1(bigint, bigint) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Cron + birinchi to'ldirish (hamma obyekt iflos -> cron to'ldiradi; shu paytgacha jonli hisob)
-- ─────────────────────────────────────────────────────────────────────────────
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 't2_obyekt_kesh_yangila') then perform cron.unschedule('t2_obyekt_kesh_yangila'); end if;
    perform cron.schedule('t2_obyekt_kesh_yangila', '* * * * *', 'set statement_timeout = ''150s''; select public.t2_obyekt_kesh_yangila_v1(40, ''iflos'')');
    if exists (select 1 from cron.job where jobname = 't2_obyekt_kesh_tungi') then perform cron.unschedule('t2_obyekt_kesh_tungi'); end if;
    perform cron.schedule('t2_obyekt_kesh_tungi', '20 22 * * *', 'set statement_timeout = ''900s''; select public.t2_obyekt_kesh_yangila_v1(600, ''hammasi'')');
  else
    raise warning 'pg_cron yo''q — t2_obyekt_kesh_yangila_v1 ni qo''lda/boshqa rejalashtiruvchi bilan chaqiring';
  end if;
end $cron$;

select public._t2_kesh_belgila_v1(array(select o.id from public.t2_obyekt o), 'migratsiya');
