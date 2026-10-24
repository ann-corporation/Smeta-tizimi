import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
import { t } from '../../i18n/til';
import { koordinataMatni, koordinataniOqi, manzilQidir, TOSHKENT, type LatLng, type ManzilNatija } from '../../lib/geo';

const marker = L.icon({ iconUrl: icon, shadowUrl: shadow, iconSize: [25, 41], iconAnchor: [12, 41] });

type Props = { position: LatLng | null; onChange: (p: LatLng) => void };

/** Bosilgan joyga pin qo'yadi; pin sudralsa ham koordinata yangilanadi. */
function Picker({ position, onChange }: Props) {
  useMapEvents({ click: (e) => onChange([e.latlng.lat, e.latlng.lng]) });
  const handlers = useMemo(() => ({
    dragend(e: L.LeafletEvent) {
      const ll = (e.target as L.Marker).getLatLng();
      onChange([ll.lat, ll.lng]);
    },
  }), [onChange]);
  return position ? <Marker position={position} icon={marker} draggable eventHandlers={handlers} /> : null;
}

/** Tashqaridan (qidiruv/koordinata kiritish) o'zgargan pozitsiyaga xaritani suradi. */
function Suruvchi({ target }: { target: { p: LatLng; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.setView(target.p, Math.max(map.getZoom(), target.zoom)); }, [target, map]);
  return null;
}

export default function ObjectLocationMap({ position, onChange }: Props) {
  const [koordMatn, setKoordMatn] = useState(position ? koordinataMatni(position) : '');
  const [koordXato, setKoordXato] = useState('');
  const [so, setSo] = useState('');
  const [natijalar, setNatijalar] = useState<ManzilNatija[] | null>(null);
  const [qidirilmoqda, setQidirilmoqda] = useState(false);
  const [qidiruvXato, setQidiruvXato] = useState('');
  const [target, setTarget] = useState<{ p: LatLng; zoom: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  /* Pin xaritadan o'zgarganda matn maydoni ham yangilansin. */
  useEffect(() => { setKoordMatn(position ? koordinataMatni(position) : ''); setKoordXato(''); }, [position]);
  useEffect(() => () => abort.current?.abort(), []);

  const qoy = (p: LatLng, zoom = 16) => { onChange(p); setTarget({ p, zoom }); };

  const koordQollash = () => {
    const p = koordinataniOqi(koordMatn);
    if (!p) { setKoordXato(t('Koordinata noto‘g‘ri. Misol: 41.2995, 69.2401')); return; }
    setKoordXato('');
    qoy(p);
  };

  const qidir = async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setQidirilmoqda(true); setQidiruvXato(''); setNatijalar(null);
    try {
      const r = await manzilQidir(so, ac.signal);
      if (ac.signal.aborted) return;
      setNatijalar(r);
      if (!r.length) setQidiruvXato(t('Manzil topilmadi. Xaritadan bosing yoki koordinata kiriting.'));
    } catch (e) {
      if (!ac.signal.aborted) setQidiruvXato(e instanceof Error ? e.message : t('Manzil qidiruvi ishlamadi'));
    } finally { if (!ac.signal.aborted) setQidirilmoqda(false); }
  };

  const joyim = () => {
    if (!('geolocation' in navigator)) { setQidiruvXato(t('Brauzer joylashuvni bermaydi')); return; }
    navigator.geolocation.getCurrentPosition(
      (g) => qoy([g.coords.latitude, g.coords.longitude]),
      () => setQidiruvXato(t('Joylashuvga ruxsat berilmadi')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const inp = 'bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text outline-none focus:border-sky-500';
  const btn = 'px-3 py-1.5 rounded-lg text-[12px] font-medium bg-surface-2 hover:bg-surface-2/70 border border-border';

  return (
    <div className="flex flex-col h-full w-full">
      <div className="p-2 space-y-2 border-b border-border bg-surface">
        <div className="flex gap-2">
          <input value={so} onChange={(e) => setSo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void qidir(); }}
            className={inp + ' flex-1 min-w-0'} placeholder={t('Manzil qidirish (masalan: Navoiy, Karmana)')} aria-label={t('Manzil qidirish')} />
          <button type="button" onClick={() => void qidir()} disabled={qidirilmoqda || so.trim().length < 3} className={btn}>
            {qidirilmoqda ? '…' : t('Qidirish')}
          </button>
          <button type="button" onClick={joyim} className={btn} title={t('Hozirgi joylashuvim')}>{t('Mening joyim')}</button>
        </div>
        {natijalar && natijalar.length > 0 && (
          <ul className="max-h-28 overflow-auto rounded-lg border border-border divide-y divide-border bg-bg">
            {natijalar.map((n, i) => (
              <li key={i}>
                <button type="button" className="w-full text-left px-2.5 py-1.5 text-[11px] text-text hover:bg-surface-2"
                  onClick={() => { qoy([n.lat, n.lng], 15); setNatijalar(null); }}>{n.nom}</button>
              </li>
            ))}
          </ul>
        )}
        {qidiruvXato && <p className="text-[11px] text-amber-500">{qidiruvXato}</p>}
        <div className="flex gap-2">
          <input value={koordMatn} onChange={(e) => setKoordMatn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') koordQollash(); }}
            className={inp + ' flex-1 min-w-0 font-mono'} placeholder={t('Koordinata: 41.2995, 69.2401')} aria-label={t('Koordinata')} />
          <button type="button" onClick={koordQollash} className={btn}>{t('Qo‘llash')}</button>
        </div>
        {koordXato && <p className="text-[11px] text-red-400">{koordXato}</p>}
        <p className="text-[10px] text-text-mute">{t('Xaritani bosing yoki pinni suring. Manzil qidiruvi: OpenStreetMap.')}</p>
      </div>
      <div className="flex-1 min-h-[240px] relative z-0">
        <MapContainer center={position ?? TOSHKENT} zoom={position ? 15 : 7} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <Picker position={position} onChange={onChange} />
          <Suruvchi target={target} />
        </MapContainer>
      </div>
    </div>
  );
}
