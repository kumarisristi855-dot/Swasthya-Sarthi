import React from 'react';
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function LocationPin({ position, onChange }) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng]);
    },
  });

  return position ? (
    <CircleMarker
      center={position}
      radius={9}
      pathOptions={{ color: 'var(--color-surface)', fillColor: 'var(--color-primary)', fillOpacity: 1, weight: 3 }}
    />
  ) : null;
}

export default function LocationMapPicker({ position, onChange }) {
  return (
    <MapContainer center={position} zoom={14} className="h-full w-full" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationPin position={position} onChange={onChange} />
    </MapContainer>
  );
}
