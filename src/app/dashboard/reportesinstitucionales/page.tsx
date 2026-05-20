"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ================== TIPOS ==================
interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: "tecnico" | "admin";
  [key: string]: any;
}

interface Comunidad {
  id: string;
  nombre: string;
  tecnicoId?: string;
  [key: string]: any;
}

interface Participante {
  id: string;
  nombres: string;
  apellidos: string;
  edad: number;
  genero: "M" | "F" | "Otro";
  comunidadId: string;
  tecnicoId?: string;
  estado: "activo" | "inactivo" | "eliminado";
  fechaRegistro: string;
  [key: string]: any;
}

interface Semana {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
  [key: string]: any;
}

interface Planificacion {
  id: string;
  tecnicoId: string;
  semanaId: string;
  actividades: ActividadPlanificada[];
  estado: string;
  [key: string]: any;
}

interface ActividadPlanificada {
  comunidadId: string;
  comunidadNombre: string;
  componente: string;
  actividad: string;
  dia: string;
  fecha: string;
  horario: string;
  objetivoEspecifico: string;
  productoEsperado: string;
}

interface Seguimiento {
  id: string;
  tecnicoId: string;
  semanaId: string;
  actividadesRegulares?: any[];
  reuniones?: any[];
  encuentros?: any[];
  estado: string;
  [key: string]: any;
}

interface ComparativaTecnico {
  tecnico: string;
  tecnicoId: string;
  comunidades: number;
  participantes: number;
  actividades: number;
  cumplimiento: number;
  asistencia: number;
}

interface ComparativaComunidad {
  comunidadId: string;
  comunidad: string;
  tecnico: string;
  participantes: number;
  asistencia: number;
  actividades: number;
}

interface Meta {
  tecnico: string;
  tecnicoId: string;
  meta: number;
  actual: number;
  porcentaje: number;
}

interface Alerta {
  tipo: "tecnico" | "comunidad" | "participante";
  titulo: string;
  descripcion: string;
  severidad: "alto" | "medio" | "bajo";
  recomendacion: string;
}

interface AgendaSemanal {
  tecnico: Usuario;
  actividades: ActividadPlanificada[];
}

interface FormParticipante {
  nombres: string;
  apellidos: string;
  edad: number | "";
  genero: "M" | "F" | "Otro";
  comunidadId: string;
  tecnicoId: string;
  estado: "activo" | "inactivo";
}

// ================== UTILIDADES ==================
function obtenerComunidadesDelTecnico(
  tecnicoId: string,
  comunidades: Comunidad[]
): Comunidad[] {
  return comunidades.filter((c) => c.tecnicoId === tecnicoId);
}

function obtenerIdsComunidadesDelTecnico(
  tecnicoId: string,
  comunidades: Comunidad[]
): string[] {
  return obtenerComunidadesDelTecnico(tecnicoId, comunidades).map((c) => c.id);
}

function getBadgeColor(valor: number) {
  if (valor >= 90) return "bg-green-600";
  if (valor >= 70) return "bg-yellow-500";
  return "bg-red-600";
}

// ================== HOOK DATOS ==================
function useDatosReportes() {
  const [data, setData] = useState({
    usuarios: [] as Usuario[],
    comunidades: [] as Comunidad[],
    semanas: [] as Semana[],
    seguimientos: [] as Seguimiento[],
    planificaciones: [] as Planificacion[],
    participantes: [] as Participante[],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [usuariosSnap, semanasSnap, segSnap, planSnap, partSnap] =
        await Promise.all([
          getDocs(collection(db, "usuarios")),
          getDocs(collection(db, "semanas")),
          getDocs(collection(db, "seguimientos")),
          getDocs(collection(db, "planificaciones")),
          getDocs(collection(db, "participantes")),
        ]);

      const usuariosMap = new Map<string, Usuario>();
      const comunidadesMap = new Map<string, Comunidad>();

      usuariosSnap.docs.forEach((d) => {
        usuariosMap.set(d.id, { id: d.id, ...d.data() } as Usuario);
      });

      for (const usuario of usuariosMap.values()) {
        if (usuario.rol === "tecnico" || usuario.rol === "admin") {
          const coms = await getComunidadesByTecnico(usuario.id);
          coms.forEach((c) => {
            comunidadesMap.set(c.id, { ...c, tecnicoId: usuario.id });
          });
        }
      }

      setData({
        usuarios: Array.from(usuariosMap.values()),
        comunidades: Array.from(comunidadesMap.values()),
        semanas: semanasSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Semana)),
        seguimientos: segSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Seguimiento)),
        planificaciones: planSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Planificacion)),
        participantes: partSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Participante)),
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  return { ...data, loading, error, recargar: cargarDatos };
}

// ================== UI ==================
function KPICard({
  titulo,
  valor,
  icono,
  color,
}: {
  titulo: string;
  valor: number | string;
  icono: string;
  color: string;
}) {
  return (
    <div className={`${color} rounded-2xl p-5 text-white shadow-sm`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm opacity-90 font-medium">{titulo}</p>
          <h3 className="text-3xl font-bold mt-2">{valor}</h3>
        </div>
        <span className="text-3xl">{icono}</span>
      </div>
    </div>
  );
}

function Panel({
  titulo,
  subtitle,
  children,
}: {
  titulo: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{titulo}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ================== TABLAS ==================
function TablaComparativaTecnicos({
  tecnicos,
}: {
  tecnicos: ComparativaTecnico[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-6 py-3 text-left font-bold text-slate-800 text-sm">Técnico</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Comunidades Actuales</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Participantes Actuales</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Actividades Históricas</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Cumplimiento Histórico</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Asistencia Histórica</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {tecnicos.map((tecnico) => (
            <tr key={tecnico.tecnicoId} className="hover:bg-slate-50 transition">
              <td className="px-6 py-4 font-semibold text-slate-900">{tecnico.tecnico}</td>
              <td className="px-6 py-4 text-center">{tecnico.comunidades}</td>
              <td className="px-6 py-4 text-center">{tecnico.participantes}</td>
              <td className="px-6 py-4 text-center">{tecnico.actividades}</td>
              <td className="px-6 py-4 text-center">
                <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getBadgeColor(tecnico.cumplimiento)}`}>
                  {tecnico.cumplimiento}%
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getBadgeColor(tecnico.asistencia)}`}>
                  {tecnico.asistencia.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaComparativaComunidades({
  comunidades,
}: {
  comunidades: ComparativaComunidad[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-6 py-3 text-left font-bold text-slate-800 text-sm">Comunidad</th>
            <th className="px-6 py-3 text-left font-bold text-slate-800 text-sm">Técnico Actual</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Participantes</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Asistencia</th>
            <th className="px-6 py-3 text-center font-bold text-slate-800 text-sm">Actividades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {comunidades.map((comunidad) => (
            <tr key={comunidad.comunidadId} className="hover:bg-slate-50 transition">
              <td className="px-6 py-4 font-semibold text-slate-900">{comunidad.comunidad}</td>
              <td className="px-6 py-4 text-slate-700">{comunidad.tecnico}</td>
              <td className="px-6 py-4 text-center">{comunidad.participantes}</td>
              <td className="px-6 py-4 text-center">
                <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getBadgeColor(comunidad.asistencia)}`}>
                  {comunidad.asistencia.toFixed(1)}%
                </span>
              </td>
              <td className="px-6 py-4 text-center">{comunidad.actividades}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaMetas({ metas }: { metas: Meta[] }) {
  return (
    <div className="space-y-4">
      {metas.map((meta) => (
        <div key={meta.tecnicoId} className="border border-slate-200 rounded-xl p-4">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-slate-900">{meta.tecnico}</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getBadgeColor(meta.porcentaje)}`}>
              {meta.porcentaje}%
            </span>
          </div>
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <p>Meta: {meta.meta}</p>
            <p>Actual: {meta.actual}</p>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${getBadgeColor(meta.porcentaje)}`}
              style={{ width: `${Math.min(meta.porcentaje, 100)}%` }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TablaAlertas({
  alertas,
  filtroTecnico,
  filtroEntidad,
  usuarios,
  comunidades,
}: {
  alertas: Alerta[];
  filtroTecnico: string;
  filtroEntidad: string;
  usuarios: Usuario[];
  comunidades: Comunidad[];
}) {
  const alertasFiltradas = useMemo(() => {
    let resultado = [...alertas];

    if (filtroTecnico !== "todos") {
      const tecnico = usuarios.find((u) => u.id === filtroTecnico);
      if (tecnico) {
        resultado = resultado.filter((a) =>
          a.titulo.toLowerCase().includes(tecnico.nombre.toLowerCase())
        );
      }
    }

    if (filtroEntidad !== "todos") {
      const comunidad = comunidades.find((c) => c.id === filtroEntidad);
      if (comunidad) {
        resultado = resultado.filter((a) =>
          a.titulo.toLowerCase().includes(comunidad.nombre.toLowerCase())
        );
      }
    }

    return resultado.sort((a, b) => {
      const severidadScore = { alto: 3, medio: 2, bajo: 1 };
      return severidadScore[b.severidad] - severidadScore[a.severidad];
    });
  }, [alertas, filtroTecnico, filtroEntidad, usuarios, comunidades]);

  return (
    <div className="space-y-3">
      {alertasFiltradas.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-green-800 font-medium">
            ✅ No hay alertas. Todo está en orden.
          </p>
        </div>
      ) : (
        alertasFiltradas.map((alerta, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-xl border-l-4 ${
              alerta.severidad === "alto"
                ? "bg-red-50 border-red-500"
                : alerta.severidad === "medio"
                ? "bg-yellow-50 border-yellow-500"
                : "bg-blue-50 border-blue-500"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-slate-900">{alerta.titulo}</h3>
              <span
                className={`px-2 py-1 rounded text-xs font-bold text-white ${
                  alerta.severidad === "alto"
                    ? "bg-red-600"
                    : alerta.severidad === "medio"
                    ? "bg-yellow-600"
                    : "bg-blue-600"
                }`}
              >
                {alerta.severidad.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-slate-700 mb-2">{alerta.descripcion}</p>
            <p className="text-sm font-semibold text-slate-600">
              💡 {alerta.recomendacion}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

// ================== EXPORTACIONES ==================
function GeneradorPDFs({
  comparativasTecnicos,
  comunidades,
  participantes,
}: {
  comparativasTecnicos: ComparativaTecnico[];
  comunidades: Comunidad[];
  participantes: Participante[];
}) {
  const [generando, setGenerando] = useState(false);

  const generarPDFDistribucionComunidades = async () => {
    try {
      setGenerando(true);

      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.text("DISTRIBUCIÓN DE COMUNIDADES POR TÉCNICO", 14, 18);

      const body = comunidades.map((com) => [
        com.nombre,
        String(
          participantes.filter(
            (p) => p.comunidadId === com.id && p.estado === "activo"
          ).length
        ),
      ]);

      autoTable(doc, {
        startY: 28,
        head: [["Comunidad", "Participantes Activos"]],
        body,
      });

      doc.save("Distribucion_Comunidades_Tecnicos.pdf");
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFInformeMensual = async () => {
    try {
      setGenerando(true);

      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.text("INFORME MENSUAL", 14, 18);

      autoTable(doc, {
        startY: 28,
        head: [[
          "Técnico",
          "Comunidades Actuales",
          "Participantes Actuales",
          "Actividades Históricas",
          "Cumplimiento Histórico",
          "Asistencia Histórica",
        ]],
        body: comparativasTecnicos.map((t) => [
          t.tecnico,
          String(t.comunidades),
          String(t.participantes),
          String(t.actividades),
          `${t.cumplimiento}%`,
          `${t.asistencia.toFixed(1)}%`,
        ]),
      });

      doc.save("Informe_Mensual.pdf");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Panel
      titulo="📄 Exportaciones"
      subtitle="Genera documentos institucionales para análisis y presentación."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={generarPDFDistribucionComunidades}
          disabled={generando}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
        >
          {generando ? "⏳" : "📥"} Distribución Comunidades
        </button>

        <button
          onClick={generarPDFInformeMensual}
          disabled={generando}
          className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
        >
          {generando ? "⏳" : "📊"} Informe Mensual
        </button>
      </div>
    </Panel>
  );
}

// ================== COMPONENTE PRINCIPAL ==================
export default function ReportesInstitucionalesPage() {
  const datos = useDatosReportes();
  const [tabActivo, setTabActivo] = useState<
    "resumen" | "comparativas" | "tecnicos" | "comunidades" | "metas" | "alertas" | "exportaciones"
  >("resumen");
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [filtroEntidad, setFiltroEntidad] = useState("todos");
  const [semanaActiva, setSemanaActiva] = useState<Semana | null>(null);

  useEffect(() => {
    const cargarSemana = async () => {
      const semana = await getSemanaActiva();
      setSemanaActiva(semana || null);
    };
    cargarSemana();
  }, []);

  // ========= COMPARATIVAS TÉCNICOS =========
  const comparativasTecnicos = useMemo(() => {
    const tecnicos = datos.usuarios.filter(
      (u) => u.rol === "tecnico" || u.rol === "admin"
    );

    return tecnicos.map((tecnico) => {
      const comunidadesIds = obtenerIdsComunidadesDelTecnico(tecnico.id, datos.comunidades);

      const participantesActuales = datos.participantes.filter(
        (p) =>
          p.estado === "activo" &&
          comunidadesIds.includes(p.comunidadId)
      ).length;

      const actividadesHistoricas = datos.seguimientos
        .filter((s) => s.tecnicoId === tecnico.id)
        .flatMap((s) => s.actividadesRegulares || [])
        .filter((a: any) => a.estadoActividad === "realizada").length;

      const registrosHistoricos = datos.seguimientos
        .filter((s) => s.tecnicoId === tecnico.id)
        .flatMap((s) => s.actividadesRegulares || [])
        .filter((a: any) => a.estadoActividad === "realizada");

      const asistenciaHistorica =
        registrosHistoricos.length > 0
          ? registrosHistoricos.reduce(
              (sum: number, a: any) => sum + (a.porcentajeAsistencia || 0),
              0
            ) / registrosHistoricos.length
          : 0;

      const planificacionesEnviadas = datos.planificaciones.filter(
        (p) => p.tecnicoId === tecnico.id && p.estado === "enviado"
      ).length;

      const seguimientosEnviados = datos.seguimientos.filter(
        (s) => s.tecnicoId === tecnico.id && s.estado === "enviado"
      ).length;

      const cumplimiento =
        planificacionesEnviadas > 0 && seguimientosEnviados > 0
          ? 100
          : planificacionesEnviadas > 0 || seguimientosEnviados > 0
          ? 50
          : 0;

      return {
        tecnico: tecnico.nombre,
        tecnicoId: tecnico.id,
        comunidades: comunidadesIds.length,
        participantes: participantesActuales,
        actividades: actividadesHistoricas,
        cumplimiento,
        asistencia: asistenciaHistorica,
      };
    });
  }, [
    datos.usuarios,
    datos.comunidades,
    datos.participantes,
    datos.seguimientos,
    datos.planificaciones,
  ]);

  // ========= COMPARATIVAS COMUNIDADES =========
  const comparativasComunidades = useMemo(() => {
    return datos.comunidades.map((comunidad) => {
      const tecnico = datos.usuarios.find((u) => u.id === comunidad.tecnicoId);

      const participantes = datos.participantes.filter(
        (p) => p.comunidadId === comunidad.id && p.estado === "activo"
      ).length;

      const registrosComunidad = datos.seguimientos
        .flatMap((s) => s.actividadesRegulares || [])
        .filter(
          (r: any) =>
            r.comunidadId === comunidad.id &&
            r.estadoActividad === "realizada"
        );

      const asistenciaPromedio =
        registrosComunidad.length > 0
          ? registrosComunidad.reduce(
              (sum: number, r: any) => sum + (r.porcentajeAsistencia || 0),
              0
            ) / registrosComunidad.length
          : 0;

      return {
        comunidadId: comunidad.id,
        comunidad: comunidad.nombre,
        tecnico: tecnico?.nombre || "No asignado",
        participantes,
        asistencia: asistenciaPromedio,
        actividades: registrosComunidad.length,
      };
    });
  }, [datos.comunidades, datos.usuarios, datos.seguimientos, datos.participantes]);

  // ========= METAS =========
  const metas = useMemo(() => {
    const tecnicos = datos.usuarios.filter(
      (u) => u.rol === "tecnico" || u.rol === "admin"
    );

    return tecnicos.map((tecnico) => {
      const comunidadesIds = obtenerIdsComunidadesDelTecnico(
        tecnico.id,
        datos.comunidades
      );

      const participantesActuales = datos.participantes.filter(
        (p) =>
          p.estado === "activo" &&
          comunidadesIds.includes(p.comunidadId)
      ).length;

      const metaTecnico = 85;
      const porcentaje = Math.round((participantesActuales / metaTecnico) * 100);

      return {
        tecnico: tecnico.nombre,
        tecnicoId: tecnico.id,
        meta: metaTecnico,
        actual: participantesActuales,
        porcentaje: Math.min(porcentaje, 100),
      };
    });
  }, [datos.usuarios, datos.comunidades, datos.participantes]);

  // ========= ALERTAS =========
  const alertas = useMemo(() => {
    const salida: Alerta[] = [];

    comparativasTecnicos.forEach((t) => {
      if (t.cumplimiento < 70) {
        salida.push({
          tipo: "tecnico",
          titulo: `${t.tecnico} - Bajo cumplimiento`,
          descripcion: `El técnico registra ${t.cumplimiento}% de cumplimiento histórico.`,
          severidad: t.cumplimiento < 50 ? "alto" : "medio",
          recomendacion: "Revisar planificación y seguimiento entregados.",
        });
      }
    });

    comparativasComunidades.forEach((c) => {
      if (c.asistencia < 70) {
        salida.push({
          tipo: "comunidad",
          titulo: `${c.comunidad} - Baja asistencia`,
          descripcion: `Asistencia promedio actual: ${c.asistencia.toFixed(1)}%.`,
          severidad: c.asistencia < 50 ? "alto" : "medio",
          recomendacion: "Aplicar acciones de reenganche comunitario.",
        });
      }
    });

    metas.forEach((m) => {
      if (m.porcentaje < 70) {
        salida.push({
          tipo: "tecnico",
          titulo: `${m.tecnico} - Meta de participantes`,
          descripcion: `Registra ${m.actual}/${m.meta} participantes activos.`,
          severidad: m.porcentaje < 50 ? "alto" : "medio",
          recomendacion: "Fortalecer permanencia y captación en sus comunidades actuales.",
        });
      }
    });

    return salida;
  }, [comparativasTecnicos, comparativasComunidades, metas]);

  // ========= KPIS =========
  const estadisticas = useMemo(() => {
    const registros = datos.seguimientos
      .flatMap((s) => s.actividadesRegulares || [])
      .filter((r: any) => r.estadoActividad === "realizada");

    const asistenciaGlobal =
      registros.length > 0
        ? Math.round(
            registros.reduce(
              (sum: number, r: any) => sum + (r.porcentajeAsistencia || 0),
              0
            ) / registros.length
          )
        : 0;

    return {
      actividades: registros.length,
      asistencia: asistenciaGlobal,
      participantes: datos.participantes.filter((p) => p.estado === "activo").length,
      tecnicos: datos.usuarios.filter((u) => u.rol === "tecnico" || u.rol === "admin").length,
    };
  }, [datos]);

  const tecnicosYAdmins = datos.usuarios.filter(
    (u) => u.rol === "tecnico" || u.rol === "admin"
  );

  const comparativasTecnicosFiltradas = comparativasTecnicos.filter((t) =>
    filtroTecnico === "todos" ? true : t.tecnicoId === filtroTecnico
  );

  const comparativasComunidadesFiltradas = comparativasComunidades.filter((c) => {
    const filtroTecnicoOk =
      filtroTecnico === "todos"
        ? true
        : datos.usuarios.find((u) => u.id === filtroTecnico)?.nombre === c.tecnico;

    const filtroComunidadOk =
      filtroEntidad === "todos" ? true : c.comunidadId === filtroEntidad;

    return filtroTecnicoOk && filtroComunidadOk;
  });

  if (datos.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-slate-600 font-medium">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  if (datos.error) {
    return (
      <div className="p-6 bg-slate-50 min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800 font-semibold">Error: {datos.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Encabezado */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">
              📊 Reportes Institucionales
            </h1>
            <p className="text-slate-600 mt-2">
              Vista institucional consolidada por asignación actual e histórico operativo.
            </p>
            {semanaActiva && (
              <p className="text-sm text-slate-500 mt-2">
                Semana activa: {semanaActiva.fechaInicio} al {semanaActiva.fechaFin}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "resumen", label: "📈 Resumen" },
              { id: "comparativas", label: "🔄 Comparativas" },
              { id: "tecnicos", label: "👨‍💼 Técnicos" },
              { id: "comunidades", label: "🏘️ Comunidades" },
              { id: "metas", label: "🎯 Metas" },
              { id: "alertas", label: "⚠️ Alertas" },
              { id: "exportaciones", label: "📄 Exportaciones" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() =>
                  setTabActivo(
                    tab.id as
                      | "resumen"
                      | "comparativas"
                      | "tecnicos"
                      | "comunidades"
                      | "metas"
                      | "alertas"
                      | "exportaciones"
                  )
                }
                className={`px-4 py-2 rounded-xl font-semibold transition ${
                  tabActivo === tab.id
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPICard
            titulo="Técnicos"
            valor={estadisticas.tecnicos}
            icono="👨‍💼"
            color="bg-blue-600"
          />
          <KPICard
            titulo="Actividades Históricas"
            valor={estadisticas.actividades}
            icono="📋"
            color="bg-green-600"
          />
          <KPICard
            titulo="Participantes Activos"
            valor={estadisticas.participantes}
            icono="👥"
            color="bg-purple-600"
          />
          <KPICard
            titulo="Asistencia Promedio"
            valor={`${estadisticas.asistencia}%`}
            icono="📊"
            color="bg-orange-600"
          />
        </div>

        {/* Filtros generales */}
        {(tabActivo === "tecnicos" || tabActivo === "comunidades" || tabActivo === "alertas") && (
          <Panel
            titulo="Filtros"
            subtitle="Aplica filtros para enfocar el análisis."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Técnico
                </label>
                <select
                  value={filtroTecnico}
                  onChange={(e) => setFiltroTecnico(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="todos">Todos</option>
                  {tecnicosYAdmins.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Comunidad
                </label>
                <select
                  value={filtroEntidad}
                  onChange={(e) => setFiltroEntidad(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="todos">Todas</option>
                  {datos.comunidades.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>
        )}

        {/* TAB RESUMEN */}
        {tabActivo === "resumen" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel
              titulo="Top Técnicos"
              subtitle="Participantes actuales y desempeño histórico."
            >
              <div className="space-y-4">
                {comparativasTecnicos
                  .slice()
                  .sort((a, b) => b.participantes - a.participantes)
                  .slice(0, 5)
                  .map((t) => (
                    <div key={t.tecnicoId} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-900">{t.tecnico}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getBadgeColor(t.cumplimiento)}`}>
                          {t.cumplimiento}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">Comunidades</p>
                          <p className="font-bold">{t.comunidades}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Participantes</p>
                          <p className="font-bold">{t.participantes}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Actividades</p>
                          <p className="font-bold">{t.actividades}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Asistencia</p>
                          <p className="font-bold">{t.asistencia.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>

            <Panel
              titulo="Alertas Relevantes"
              subtitle="Alertas prioritarias del sistema."
            >
              <TablaAlertas
                alertas={alertas.slice(0, 6)}
                filtroTecnico="todos"
                filtroEntidad="todos"
                usuarios={datos.usuarios}
                comunidades={datos.comunidades}
              />
            </Panel>
          </div>
        )}

        {/* TAB COMPARATIVAS */}
        {tabActivo === "comparativas" && (
          <div className="space-y-6">
            <Panel
              titulo="Comparativa entre Técnicos"
              subtitle="Basada en comunidades actuales y producción histórica."
            >
              <TablaComparativaTecnicos tecnicos={comparativasTecnicos} />
            </Panel>

            <Panel
              titulo="Comparativa entre Comunidades"
              subtitle="Basada en participantes activos y actividades históricas por comunidad."
            >
              <TablaComparativaComunidades comunidades={comparativasComunidades} />
            </Panel>
          </div>
        )}

        {/* TAB TÉCNICOS */}
        {tabActivo === "tecnicos" && (
          <Panel
            titulo="Detalle por Técnico"
            subtitle="Visualiza comunidades actuales, participantes y rendimiento histórico."
          >
            <div className="space-y-6">
              {comparativasTecnicosFiltradas.map((t) => (
                <div key={t.tecnicoId} className="border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900">{t.tecnico}</h3>
                    <span className={`px-4 py-2 rounded-full text-xs font-bold text-white ${getBadgeColor(t.cumplimiento)}`}>
                      {t.cumplimiento}% cumplimiento
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-blue-700">Comunidades</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">{t.comunidades}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-purple-700">Participantes</p>
                      <p className="text-2xl font-bold text-purple-900 mt-1">{t.participantes}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-green-700">Actividades</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">{t.actividades}</p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-orange-700">Asistencia</p>
                      <p className="text-2xl font-bold text-orange-900 mt-1">{t.asistencia.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* TAB COMUNIDADES */}
        {tabActivo === "comunidades" && (
          <Panel
            titulo="Detalle por Comunidad"
            subtitle="Análisis actual por comunidad y técnico responsable."
          >
            <div className="space-y-6">
              {comparativasComunidadesFiltradas.map((c) => (
                <div key={c.comunidadId} className="border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{c.comunidad}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Técnico actual: <span className="font-semibold">{c.tecnico}</span>
                      </p>
                    </div>
                    <span className={`px-4 py-2 rounded-full text-xs font-bold text-white ${getBadgeColor(c.asistencia)}`}>
                      {c.asistencia.toFixed(1)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-blue-700">Participantes</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">{c.participantes}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-green-700">Actividades</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">{c.actividades}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-xl">
                      <p className="text-xs uppercase font-bold text-purple-700">Asistencia</p>
                      <p className="text-2xl font-bold text-purple-900 mt-1">{c.asistencia.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* TAB METAS */}
        {tabActivo === "metas" && (
          <Panel
            titulo="Metas por Técnico"
            subtitle="Meta calculada con participantes activos en comunidades actualmente asignadas."
          >
            <TablaMetas metas={metas} />
          </Panel>
        )}

        {/* TAB ALERTAS */}
        {tabActivo === "alertas" && (
          <Panel
            titulo="Alertas Institucionales"
            subtitle="Filtradas por técnico y comunidad."
          >
            <TablaAlertas
              alertas={alertas}
              filtroTecnico={filtroTecnico}
              filtroEntidad={filtroEntidad}
              usuarios={datos.usuarios}
              comunidades={datos.comunidades}
            />
          </Panel>
        )}

        {/* TAB EXPORTACIONES */}
        {tabActivo === "exportaciones" && (
          <GeneradorPDFs
            comparativasTecnicos={comparativasTecnicos}
            comunidades={datos.comunidades}
            participantes={datos.participantes}
          />
        )}
      </div>
    </div>
  );
}