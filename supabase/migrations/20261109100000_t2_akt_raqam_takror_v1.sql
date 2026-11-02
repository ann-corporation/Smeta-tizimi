-- T2-F2-RAQAM-TAKROR (egasi 2026-10-25: «bitta F2 ni ikki marta yozib qo'yishga himoya kerak»).
-- Qoida: bir kompaniyada bir shartnoma (shartnoma_id berilgan bo'lsa) yoki bir obyekt doirasida bir xil F2 raqami
-- (tur='f2', holat<>'bekor', raqam bo'sh emas; harf katta-kichikligi va chetdagi bo'shliq hisobga olinmaydi) ikki faol aktda bo'lmaydi.
-- Oy hisobga olinmaydi (mavjud t2_akt_kalit_uniq faqat obyekt+oy+raqam). Tuzatish aktlari (manba='tuzatish', «N-P») istisno.
-- MAVJUD TAKRORLAR (kompaniya 123: №35 sh.25, №36 sh.25, №49 sh.26) migratsiyani yiqitmaydi: bu unique index emas, TRIGGER —
-- u faqat YANGI qator (INSERT) yoki raqam/obyekt/shartnoma/tur o'zgargan yoki bekordan qaytarilgan UPDATE da tekshiradi.
-- Mavjud takror aktlarning holat o'tishlari (tasdiqlash va h.k.) bloklanmaydi.
-- Xato: 23505, xabarda «t2_akt_raqam_takror» (sb-yoz.ts f2AktRaqamZiddiyati taniydi).
begin;

create or replace function public.t2_akt_raqam_takror_v1()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_r text; v_id bigint;
begin
  if new.tur is distinct from 'f2' or new.holat is not distinct from 'bekor' or new.manba is not distinct from 'tuzatish' then return new; end if;
  v_r := lower(btrim(coalesce(new.raqam, '')));
  if v_r = '' then return new; end if;
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(old.raqam, ''))) = v_r
     and new.obyekt_id is not distinct from old.obyekt_id
     and new.shartnoma_id is not distinct from old.shartnoma_id
     and old.tur is not distinct from new.tur
     and old.holat is distinct from 'bekor' then
    return new;  -- raqam/doira o'zgarmagan: mavjud (ehtimol eski takror) akt holati o'tishi
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_akt_raqam:' || coalesce(new.kompaniya_id::text, '') || ':' || v_r, 0));
  select a.id into v_id from public.t2_akt a
   where a.kompaniya_id is not distinct from new.kompaniya_id
     and a.tur = 'f2' and a.holat <> 'bekor' and a.manba is distinct from 'tuzatish'
     and lower(btrim(coalesce(a.raqam, ''))) = v_r
     and a.id <> coalesce(new.id, -1)
     and (a.obyekt_id = new.obyekt_id or (new.shartnoma_id is not null and a.shartnoma_id = new.shartnoma_id))
   order by a.id limit 1;
  if v_id is not null then
    raise exception 'duplicate key value violates unique constraint "t2_akt_raqam_takror": F2 №% allaqachon mavjud (akt #%)', new.raqam, v_id
      using errcode = '23505';
  end if;
  return new;
end $function$;

drop trigger if exists t2_akt_raqam_takror on public.t2_akt;
create trigger t2_akt_raqam_takror before insert or update of raqam, obyekt_id, shartnoma_id, tur, holat on public.t2_akt
  for each row execute function public.t2_akt_raqam_takror_v1();

commit;