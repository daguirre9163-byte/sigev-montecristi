"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { db } from "@/lib/firebase";

import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ======================================================
// TIPOS
// ======================================================

type Registro = {
  fecha: string;
  comunidadNombre: string;
  porcentajeAsistencia: number;
  asistentesIds?: string[];
  estado?: string;
  semanaId?: string;
};

type SemanaMap = {
  [id: string]: {
    fechaInicio: string;
    fechaFin: string;
  };
};

// ======================================================
// UTILIDADES
// ======================================================

function formatearRango(inicio: string, fin: string) {
  const i = new Date(inicio);
  const f = new Date(fin);

  const op = { month: "short" } as const;

  return `${i.getDate()} ${i.toLocaleDateString("es", op)}
   - ${f.getDate()} ${f.toLocaleDateString("es", op)}`;
}

// ======================================================
// COMPONENTE
// ======================================================

export default function DashboardTecnicoV2() {

  const { user } = useAuth();

  const [dataSemana, setDataSemana] = useState<Registro[]>([]);
  const [dataHistorico, setDataHistorico] = useState<Registro[]>([]);
  const [mapSemanas, setMapSemanas] = useState<SemanaMap>({});
  const [semanaActivaLabel, setSemanaActivaLabel] = useState("");

  const [kpiSemana, setKpiSemana] = useState<any>({});
  const [kpiHist, setKpiHist] = useState<any>({});

  const [loading, setLoading] = useState(true);

  // ======================================================
  // CARGAR DATOS
  // ======================================================

  useEffect(() => {
    if (!user) return;
    cargarDatos();
  }, [user]);

  async function cargarDatos() {

    setLoading(true);

    const semana = await getSemanaActiva();
    if (!semana) return;

    // 🟡 Cargar semanas (mapa)
    const snapSemanas = await getDocs(collection(db, "semanas"));

    const map: SemanaMap = {};

    snapSemanas.docs.forEach((doc) => {
      const d = doc.data();
      map[doc.id] = {
        fechaInicio: d.fechaInicio,
        fechaFin: d.fechaFin,
      };
    });

    setMapSemanas(map);

    // Label semana activa
    if (map[semana.id]) {
      setSemanaActivaLabel(
        formatearRango(
          map[semana.id].fechaInicio,
          map[semana.id].fechaFin
        )
      );
    }

    // 🔵 SEMANA ACTUAL
    const qSemana = query(
      collection(db, "seguimientos"),
      where("tecnicoId", "==", user!.uid),
      where("semanaId", "==", semana.id)
    );

    const snapSemana = await getDocs(qSemana);

    const registrosSemana = snapSemana.docs.flatMap((doc) => {
      const d = doc.data();
      return (d.registros || []).map((r: any) => ({
        ...r,
        estado: d.estado,
        semanaId: d.semanaId,
      }));
    });

    setDataSemana(registrosSemana);

    // 🟣 HISTÓRICO
    const qHist = query(
      collection(db, "seguimientos"),
      where("tecnicoId", "==", user!.uid)
    );

    const snapHist = await getDocs(qHist);

    const registrosHist = snapHist.docs.flatMap((doc) => {
      const d = doc.data();
      return (d.registros || []).map((r: any) => ({
        ...r,
        estado: d.estado,
        semanaId: d.semanaId,
      }));
    });

    setDataHistorico(registrosHist);

    calcularKPIs(registrosSemana, registrosHist);

    setLoading(false);
  }

  // ======================================================
  // KPI
  // ======================================================

  function calcularKPIs(semana: Registro[], hist: Registro[]) {

    const totalSemana = semana.length;
    const enviados = semana.filter((d) => d.estado === "enviado").length;

    const promedio =
      totalSemana === 0
        ? 0
        : semana.reduce((a, b) => a + (b.porcentajeAsistencia || 0), 0) /
          totalSemana;

    const asistentes = semana.reduce(
      (acc, d) => acc + (d.asistentesIds?.length || 0),
      0
    );

    setKpiSemana({
      total: totalSemana,
      enviados,
      promedio,
      asistentes,
    });

    // Histórico

    const totalHist = hist.length;

    const promedioHist =
      totalHist === 0
        ? 0
        : hist.reduce((a, b) => a + (b.porcentajeAsistencia || 0), 0) /
          totalHist;

    const impacto = hist.reduce(
      (acc, d) => acc + (d.asistentesIds?.length || 0),
      0
    );

    const comunidades = new Set(
      hist.map((d) => d.comunidadNombre)
    ).size;

    const score =
      promedioHist * 0.5 +
      (enviados / (totalSemana || 1)) * 100 * 0.3 +
      (impacto > 0 ? 20 : 0);

    setKpiHist({
      total: totalHist,
      promedio: promedioHist,
      impacto,
      comunidades,
      score,
    });
  }

  // ======================================================
  // TENDENCIA
  // ======================================================

  const porSemana = Object.values(
    dataHistorico.reduce((acc: any, item: any) => {

      if (!acc[item.semanaId]) {
        acc[item.semanaId] = {
          semanaId: item.semanaId,
          total: 0,
          asistencia: 0,
        };
      }

      acc[item.semanaId].total += 1;
      acc[item.semanaId].asistencia += item.porcentajeAsistencia || 0;

      return acc;

    }, {})
  )
    .map((s: any) => ({
      semanaId: s.semanaId,
      promedio: s.asistencia / s.total,
    }))
    .sort((a, b) => a.semanaId.localeCompare(b.semanaId))
    .map((s) => ({
      semana:
        mapSemanas[s.semanaId]
          ? formatearRango(
              mapSemanas[s.semanaId].fechaInicio,
              mapSemanas[s.semanaId].fechaFin
            )
          : s.semanaId,
      promedio: s.promedio,
    }));

  const tendencia =
    porSemana.length >= 2
      ? porSemana[porSemana.length - 1].promedio -
        porSemana[porSemana.length - 2].promedio
      : 0;

  const pieData = [
    { name: "Enviados", value: kpiSemana.enviados || 0 },
    {
      name: "Pendientes",
      value:
        (kpiSemana.total || 0) - (kpiSemana.enviados || 0),
    },
  ];

  const COLORS = ["#16A34A", "#DC2626"];

  if (loading)
    return <div className="p-6">Cargando dashboard...</div>;

  // ======================================================
  // UI
  // ======================================================

  return (
    <div className="p-6 space-y-10 bg-slate-50 min-h-screen">

      <h1 className="text-3xl font-bold text-slate-800">
        Dashboard Técnico SIGEV
      </h1>

      {/* SEMANA ACTIVA */}

      <div className="bg-white p-4 rounded-xl shadow">
        <b>Semana activa:</b> {semanaActivaLabel}
      </div>

      {/* KPIs SEMANA */}

      <KPIGrid>
        <KPI title="Actividades" value={kpiSemana.total || 0} gradient="from-blue-500 to-indigo-600" icon="📋" />
        <KPI title="Enviados" value={kpiSemana.enviados || 0} gradient="from-green-500 to-emerald-600" icon="✅" />
        <KPI title="Asistencia" value={`${(kpiSemana.promedio || 0).toFixed(1)}%`} gradient="from-yellow-400 to-orange-500" icon="📊" />
        <KPI title="Participantes" value={kpiSemana.asistentes || 0} gradient="from-cyan-500 to-blue-500" icon="👥" />
      </KPIGrid>

      {/* HISTORICO */}

      <KPIGrid>
        <KPI title="Total Actividades" value={kpiHist.total || 0} gradient="from-purple-500 to-indigo-600" icon="📚" />
        <KPI title="Promedio Histórico" value={`${(kpiHist.promedio || 0).toFixed(1)}%`} gradient="from-fuchsia-500 to-pink-600" icon="📈" />
        <KPI title="Impacto Total" value={kpiHist.impacto || 0} gradient="from-teal-500 to-emerald-600" icon="🌍" />
        <KPI title="Comunidades" value={kpiHist.comunidades || 0} gradient="from-amber-500 to-orange-600" icon="🏘️" />
        <KPI title="Score" value={`${(kpiHist.score || 0).toFixed(0)}%`} gradient="from-indigo-600 to-purple-700" icon="🏆" />
      </KPIGrid>

      {/* GRAFICO */}

      <div className="bg-white p-5 rounded-2xl shadow-md">

        <h2 className="font-bold mb-2">
          Tendencia de asistencia
        </h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={porSemana}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="semana" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="promedio" stroke="#7C3AED" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>

        <div className="text-center font-semibold mt-3">
          Tendencia:
          {tendencia > 0 && " 🔼 Mejorando"}
          {tendencia < 0 && " 🔽 Bajando"}
          {tendencia === 0 && " ➖ Estable"}
        </div>

      </div>

      {/* PIE */}

      <div className="bg-white p-5 rounded-2xl shadow-md">

        <h2 className="font-bold mb-2">
          Estado de registros
        </h2>

        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pieData} dataKey="value" label>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

      </div>

    </div>
  );
}

// ======================================================
// UI COMPONENTES
// ======================================================

function KPIGrid({ children }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {children}
    </div>
  );
}

function KPI({ title, value, gradient, icon }: any) {
  return (
    <div className={`p-5 rounded-2xl text-white shadow-lg bg-gradient-to-r ${gradient}`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <h2 className="text-2xl font-bold">{value}</h2>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}