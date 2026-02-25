"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  GeoJSON
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

const iconActivo = new L.Icon({
  iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
  iconSize: [32, 32],
});

const iconInactivo = new L.Icon({
  iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
  iconSize: [32, 32],
});

export default function MapaLeaflet({
  comunidades,
  tecnicos,
  geoMontecristi
}: any) {
  return (
    <MapContainer
      center={[-1.05, -80.45]}
      zoom={11}
      style={{ height: 400 }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {geoMontecristi && (
        <GeoJSON
          data={geoMontecristi}
          style={{
            color: "#2563eb",
            weight: 2,
            fillOpacity: 0.1
          }}
        />
      )}

      {comunidades.map((c: any) => {

        if (c.lat == null || c.lng == null) return null;

        const activa = c.activa === true;

        return (
          <div key={c.id}>

            <Circle
              center={[c.lat, c.lng]}
              radius={800}
              pathOptions={{
                color: activa ? "#00ff00" : "#ff0000",
                fillColor: activa ? "#00ff00" : "#ff0000",
                fillOpacity: 0.35,
                weight: 3
              }}
            />

            <Marker
              position={[c.lat, c.lng]}
              icon={activa ? iconActivo : iconInactivo}
            >
              <Popup>
                <b>{c.nombre}</b>
                <br />
                Estado:
                <b style={{ color: activa ? "green" : "red" }}>
                  {activa ? " Participando" : " No participa"}
                </b>
                <br />
                Técnico:
                {
                  tecnicos.find(
                    (t: any) => t.id === c.tecnicoId
                  )?.nombre || "No asignado"
                }
              </Popup>
            </Marker>

          </div>
        );
      })}

    </MapContainer>
  );
}