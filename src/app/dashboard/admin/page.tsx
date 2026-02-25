"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import { db } from "@/lib/firebase";

import {
  collection,
  getDocs
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
  Cell
} from "recharts";

import {
  Users,
  MapPin,
  ClipboardList,
  CheckCircle
} from "lucide-react";


// ✅ IMPORTAR MAPA DINÁMICO
const MapaLeaflet = dynamic(
  () => import("@/MapaLeaflet"),
  { ssr: false }
);


// -------------------------
// COLORES GRAFICOS
// -------------------------

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#ca8a04"
];


// -------------------------
// COMPONENTE PRINCIPAL
// -------------------------

export default function DashboardAdminPowerBI() {

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const [stats, setStats] = useState<any>({});
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [comunidades, setComunidades] = useState<any[]>([]);

  const [chartCumplimiento, setChartCumplimiento] = useState<any[]>([]);
  const [chartParticipantes, setChartParticipantes] = useState<any[]>([]);
  const [chartPie, setChartPie] = useState<any[]>([]);
  const [chartSemanal, setChartSemanal] = useState<any[]>([]);

  const [geoMontecristi, setGeoMontecristi] = useState<any>(null);


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


    //-------------------------
    // TECNICOS
    //-------------------------

    const tecnicosData = usuariosSnap.docs
      .map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          nombre: data.nombre || "",
          email: data.email || "",
          rol: data.rol || ""
        };
      })
      .filter(u => u.rol === "tecnico" || u.rol === "admin");

    setTecnicos(tecnicosData);


    //-------------------------
    // COMUNIDADES
    //-------------------------

    const comunidadesData =
      comunidadesSnap.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          nombre: data.nombre || "",
          lat: data.lat || null,
          lng: data.lng || null,
          tecnicoId: data.tecnicoId || "",
          activa: data.activa || false
        };
      });

    setComunidades(comunidadesData);


    //-------------------------
    // STATS
    //-------------------------

    setStats({
      tecnicos: tecnicosData.length,
      comunidades: comunidadesData.length,
      comunidadesActivas:
        comunidadesData.filter(c => c.activa).length,
      participantes: participantesSnap.size,
      seguimientos: seguimientosSnap.size,
      planificaciones: planSnap.size
    });


    //-------------------------
    // CUMPLIMIENTO
    //-------------------------

    setChartCumplimiento(

      tecnicosData.map(tecnico => {

        const plan =
          planSnap.docs.find(
            p => (p.data() as any).tecnicoId === tecnico.id
          );

        const seg =
          seguimientosSnap.docs.find(
            s => (s.data() as any).tecnicoId === tecnico.id
          );

        let cumplimiento = 0;

        if (plan && seg) cumplimiento = 100;
        else if (plan || seg) cumplimiento = 50;

        return {
          nombre: tecnico.nombre || tecnico.email,
          cumplimiento
        };

      })

    );


    //-------------------------
    // PARTICIPANTES POR COMUNIDAD
    //-------------------------

    setChartParticipantes(
      comunidadesData.map(com => ({
        nombre: com.nombre,
        participantes:
          participantesSnap.docs.filter(
            p => (p.data() as any).comunidadId === com.id
          ).length
      }))
    );


    //-------------------------
    // PIE TECNICO
    //-------------------------

    setChartPie(
      tecnicosData.map(t => ({
        name: t.nombre || t.email,
        value:
          participantesSnap.docs.filter(
            p => (p.data() as any).tecnicoId === t.id
          ).length
      }))
    );


    //-------------------------
    // HISTORICO
    //-------------------------

    setChartSemanal(
      semanasSnap.docs.map(s => {

        const id = s.id;

        return {
          semana: id,
          planificaciones:
            planSnap.docs.filter(
              p => (p.data() as any).semanaId === id
            ).length,
          seguimientos:
            seguimientosSnap.docs.filter(
              s => (s.data() as any).semanaId === id
            ).length
        };

      })
    );

    setLoading(false);
  }


  //-------------------------------------------------
  // EXPORTAR
  //-------------------------------------------------

  function exportarExcel() {

    const datos =
      tecnicos.map(t => ({
        Tecnico: t.nombre
      }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "SIGEV");

    const buffer =
      XLSX.write(wb, { bookType: "xlsx", type: "array" });

    const file = new Blob([buffer]);

    saveAs(file, "SIGEV_Admin.xlsx");

  }


  //-------------------------------------------------
  // UI
  //-------------------------------------------------

  if (loading)
    return <div className="p-6">Cargando Dashboard...</div>;


  return (

    <div className="p-6 space-y-6">

      <div className="flex justify-between">

        <h1 className="text-2xl font-bold">
          Dashboard Admin SIGEV
        </h1>

        <button
          onClick={exportarExcel}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Exportar Excel
        </button>

      </div>


      {/* KPI */}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">

        <KPI title="Técnicos" value={stats.tecnicos} icon={<Users />} color="bg-blue-500" />

        <KPI title="Comunidades" value={stats.comunidades} icon={<MapPin />} color="bg-green-500" />

        <KPI title="Activas" value={stats.comunidadesActivas} icon={<MapPin />} color="bg-emerald-600" />

        <KPI title="Participantes" value={stats.participantes} icon={<Users />} color="bg-purple-500" />

        <KPI title="Planificaciones" value={stats.planificaciones} icon={<ClipboardList />} color="bg-orange-500" />

        <KPI title="Seguimientos" value={stats.seguimientos} icon={<CheckCircle />} color="bg-emerald-700" />

      </div>


      {/* 🗺️ MAPA */}

      <Panel title="Mapa institucional">

        {mapReady && (
          <MapaLeaflet
            comunidades={comunidades}
            tecnicos={tecnicos}
            geoMontecristi={geoMontecristi}
          />
        )}

      </Panel>


      {/* GRAFICOS */}

      <div className="grid md:grid-cols-2 gap-4">

        <Chart title="Cumplimiento técnico">
          <BarChart data={chartCumplimiento}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="nombre"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="cumplimiento" fill="#16a34a"/>
          </BarChart>
        </Chart>

        <Chart title="Participantes por comunidad">
          <BarChart data={chartParticipantes}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="nombre"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="participantes" fill="#2563eb"/>
          </BarChart>
        </Chart>

        <Chart title="Distribución por técnico">
          <PieChart>
            <Pie data={chartPie} dataKey="value">
              {chartPie.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]}/>
              ))}
            </Pie>
            <Tooltip/>
          </PieChart>
        </Chart>

        <Chart title="Histórico semanal">
          <BarChart data={chartSemanal}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="semana"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="planificaciones" fill="#2563eb"/>
            <Bar dataKey="seguimientos" fill="#16a34a"/>
          </BarChart>
        </Chart>

      </div>

    </div>

  );

}


// -------------------------

function KPI({title,value,icon,color}:any){
  return(
    <div className={`text-white p-4 rounded shadow ${color}`}>
      <div className="flex justify-between">
        <div>
          <p>{title}</p>
          <h2 className="text-2xl font-bold">{value}</h2>
        </div>
        {icon}
      </div>
    </div>
  );
}


// -------------------------

function Panel({title,children}:any){
  return(
    <div className="bg-white p-4 rounded shadow">
      <h2 className="font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}


// -------------------------

function Chart({title,children}:any){
  return(
    <div className="bg-white p-4 rounded shadow">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}