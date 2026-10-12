import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
const marker = L.icon({ iconUrl: icon, shadowUrl: shadow, iconSize: [25,41], iconAnchor: [12,41] });
function Picker({ position, onChange }: { position: [number,number] | null; onChange: (p: [number,number]) => void }) {
  useMapEvents({ click: e => onChange([e.latlng.lat,e.latlng.lng]) });
  return position ? <Marker position={position} icon={marker} /> : null;
}
export default function ObjectLocationMap(props: { position: [number,number] | null; onChange: (p: [number,number]) => void }) {
  return <MapContainer center={props.position ?? [41.2995,69.2401]} zoom={12} style={{height:'100%',width:'100%'}}>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
    <Picker {...props} />
  </MapContainer>;
}
