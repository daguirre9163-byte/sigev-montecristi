"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ComposedChart,
} from "recharts";

// ============ TIPOS ============
interface Registro {
  fecha: string;
  comunidadNombre: string;
  comunidadId: string;
  porcentajeAsistencia: number;
  asistentesIds?: string[];
  estado?: string;
  semanaId?: string;
  estadoActividad?: string;
}

interface SemanaInfo {
  id: string;
  fechaInicio: string;
  fechaFin: string;
}

interface ComunidadStats {
  id: string;
  nombre: string;
  participantes: number;
  actividades: number;
  asistencia: number;
  ultimaVisita: string;
  diasDesdeUltimaVisita: number;
  enRiesgo: boolean;
}

interface AlertaComunidad {
  id: string;
  nombre: string;
  diasSinVisita: number;
  ultimaVisita: string;
  severidad: "alto" | "medio" | "bajo";
}

// ============ HOOK: Cargar datos del dashboard ============
function useCargarDashboard(userId: string | undefined) {
  const [data, setData] = useState({
    dataSemana: [] as Registro[],
    dataHistorico: [] as Registro[],
    semanas: new Map<string, SemanaInfo>(),
    semanaActiva: null as SemanaInfo | null,
    comunidades: [] as any[],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Cargar semana activa
      const semana = await getSemanaActiva();
      if (!semana) throw new Error("No hay semana activa");

      // 2. Cargar todas las semanas
      const snapSemanas = await getDocs(collection(db, "semanas"));
      const semanasMap = new Map<string, SemanaInfo>();

      snapSemanas.docs.forEach((doc) => {
        semanasMap.set(doc.id, {
          id: doc.id,
          ...doc.data(),
        } as SemanaInfo);
      });

      // 3. Cargar seguimientos de la semana actual
      const qSemana = query(
        collection(db, "seguimientos"),
        where("tecnicoId", "==", userId),
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

      // 4. Cargar histórico completo
      const qHist = query(
        collection(db, "seguimientos"),
        where("tecnicoId", "==", userId)
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

      // 5. Cargar comunidades
      const comunidadesData = await getComunidadesByTecnico(userId);

      setData({
        dataSemana: registrosSemana,
        dataHistorico: registrosHist,
        semanas: semanasMap,
        semanaActiva: semana,
        comunidades: comunidadesData,
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { ...data, loading, error, recargar: cargar };
}

// ============ HOOK: Calcular estadísticas ============
function useEstadisticas(
  dataSemana: Registro[],
  dataHistorico: Registro[],
  semanas: Map<string, SemanaInfo>
) {
  return useMemo(() => {
    // KPIs Semana
    const totalActividades = dataSemana.filter(
      (d) => d.estadoActividad === "realizada"
    ).length;
    const enviados = dataSemana.filter((d) => d.estado === "enviado").length;
    const promediaSemana =
      totalActividades === 0
        ? 0
        : dataSemana
            .filter((d) => d.estadoActividad === "realizada")
            .reduce((a, b) => a + (b.porcentajeAsistencia || 0), 0) /
          totalActividades;

    const asistentesTotal = dataSemana.reduce(
      (acc, d) => acc + (d.asistentesIds?.length || 0),
      0
    );

    // KPIs Histórico
    const totalHist = dataHistorico.filter(
      (d) => d.estadoActividad === "realizada"
    ).length;
    const promedioHist =
      totalHist === 0
        ? 0
        : dataHistorico
            .filter((d) => d.estadoActividad === "realizada")
            .reduce((a, b) => a + (b.porcentajeAsistencia || 0), 0) /
          totalHist;

    const impactoTotal = dataHistorico.reduce(
      (acc, d) => acc + (d.asistentesIds?.length || 0),
      0
    );

    const comunidadesUnicas = new Set(
      dataHistorico.map((d) => d.comunidadNombre)
    ).size;

    // Score
    const score =
      promedioHist * 0.4 +
      (enviados / (totalActividades || 1)) * 100 * 0.3 +
      (impactoTotal > 0 ? 20 : 0);

    // Tendencia
    const porSemana = Object.values(
      dataHistorico.reduce((acc: any, item: any) => {
        if (!acc[item.semanaId]) {
          acc[item.semanaId] = { semanaId: item.semanaId, total: 0, asistencia: 0 };
        }
        acc[item.semanaId].total += 1;
        acc[item.semanaId].asistencia += item.porcentajeAsistencia || 0;
        return acc;
      }, {})
    )
      .map((s: any) => ({
        semanaId: s.semanaId,
        promedio: parseFloat((s.asistencia / s.total).toFixed(1)),
      }))
      .sort((a, b) => a.semanaId.localeCompare(b.semanaId))
      .slice(-6); // Últimas 6 semanas

    const tendencia =
      porSemana.length >= 2
        ? porSemana[porSemana.length - 1].promedio -
          porSemana[porSemana.length - 2].promedio
        : 0;

    return {
      semana: {
        total: totalActividades,
        enviados,
        promedio: promediaSemana,
        asistentes: asistentesTotal,
      },
      historico: {
        total: totalHist,
        promedio: promedioHist,
        impacto: impactoTotal,
        comunidades: comunidadesUnicas,
        score,
      },
      tendencia: {
        datos: porSemana,
        direccion: tendencia,
      },
    };
  }, [dataSemana, dataHistorico, semanas]);
}

// ============ HOOK: Estadísticas por comunidad ============
function useEstadisticasComunidades(
  dataHistorico: Registro[],
  comunidades: any[]
) {
  return useMemo(async () => {
    const stats: ComunidadStats[] = [];

    for (const comunidad of comunidades) {
      const registrosComunidad = dataHistorico.filter(
        (d) => d.comunidadId === comunidad.id || d.comunidadNombre === comunidad.nombre
      );

      const participantesSnap = await getDocs(
        query(
          collection(db, "participantes"),
          where("comunidadId", "==", comunidad.id),
          where("estado", "==", "activo")
        )
      );

      const actividades = registrosComunidad.filter(
        (d) => d.estadoActividad === "realizada"
      ).length;
      const asistencia =
        actividades === 0
          ? 0
          : Math.round(
              registrosComunidad
                .filter((d) => d.estadoActividad === "realizada")
                .reduce((a, b) => a + (b.porcentajeAsistencia || 0), 0) /
                actividades
            );

      const ultimaVisita =
        registrosComunidad.length > 0
          ? registrosComunidad.sort((a, b) =>
              new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
            )[0].fecha
          : "Sin visitas";

      const diasDesdeUltimaVisita =
        ultimaVisita === "Sin visitas"
          ? 999
          : Math.floor(
              (new Date().getTime() - new Date(ultimaVisita).getTime()) /
                (1000 * 60 * 60 * 24)
            );

      stats.push({
        id: comunidad.id,
        nombre: comunidad.nombre,
        participantes: participantesSnap.size,
        actividades,
        asistencia,
        ultimaVisita,
        diasDesdeUltimaVisita,
        enRiesgo: diasDesdeUltimaVisita >= 21,
      });
    }

    return stats.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [dataHistorico, comunidades]);
}

// ============ COMPONENTE: KPI Card ============
interface KPICardProps {
  titulo: string;
  valor: string | number;
  icono: string;
  gradient: string;
  subtitulo?: string;
  tendencia?: number;
}

function KPICard({
  titulo,
  valor,
  icono,
  gradient,
  subtitulo,
  tendencia,
}: KPICardProps) {
  return (
    <div
      className={`rounded-xl p-6 text-white shadow-lg bg-gradient-to-br ${gradient} space-y-2 hover:shadow-2xl transition`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-sm opacity-90 font-semibold">{titulo}</p>
          <h3 className="text-3xl font-bold">{valor}</h3>
          {subtitulo && (
            <p className="text-xs opacity-75 mt-1">{subtitulo}</p>
          )}
        </div>
        <span className="text-4xl">{icono}</span>
      </div>
      {tendencia !== undefined && (
        <div className="text-sm font-semibold pt-2 border-t border-white/30">
          {tendencia > 0 ? "📈" : tendencia < 0 ? "📉" : "➖"} {Math.abs(tendencia).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE: Alerta Comunidad ============
interface AlertaComunidadProps {
  alerta: AlertaComunidad;
}

function AlertaComunidadComp({ alerta }: AlertaComunidadProps) {
  return (
    <div
      className={`p-4 rounded-lg border-l-4 space-y-2 ${
        alerta.severidad === "alto"
          ? "bg-red-50 border-red-500"
          : alerta.severidad === "medio"
          ? "bg-yellow-50 border-yellow-500"
          : "bg-blue-50 border-blue-500"
      }`}
    >
      <div className="flex justify-between items-start">
        <h4 className="font-bold text-gray-900">{alerta.nombre}</h4>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            alerta.severidad === "alto"
              ? "bg-red-200 text-red-800"
              : alerta.severidad === "medio"
              ? "bg-yellow-200 text-yellow-800"
              : "bg-blue-200 text-blue-800"
          }`}
        >
          {alerta.diasSinVisita} días
        </span>
      </div>
      <p className="text-sm text-gray-600">
        Última visita: {alerta.ultimaVisita || "Sin registros"}
      </p>
    </div>
  );
}

// ============ COMPONENTE: Tabla Comunidades ============
interface TablaComunidadesProps {
  comunidades: ComunidadStats[];
}

function TablaComunidades({ comunidades }: TablaComunidadesProps) {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <tr>
            <th className="px-6 py-4 text-left font-semibold">Comunidad</th>
            <th className="px-6 py-4 text-center font-semibold">Participantes</th>
            <th className="px-6 py-4 text-center font-semibold">Actividades</th>
            <th className="px-6 py-4 text-center font-semibold">Asistencia</th>
            <th className="px-6 py-4 text-center font-semibold">Última Visita</th>
            <th className="px-6 py-4 text-center font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {comunidades.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 font-semibold text-gray-900">
                {c.nombre}
              </td>
              <td className="px-6 py-4 text-center">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                  {c.participantes}
                </span>
              </td>
              <td className="px-6 py-4 text-center font-semibold">
                {c.actividades}
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    c.asistencia >= 80
                      ? "bg-green-100 text-green-800"
                      : c.asistencia >= 60
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {c.asistencia}%
                </span>
              </td>
              <td className="px-6 py-4 text-center text-sm text-gray-600">
                {c.ultimaVisita === "Sin visitas"
                  ? "Sin visitas"
                  : `${c.diasDesdeUltimaVisita}d atrás`}
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    c.enRiesgo
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {c.enRiesgo ? "⚠️ En Riesgo" : "✅ Activa"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function DashboardTecnico() {
  const { user } = useAuth();
  const {
    dataSemana,
    dataHistorico,
    semanaActiva,
    comunidades,
    loading,
    error,
  } = useCargarDashboard(user?.uid);

  const estadisticas = useEstadisticas(dataSemana, dataHistorico, new Map());
  const [comunidadesStats, setComunidadesStats] = useState<ComunidadStats[]>([]);
  const [loading2, setLoading2] = useState(true);

  useEffect(() => {
    cargarComunidadesStats();
  }, [dataHistorico, comunidades]);

  const cargarComunidadesStats = async () => {
    try {
      setLoading2(true);
      const stats: ComunidadStats[] = [];

      for (const comunidad of comunidades) {
        const registrosComunidad = dataHistorico.filter(
          (d) =>
            d.comunidadId === comunidad.id || d.comunidadNombre === comunidad.nombre
        );

        const participantesSnap = await getDocs(
          query(
            collection(db, "participantes"),
            where("comunidadId", "==", comunidad.id),
            where("estado", "==", "activo")
          )
        );

        const actividades = registrosComunidad.filter(
          (d) => d.estadoActividad === "realizada"
        ).length;
        const asistencia =
          actividades === 0
            ? 0
            : Math.round(
                registrosComunidad
                  .filter((d) => d.estadoActividad === "realizada")
                  .reduce((a, b) => a + (b.porcentajeAsistencia || 0), 0) /
                  actividades
              );

        const ultimaVisita =
          registrosComunidad.length > 0
            ? registrosComunidad.sort((a, b) =>
                new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
              )[0].fecha
            : "Sin visitas";

        const diasDesdeUltimaVisita =
          ultimaVisita === "Sin visitas"
            ? 999
            : Math.floor(
                (new Date().getTime() - new Date(ultimaVisita).getTime()) /
                  (1000 * 60 * 60 * 24)
              );

        stats.push({
          id: comunidad.id,
          nombre: comunidad.nombre,
          participantes: participantesSnap.size,
          actividades,
          asistencia,
          ultimaVisita,
          diasDesdeUltimaVisita,
          enRiesgo: diasDesdeUltimaVisita >= 21,
        });
      }

      setComunidadesStats(stats.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading2(false);
    }
  };

  // Alertas
  const alertas: AlertaComunidad[] = comunidadesStats
    .filter((c) => c.diasDesdeUltimaVisita >= 14)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      diasSinVisita: c.diasDesdeUltimaVisita,
      ultimaVisita: c.ultimaVisita,
      severidad:
        c.diasDesdeUltimaVisita >= 21
          ? "alto"
          : c.diasDesdeUltimaVisita >= 14
          ? "medio"
          : "bajo",
    }));

  // Gráfico por comunidad
  const graficoComunidades = comunidadesStats.map((c) => ({
    name: c.nombre.substring(0, 10),
    asistencia: c.asistencia,
    actividades: c.actividades,
  }));

  // Pie chart
  const pieData = [
    { name: "En Riesgo", value: comunidadesStats.filter((c) => c.enRiesgo).length },
    {
      name: "Activas",
      value: comunidadesStats.filter((c) => !c.enRiesgo).length,
    },
  ];

  const COLORS = ["#EF4444", "#10B981"];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 font-semibold">❌ {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Encabezado */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-slate-900">
          📊 Dashboard Técnico SIGEV
        </h1>
        {semanaActiva && (
          <p className="text-gray-600">
            Semana: <span className="font-semibold">{semanaActiva.fechaInicio}</span> al{" "}
            <span className="font-semibold">{semanaActiva.fechaFin}</span>
          </p>
        )}
      </div>

      {/* KPIs Semana Actual */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">📅 Esta Semana</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            titulo="Actividades"
            valor={estadisticas.semana.total}
            icono="📋"
            gradient="from-blue-500 to-blue-600"
          />
          <KPICard
            titulo="Enviados"
            valor={estadisticas.semana.enviados}
            icono="✅"
            gradient="from-green-500 to-green-600"
            subtitulo={`${Math.round(
              (estadisticas.semana.enviados / (estadisticas.semana.total || 1)) * 100
            )}% completado`}
          />
          <KPICard
            titulo="Asistencia Promedio"
            valor={`${estadisticas.semana.promedio.toFixed(1)}%`}
            icono="📊"
            gradient="from-yellow-500 to-orange-600"
          />
          <KPICard
            titulo="Participantes"
            valor={estadisticas.semana.asistentes}
            icono="👥"
            gradient="from-cyan-500 to-blue-600"
          />
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">⚠️ Alertas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alertas.map((alerta) => (
              <AlertaComunidadComp key={alerta.id} alerta={alerta} />
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tendencia */}
        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">📈 Tendencia de Asistencia</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={estadisticas.tendencia.datos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="semanaId" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#FFF",
                }}
              />
              <Line
                type="monotone"
                dataKey="promedio"
                stroke="#7C3AED"
                strokeWidth={3}
                dot={{ fill: "#7C3AED", r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="text-center font-semibold text-sm">
            Tendencia:{" "}
            {estadisticas.tendencia.direccion > 0
              ? "🔼 Mejorando"
              : estadisticas.tendencia.direccion < 0
              ? "🔽 Bajando"
              : "➖ Estable"}
          </div>
        </div>

        {/* Estado Comunidades */}
        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">🏘️ Estado de Comunidades</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico por Comunidad */}
      <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-900">📊 Asistencia por Comunidad</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={graficoComunidades}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1F2937",
                border: "none",
                borderRadius: "8px",
                color: "#FFF",
              }}
            />
            <Legend />
            <Bar dataKey="asistencia" fill="#10B981" name="% Asistencia" radius={[8, 8, 0, 0]} />
            <Bar dataKey="actividades" fill="#3B82F6" name="Actividades" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* KPIs Histórico */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">📚 Histórico General</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            titulo="Total Actividades"
            valor={estadisticas.historico.total}
            icono="📋"
            gradient="from-purple-500 to-purple-600"
          />
          <KPICard
            titulo="Promedio General"
            valor={`${estadisticas.historico.promedio.toFixed(1)}%`}
            icono="📈"
            gradient="from-pink-500 to-rose-600"
          />
          <KPICard
            titulo="Impacto Total"
            valor={estadisticas.historico.impacto}
            icono="🌍"
            gradient="from-teal-500 to-emerald-600"
          />
          <KPICard
            titulo="Comunidades"
            valor={estadisticas.historico.comunidades}
            icono="🏘️"
            gradient="from-amber-500 to-orange-600"
          />
          <KPICard
            titulo="Score de Desempeño"
            valor={`${estadisticas.historico.score.toFixed(0)}%`}
            icono="🏆"
            gradient="from-indigo-600 to-purple-700"
          />
        </div>
      </div>

      {/* Tabla Comunidades */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">
          📍 Detalle de Comunidades
        </h2>
        {loading2 ? (
          <div className="text-center py-8">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p className="text-gray-600">Cargando estadísticas...</p>
          </div>
        ) : (
          <TablaComunidades comunidades={comunidadesStats} />
        )}
      </div>
    </div>
  );
}