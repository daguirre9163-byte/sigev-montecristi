// force rebuild vercelgit add .
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "leaflet/dist/leaflet.css";

import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

import {
  Users,
  MapPin,
  ClipboardList,
  CheckCircle,
  TrendingUp,
  Activity,
} from "lucide-react";

// -------------------------
// LEAFLET dinámico
// -------------------------

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);

const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

const GeoJSON = dynamic(
  () => import("react-leaflet").then((m) => m.GeoJSON),
  { ssr: false }
);

const Circle = dynamic(
  () => import("react-leaflet").then((m) => m.Circle),
  { ssr: false }
);

const L: any = require("leaflet");

// -------------------------
// CREAR ICONOS PERSONALIZADOS
// -------------------------

const crearIcono = (color: string, numero: string) => {
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
      <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="20" y="25" text-anchor="middle" font-size="14" font-weight="bold" fill="white">${numero}</text>
    </svg>
  `;

  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${Buffer.from(svgIcon).toString("base64")}`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

// -------------------------
// COLORES GRAFICOS
// -------------------------

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

// -------------------------
// TIPOS
// -------------------------

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: "tecnico" | "admin";
}

interface Comunidad {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  tecnicoId: string;
  activa: boolean;
}

// -------------------------
// COMPONENTE PRINCIPAL
// -------------------------

export default function DashboardAdminPowerBI() {
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const [stats, setStats] = useState<any>({});
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [chartCumplimiento, setChartCumplimiento] = useState<any[]>([]);
  const [chartParticipantes, setChartParticipantes] = useState<any[]>([]);
  const [chartPie, setChartPie] = useState<any[]>([]);
  const [chartSemanal, setChartSemanal] = useState<any[]>([]);
  const [chartRadar, setChartRadar] = useState<any[]>([]);
  const [chartTendencia, setChartTendencia] = useState<any[]>([]);
  const [geoMontecristi, setGeoMontecristi] = useState<any>(null);
  const [mapaComunidades, setMapaComunidades] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
    setMapReady(true);
  }, []);

  // -------------------------
  // LOAD DATA
  // -------------------------

  async function loadDashboard() {
    setLoading(true);

    const usuariosSnap = await getDocs(collection(db, "usuarios"));
    const comunidadesSnap = await getDocs(collection(db, "comunidades"));
    const participantesSnap = await getDocs(collection(db, "participantes"));
    const seguimientosSnap = await getDocs(collection(db, "seguimientos"));
    const planSnap = await getDocs(collection(db, "planificaciones"));
    const semanasSnap = await getDocs(collection(db, "semanas"));

    const geo = await fetch("/geo/montecristi.geojson");
    const geoData = await geo.json();
    setGeoMontecristi(geoData);

    // -------------------------
    // USUARIOS
    // -------------------------

    const usuariosData = usuariosSnap.docs
      .map((doc) => ({
        id: doc.id,
        nombre: (doc.data() as any).nombre || "",
        email: (doc.data() as any).email || "",
        rol: (doc.data() as any).rol || "",
      }))
      .filter((u) => u.rol === "tecnico" || u.rol === "admin");

    setUsuarios(usuariosData);

    // -------------------------
    // COMUNIDADES
    // -------------------------

    const comunidadesData: Comunidad[] = comunidadesSnap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        nombre: data.nombre || "",
        lat: data.lat || null,
        lng: data.lng || null,
        tecnicoId: data.tecnicoId || "",
        activa: data.activa || false,
      };
    });

    setComunidades(comunidadesData);

    // -------------------------
    // MAPA DE COMUNIDADES CON PARTICIPANTES
    // -------------------------

    const mapaComunidadesData = comunidadesData.map((comunidad) => {
      const participantesCom = participantesSnap.docs.filter(
        (p) => (p.data() as any).comunidadId === comunidad.id
      ).length;

      const tecnico = usuariosData.find((u) => u.id === comunidad.tecnicoId);

      return {
        ...comunidad,
        participantes: participantesCom,
        tecnico: tecnico?.nombre || "No asignado",
      };
    });

    setMapaComunidades(mapaComunidadesData);

    // -------------------------
    // STATS
    // -------------------------

    const participantesPorTecnico = usuariosData.map((tecnico) => {
      return participantesSnap.docs.filter(
        (p) => (p.data() as any).tecnicoId === tecnico.id
      ).length;
    });

    setStats({
      tecnicos: usuariosData.length,
      comunidades: comunidadesData.length,
      comunidadesActivas: comunidadesData.filter((c) => c.activa).length,
      participantes: participantesSnap.size,
      seguimientos: seguimientosSnap.size,
      planificaciones: planSnap.size,
      participantesProm:
        usuariosData.length > 0
          ? Math.round(
              participantesPorTecnico.reduce((a, b) => a + b, 0) /
                usuariosData.length
            )
          : 0,
    });

    // -------------------------
    // CUMPLIMIENTO
    // -------------------------

    const cumplimientoData = usuariosData.map((tecnico) => {
      const planes = planSnap.docs.filter(
        (p) => (p.data() as any).tecnicoId === tecnico.id
      ).length;

      const segs = seguimientosSnap.docs.filter(
        (s) => (s.data() as any).tecnicoId === tecnico.id
      ).length;

      const comunidadesAsignadas = comunidadesData.filter(
        (c) => c.tecnicoId === tecnico.id
      ).length;

      let cumplimiento = 0;
      if (planes > 0 && segs > 0) cumplimiento = 100;
      else if (planes > 0 || segs > 0) cumplimiento = 50;

      return {
        nombre: tecnico.nombre || tecnico.email,
        cumplimiento,
        comunidades: comunidadesAsignadas,
        planes,
        seguimientos: segs,
      };
    });

    setChartCumplimiento(cumplimientoData);

    // -------------------------
    // PARTICIPANTES POR COMUNIDAD
    // -------------------------

    setChartParticipantes(
      comunidadesData
        .map((com) => ({
          nombre: com.nombre,
          participantes: participantesSnap.docs.filter(
            (p) => (p.data() as any).comunidadId === com.id
          ).length,
        }))
        .sort((a, b) => b.participantes - a.participantes)
        .slice(0, 10) // Top 10
    );

    // -------------------------
    // PIE TECNICO
    // -------------------------

    setChartPie(
      usuariosData.map((t) => ({
        name: t.nombre || t.email,
        value: participantesSnap.docs.filter(
          (p) => (p.data() as any).tecnicoId === t.id
        ).length,
      }))
    );

    // -------------------------
    // RADAR DESEMPEÑO
    // -------------------------

    setChartRadar(
      usuariosData.map((t) => ({
        tecnico: (t.nombre || t.email).substring(0, 10),
        planificaciones: planSnap.docs.filter(
          (p) => (p.data() as any).tecnicoId === t.id
        ).length,
        seguimientos: seguimientosSnap.docs.filter(
          (s) => (s.data() as any).tecnicoId === t.id
        ).length,
        comunidades: comunidadesData.filter((c) => c.tecnicoId === t.id).length,
      }))
    );

    // -------------------------
    // HISTORICO SEMANAL
    // -------------------------

    setChartSemanal(
      semanasSnap.docs
        .map((s) => {
          const id = s.id;
          return {
            semana: (s.data() as any).fechaInicio || id,
            planificaciones: planSnap.docs.filter(
              (p) => (p.data() as any).semanaId === id
            ).length,
            seguimientos: seguimientosSnap.docs.filter(
              (s) => (s.data() as any).semanaId === id
            ).length,
          };
        })
        .slice(-8) // Últimas 8 semanas
    );

    // -------------------------
    // TENDENCIA DE PARTICIPANTES
    // -------------------------

    setChartTendencia(
      semanasSnap.docs
        .map((s) => {
          const id = s.id;
          const segs = seguimientosSnap.docs.filter(
            (seg) => (seg.data() as any).semanaId === id
          );

          let totalAsistentes = 0;
          segs.forEach((seg) => {
            const registros = (seg.data() as any).registros || [];
            registros.forEach((r: any) => {
              totalAsistentes += r.asistentesIds?.length || 0;
            });
          });

          return {
            semana: (s.data() as any).fechaInicio || id,
            asistentes: totalAsistentes,
          };
        })
        .slice(-8) // Últimas 8 semanas
    );

    setLoading(false);
  }

  // -------------------------
  // EXPORTAR
  // -------------------------

  function exportarExcel() {
    const datos = usuarios.map((t) => {
      const cumpl = chartCumplimiento.find(
        (c) => c.nombre === (t.nombre || t.email)
      );
      return {
        Tecnico: t.nombre,
        Email: t.email,
        Comunidades: cumpl?.comunidades || 0,
        Participantes: chartPie.find((p) => p.name === (t.nombre || t.email))
          ?.value || 0,
        Planificaciones: cumpl?.planes || 0,
        Seguimientos: cumpl?.seguimientos || 0,
        Cumplimiento: `${cumpl?.cumplimiento || 0}%`,
      };
    });

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard");

    const buffer = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });

    const file = new Blob([buffer]);
    saveAs(file, "SIGEV_Admin.xlsx");
  }

  // -------------------------
  // UI
  // -------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Encabezado */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            📊 Dashboard Admin SIGEV
          </h1>
          <p className="text-gray-600 mt-1">
            Vista integral del sistema de gestión
          </p>
        </div>

        <button
          onClick={exportarExcel}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md transition flex items-center gap-2"
        >
          📥 Exportar Excel
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          title="Técnicos"
          value={stats.tecnicos}
          icon={<Users className="w-8 h-8" />}
          color="from-blue-500 to-blue-600"
          subtitle="Activos"
        />
        <KPI
          title="Comunidades"
          value={stats.comunidades}
          icon={<MapPin className="w-8 h-8" />}
          color="from-green-500 to-green-600"
          subtitle={`${stats.comunidadesActivas} activas`}
        />
        <KPI
          title="Participantes"
          value={stats.participantes}
          icon={<Users className="w-8 h-8" />}
          color="from-purple-500 to-purple-600"
          subtitle={`${stats.participantesProm} promedio`}
        />
        <KPI
          title="Actividades"
          value={stats.seguimientos}
          icon={<Activity className="w-8 h-8" />}
          color="from-orange-500 to-orange-600"
          subtitle="Seguimientos"
        />
      </div>

      {/* MAPA */}
      <Panel title="🗺️ Mapa Institucional - Comunidades">
        {mapReady && (
          <MapContainer
            center={[-1.05, -80.45]}
            zoom={11}
            style={{ height: 500, borderRadius: "8px" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {geoMontecristi && (
              <GeoJSON
                data={geoMontecristi}
                style={{
                  color: "#3b82f6",
                  weight: 2,
                  fillOpacity: 0.05,
                }}
              />
            )}

            {mapaComunidades.map((comunidad) => {
              if (!comunidad.lat || !comunidad.lng) return null;

              const color = comunidad.activa ? "#10b981" : "#ef4444";
              const icono = crearIcono(color, comunidad.participantes.toString());

              return (
                <div key={comunidad.id}>
                  {/* Círculo de cobertura */}
                  <Circle
                    center={[comunidad.lat, comunidad.lng]}
                    radius={800}
                    pathOptions={{
                      color: color,
                      fillColor: color,
                      fillOpacity: 0.2,
                      weight: 2,
                      dashArray: "5, 5",
                    }}
                  />

                  {/* Marcador */}
                  <Marker position={[comunidad.lat, comunidad.lng]} icon={icono}>
                    <Popup>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="font-bold text-gray-900">
                            {comunidad.nombre}
                          </p>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <p className="font-semibold text-blue-900">
                            👥 {comunidad.participantes} participantes
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">
                            Técnico: <span className="font-semibold">{comunidad.tecnico}</span>
                          </p>
                        </div>
                        <div>
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold text-white ${
                              comunidad.activa
                                ? "bg-green-600"
                                : "bg-red-600"
                            }`}
                          >
                            {comunidad.activa ? "✅ Activa" : "⛔ Inactiva"}
                          </span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </div>
              );
            })}
          </MapContainer>
        )}
      </Panel>

      {/* GRÁFICOS PRINCIPALES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Chart title="📊 Cumplimiento por Técnico" height={350}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartCumplimiento}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="nombre"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend />
              <Bar
                dataKey="cumplimiento"
                fill="#10b981"
                name="Cumplimiento %"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="👥 Top 10 Comunidades por Participantes" height={350}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartParticipantes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="nombre" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Bar
                dataKey="participantes"
                fill="#3b82f6"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="🥧 Distribución de Participantes por Técnico" height={350}>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={chartPie}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
                cx="50%"
                cy="50%"
              >
                {chartPie.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="📈 Desempeño por Técnico" height={350}>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={chartRadar}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="tecnico" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 11 }} />
              <Radar
                name="Planificaciones"
                dataKey="planificaciones"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.6}
              />
              <Radar
                name="Seguimientos"
                dataKey="seguimientos"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.6}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </Chart>
      </div>

      {/* GRÁFICOS SECUNDARIOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Chart title="📊 Histórico Semanal" height={300}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartSemanal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend />
              <Bar
                dataKey="planificaciones"
                fill="#3b82f6"
                name="Planificaciones"
                radius={[8, 8, 0, 0]}
              />
              <Bar
                dataKey="seguimientos"
                fill="#10b981"
                name="Seguimientos"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="📈 Tendencia de Asistentes" height={300}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartTendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Line
                type="monotone"
                dataKey="asistentes"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ fill: "#f59e0b", r: 5 }}
                name="Total Asistentes"
              />
            </LineChart>
          </ResponsiveContainer>
        </Chart>
      </div>

      {/* TABLA DE TÉCNICOS */}
      <Panel title="👨‍💼 Resumen de Técnicos">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Técnico</th>
                <th className="px-6 py-3 text-center font-semibold">
                  Comunidades
                </th>
                <th className="px-6 py-3 text-center font-semibold">
                  Participantes
                </th>
                <th className="px-6 py-3 text-center font-semibold">
                  Planificaciones
                </th>
                <th className="px-6 py-3 text-center font-semibold">
                  Seguimientos
                </th>
                <th className="px-6 py-3 text-center font-semibold">
                  Cumplimiento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chartCumplimiento.map((tecnico, idx) => {
                const participantes =
                  chartPie.find((p) => p.name === tecnico.nombre)?.value || 0;
                return (
                  <tr
                    key={idx}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {tecnico.nombre}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {tecnico.comunidades}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold">
                      {participantes}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {tecnico.planes}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {tecnico.seguimientos}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                          tecnico.cumplimiento === 100
                            ? "bg-green-600"
                            : tecnico.cumplimiento === 50
                            ? "bg-yellow-600"
                            : "bg-red-600"
                        }`}
                      >
                        {tecnico.cumplimiento}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// -------------------------
// COMPONENTES AUXILIARES
// -------------------------

function KPI({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${color} text-white p-6 rounded-lg shadow-md hover:shadow-lg transition`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm opacity-90 font-semibold">{title}</p>
          <h3 className="text-3xl font-bold mt-2">{value}</h3>
          {subtitle && (
            <p className="text-xs opacity-75 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="opacity-80">{icon}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function Chart({
  title,
  children,
  height = 300,
}: {
  title: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <Panel title={title}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </Panel>
  );
}