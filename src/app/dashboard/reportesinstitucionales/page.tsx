"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Image from "next/image";

// ============ TIPOS ============
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
  estado: "activo" | "inactivo";
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

// ============ HOOK: Cargar datos principales ============
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

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
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

      const usuariosMap = new Map();
      const comunidadesMap = new Map();

      usuariosSnap.docs.forEach((d) => {
        usuariosMap.set(d.id, { id: d.id, ...d.data() } as Usuario);
      });

      // Obtener comunidades únicas
      for (const usuario of usuariosMap.values()) {
        if (usuario.rol === "tecnico" || usuario.rol === "admin") {
          const coms = await getComunidadesByTecnico(usuario.id);
          coms.forEach((c) => {
            if (!comunidadesMap.has(c.id)) {
              comunidadesMap.set(c.id, { ...c, tecnicoId: usuario.id });
            }
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
  };

  return { ...data, loading, error, recargar: cargarDatos };
}

// ============ COMPONENTE: Card KPI ============
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
    <div className={`${color} rounded-lg p-6 text-white shadow-md`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm opacity-90 font-semibold">{titulo}</p>
          <h3 className="text-3xl font-bold mt-2">{valor}</h3>
        </div>
        <span className="text-4xl">{icono}</span>
      </div>
    </div>
  );
}

// ============ COMPONENTE: Panel ============
function Panel({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">{titulo}</h2>
      {children}
    </div>
  );
}

// ============ COMPONENTE: Tabla Comparativa Técnicos ============
interface TablaComparativaTecnicosProps {
  tecnicos: ComparativaTecnico[];
}

function TablaComparativaTecnicos({
  tecnicos,
}: TablaComparativaTecnicosProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <tr>
            <th className="px-6 py-3 text-left font-semibold">Técnico</th>
            <th className="px-6 py-3 text-center font-semibold">Comunidades</th>
            <th className="px-6 py-3 text-center font-semibold">
              Participantes
            </th>
            <th className="px-6 py-3 text-center font-semibold">Actividades</th>
            <th className="px-6 py-3 text-center font-semibold">Cumplimiento</th>
            <th className="px-6 py-3 text-center font-semibold">Asistencia</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tecnicos.map((tecnico) => (
            <tr key={tecnico.tecnicoId} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 font-semibold text-gray-900">
                {tecnico.tecnico}
              </td>
              <td className="px-6 py-4 text-center">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {tecnico.comunidades}
                </span>
              </td>
              <td className="px-6 py-4 text-center font-bold text-gray-900">
                {tecnico.participantes}
              </td>
              <td className="px-6 py-4 text-center font-bold text-gray-900">
                {tecnico.actividades}
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                    tecnico.cumplimiento >= 90
                      ? "bg-green-600"
                      : tecnico.cumplimiento >= 70
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                >
                  {tecnico.cumplimiento}%
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                    tecnico.asistencia >= 80
                      ? "bg-green-600"
                      : tecnico.asistencia >= 60
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                >
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

// ============ COMPONENTE: Tabla Comparativa Comunidades ============
interface TablaComparativaComunidadesProps {
  comunidades: ComparativaComunidad[];
}

function TablaComparativaComunidades({
  comunidades,
}: TablaComparativaComunidadesProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-green-600 to-green-700 text-white">
          <tr>
            <th className="px-6 py-3 text-left font-semibold">Comunidad</th>
            <th className="px-6 py-3 text-left font-semibold">Técnico</th>
            <th className="px-6 py-3 text-center font-semibold">
              Participantes
            </th>
            <th className="px-6 py-3 text-center font-semibold">Asistencia</th>
            <th className="px-6 py-3 text-center font-semibold">Actividades</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {comunidades.map((comunidad, idx) => (
            <tr key={idx} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 font-semibold text-gray-900">
                {comunidad.comunidad}
              </td>
              <td className="px-6 py-4 text-gray-600">{comunidad.tecnico}</td>
              <td className="px-6 py-4 text-center font-bold text-gray-900">
                {comunidad.participantes}
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                    comunidad.asistencia >= 80
                      ? "bg-green-600"
                      : comunidad.asistencia >= 60
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                >
                  {comunidad.asistencia.toFixed(1)}%
                </span>
              </td>
              <td className="px-6 py-4 text-center font-semibold text-gray-900">
                {comunidad.actividades}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ COMPONENTE: Tabla Metas ============
interface TablaMetasProps {
  metas: Meta[];
}

function TablaMetas({ metas }: TablaMetasProps) {
  return (
    <div className="space-y-4">
      {metas.map((meta) => (
        <div key={meta.tecnicoId} className="border rounded-lg p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-gray-900">{meta.tecnico}</h3>
            <span
              className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                meta.porcentaje >= 90
                  ? "bg-green-600"
                  : meta.porcentaje >= 70
                  ? "bg-yellow-600"
                  : "bg-red-600"
              }`}
            >
              {meta.porcentaje}%
            </span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <p>Meta: {meta.meta}</p>
            <p>Actual: {meta.actual}</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                meta.porcentaje >= 90
                  ? "bg-green-600"
                  : meta.porcentaje >= 70
                  ? "bg-yellow-600"
                  : "bg-red-600"
              }`}
              style={{ width: `${Math.min(meta.porcentaje, 100)}%` }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ COMPONENTE: Tabla Alertas ============
interface TablaAlertasProps {
  alertas: Alerta[];
  filtroTecnico: string;
  filtroEntidad: string;
  usuarios: Usuario[];
  comunidades: Comunidad[];
}

function TablaAlertas({
  alertas,
  filtroTecnico,
  filtroEntidad,
  usuarios,
  comunidades,
}: TablaAlertasProps) {
  const alertasFiltradas = useMemo(() => {
    let resultado = [...alertas];

    if (filtroTecnico !== "todos") {
      resultado = resultado.filter(
        (a) =>
          a.tipo === "tecnico" &&
          usuarios.find((u) => u.id === filtroTecnico)?.nombre
            ?.toLowerCase()
            .includes(a.titulo.toLowerCase())
      );
    }

    if (filtroEntidad !== "todos") {
      resultado = resultado.filter(
        (a) =>
          a.tipo === "comunidad" &&
          comunidades.find((c) => c.id === filtroEntidad)?.nombre
            ?.toLowerCase()
            .includes(a.titulo.toLowerCase())
      );
    }

    return resultado.sort((a, b) => {
      const severidadScore = { alto: 3, medio: 2, bajo: 1 };
      return severidadScore[b.severidad] - severidadScore[a.severidad];
    });
  }, [alertas, filtroTecnico, filtroEntidad, usuarios, comunidades]);

  return (
    <div className="space-y-3">
      {alertasFiltradas.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-800 font-medium">
            ✅ No hay alertas. Todo está en orden.
          </p>
        </div>
      ) : (
        alertasFiltradas.map((alerta, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg border-l-4 ${
              alerta.severidad === "alto"
                ? "bg-red-50 border-red-500"
                : alerta.severidad === "medio"
                ? "bg-yellow-50 border-yellow-500"
                : "bg-blue-50 border-blue-500"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-gray-900">{alerta.titulo}</h3>
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
            <p className="text-sm text-gray-700 mb-2">{alerta.descripcion}</p>
            <p className="text-sm font-semibold text-gray-600">
              💡 {alerta.recomendacion}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

// ============ COMPONENTE: Agenda Semanal ============
interface AgendaSemanalProps {
  agendasTecnicos: AgendaSemanal[];
  semanaActiva: Semana | null;
  periodo: "semana" | "mes" | "año";
  seguimientos: Seguimiento[];
}

function AgendaSemanalComponent({
  agendasTecnicos,
  semanaActiva,
  periodo,
  seguimientos,
}: AgendaSemanalProps) {
  const getTituloAgenda = () => {
    switch (periodo) {
      case "semana":
        return semanaActiva
          ? `Semana del ${semanaActiva.fechaInicio} al ${semanaActiva.fechaFin}`
          : "Semana Actual";
      case "mes":
        const hoy = new Date();
        return `Mes de ${hoy.toLocaleDateString("es-ES", {
          month: "long",
          year: "numeric",
        })}`;
      case "año":
        return `Año ${new Date().getFullYear()}`;
      default:
        return "Agenda";
    }
  };

  const getActividadesTotales = (tecnicoId: string) => {
    // SUMA ACTIVIDADES ACTIVAS Y NO ACTIVAS
    return seguimientos
      .filter((s) => s.tecnicoId === tecnicoId)
      .flatMap((s) => s.actividadesRegulares || []).length;
  };

  return (
    <Panel titulo={`📅 Agenda ${getTituloAgenda()}`}>
      <div className="space-y-4">
        {agendasTecnicos.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Sin actividades</p>
        ) : (
          agendasTecnicos.map((agenda) => (
            <div
              key={agenda.tecnico.id}
              className="border rounded-lg p-4 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">
                  👤 {agenda.tecnico.nombre}
                </h3>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {getActividadesTotales(agenda.tecnico.id)} actividades totales
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {agenda.actividades.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">
                    Sin actividades planificadas
                  </p>
                ) : (
                  agenda.actividades.map((act, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 pb-2 border-b border-gray-200 last:border-b-0"
                    >
                      <div className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded whitespace-nowrap">
                        {act.horario}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          📍 {act.comunidadNombre}
                        </p>
                        <p className="text-xs text-gray-600">
                          {act.actividad}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

// ============ COMPONENTE: Gestión de Participantes ============
interface GestionParticipantesProps {
  participantes: Participante[];
  comunidades: Comunidad[];
  usuarios: Usuario[];
  onActualizar: () => void;
}

function GestionParticipantes({
  participantes,
  comunidades,
  usuarios,
  onActualizar,
}: GestionParticipantesProps) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroComunidad, setFiltroComunidad] = useState("todos");
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modo, setModo] = useState<"crear" | "editar">("crear");
  const [participanteEditar, setParticipanteEditar] =
    useState<Participante | null>(null);

  const [formData, setFormData] = useState<FormParticipante>({
    nombres: "",
    apellidos: "",
    edad: "",
    genero: "M",
    comunidadId: "",
    tecnicoId: "",
    estado: "activo",
  });

  const participantesFiltrados = useMemo(() => {
    return participantes.filter((p) => {
      const cumpleEstado =
        filtroEstado === "todos" || p.estado === filtroEstado;
      const cumpleComunidad =
        filtroComunidad === "todos" || p.comunidadId === filtroComunidad;
      const cumpleTecnico =
        filtroTecnico === "todos" || p.tecnicoId === filtroTecnico;
      const cumpleBusqueda =
        busqueda === "" ||
        p.nombres.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.apellidos.toLowerCase().includes(busqueda.toLowerCase());

      return (
        cumpleEstado &&
        cumpleComunidad &&
        cumpleTecnico &&
        cumpleBusqueda
      );
    });
  }, [
    participantes,
    filtroEstado,
    filtroComunidad,
    filtroTecnico,
    busqueda,
  ]);

  const handleAbrirCrear = () => {
    setModo("crear");
    setParticipanteEditar(null);
    setFormData({
      nombres: "",
      apellidos: "",
      edad: "",
      genero: "M",
      comunidadId: "",
      tecnicoId: "",
      estado: "activo",
    });
    setShowModal(true);
  };

  const handleAbrirEditar = (participante: Participante) => {
    setModo("editar");
    setParticipanteEditar(participante);
    setFormData({
      nombres: participante.nombres,
      apellidos: participante.apellidos,
      edad: participante.edad,
      genero: participante.genero as "M" | "F" | "Otro",
      comunidadId: participante.comunidadId,
      tecnicoId: participante.tecnicoId || "",
      estado: participante.estado,
    });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    try {
      if (
        !formData.nombres ||
        !formData.apellidos ||
        !formData.comunidadId ||
        !formData.tecnicoId ||
        !formData.edad
      ) {
        alert("Completa todos los campos");
        return;
      }

      if (modo === "crear") {
        await addDoc(collection(db, "participantes"), {
          ...formData,
          edad: Number(formData.edad),
          fechaRegistro: new Date().toISOString().split("T")[0],
        });
        alert("✅ Participante creado");
      } else if (participanteEditar) {
        const docRef = doc(db, "participantes", participanteEditar.id);
        await updateDoc(docRef, {
          ...formData,
          edad: Number(formData.edad),
        });
        alert("✅ Participante actualizado");
      }

      setShowModal(false);
      onActualizar();
    } catch (err) {
      alert("❌ Error: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const handleEliminar = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este participante?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "participantes", id));
      alert("✅ Participante eliminado");
      onActualizar();
    } catch (err) {
      alert("❌ Error: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const handleCambiarEstado = async (
    participante: Participante,
    nuevoEstado: "activo" | "inactivo"
  ) => {
    try {
      const docRef = doc(db, "participantes", participante.id);
      await updateDoc(docRef, { estado: nuevoEstado });
      alert("✅ Estado actualizado");
      onActualizar();
    } catch (err) {
      alert("❌ Error: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const tecnicosYAdmins = usuarios.filter(
    (u) => u.rol === "tecnico" || u.rol === "admin"
  );

  return (
    <>
      {/* Panel de Filtros y Botón Crear */}
      <Panel titulo="👥 Gestión de Participantes">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-gray-600 font-semibold">
              Total: <span className="font-bold text-blue-600">{participantes.length}</span> | 
              Mostrando: <span className="font-bold text-green-600">{participantesFiltrados.length}</span>
            </p>
            <button
              onClick={handleAbrirCrear}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              ➕ Nuevo Participante
            </button>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                Buscar
              </label>
              <input
                type="text"
                placeholder="Nombres o apellidos..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                Estado
              </label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                Técnico
              </label>
              <select
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                Comunidad
              </label>
              <select
                value={filtroComunidad}
                onChange={(e) => setFiltroComunidad(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todas</option>
                {comunidades.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                Resultados
              </label>
              <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold text-center text-sm">
                {participantesFiltrados.length}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Tabla de Participantes */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        {participantesFiltrados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No hay participantes que coincidan con los filtros</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-sm">Nombres</th>
                <th className="px-6 py-3 text-left font-semibold text-sm">Apellidos</th>
                <th className="px-6 py-3 text-center font-semibold text-sm">Edad</th>
                <th className="px-6 py-3 text-center font-semibold text-sm">Género</th>
                <th className="px-6 py-3 text-left font-semibold text-sm">Comunidad</th>
                <th className="px-6 py-3 text-left font-semibold text-sm">Técnico</th>
                <th className="px-6 py-3 text-center font-semibold text-sm">Estado</th>
                <th className="px-6 py-3 text-center font-semibold text-sm">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {participantesFiltrados.map((participante) => {
                const comunidad = comunidades.find(
                  (c) => c.id === participante.comunidadId
                );
                const tecnico = usuarios.find(
                  (u) => u.id === participante.tecnicoId
                );

                return (
                  <tr key={participante.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-semibold text-gray-900 text-sm">
                      {participante.nombres}
                    </td>
                    <td className="px-6 py-4 text-gray-700 text-sm">
                      {participante.apellidos}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-700 text-sm">
                      {participante.edad}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-sm">
                      {participante.genero === "M"
                        ? "👨"
                        : participante.genero === "F"
                        ? "👩"
                        : "⚪"}
                    </td>
                    <td className="px-6 py-4 text-gray-700 text-sm">
                      {comunidad?.nombre || "No asignada"}
                    </td>
                    <td className="px-6 py-4 text-gray-700 text-sm">
                      {tecnico?.nombre || "No asignado"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() =>
                          handleCambiarEstado(
                            participante,
                            participante.estado === "activo"
                              ? "inactivo"
                              : "activo"
                          )
                        }
                        className={`px-3 py-1 rounded-full text-xs font-semibold text-white transition ${
                          participante.estado === "activo"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                      >
                        {participante.estado === "activo" ? "✅" : "❌"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center space-x-2">
                      <button
                        onClick={() => handleAbrirEditar(participante)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-semibold transition text-sm"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleEliminar(participante.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-semibold transition text-sm"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {modo === "crear"
                ? "➕ Nuevo Participante"
                : "✏️ Editar Participante"}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    value={formData.nombres}
                    onChange={(e) =>
                      setFormData({ ...formData, nombres: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: Juan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    value={formData.apellidos}
                    onChange={(e) =>
                      setFormData({ ...formData, apellidos: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: García"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Edad *
                  </label>
                  <input
                    type="number"
                    value={formData.edad}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        edad: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="18"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Género *
                  </label>
                  <select
                    value={formData.genero}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        genero: e.target.value as "M" | "F" | "Otro",
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Comunidad *
                  </label>
                  <select
                    value={formData.comunidadId}
                    onChange={(e) => {
                      const comunidad = comunidades.find(
                        (c) => c.id === e.target.value
                      );
                      setFormData({
                        ...formData,
                        comunidadId: e.target.value,
                        tecnicoId: comunidad?.tecnicoId || "",
                      });
                    }}
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecciona una comunidad</option>
                    {comunidades.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Técnico *
                  </label>
                  <select
                    value={formData.tecnicoId}
                    onChange={(e) =>
                      setFormData({ ...formData, tecnicoId: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecciona un técnico</option>
                    {tecnicosYAdmins.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Estado *
                  </label>
                  <select
                    value={formData.estado}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estado: e.target.value as "activo" | "inactivo",
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 px-4 py-2 rounded-lg font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                {modo === "crear" ? "Crear" : "Actualizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ COMPONENTE: Generador de PDFs - HORIZONTAL ============
interface GeneradorPDFsProps {
  datos: ReturnType<typeof useDatosReportes>;
  comparativasTecnicos: ComparativaTecnico[];
  semanaActiva: Semana | null;
  seguimientos: Seguimiento[];
}

function GeneradorPDFs({
  datos,
  comparativasTecnicos,
  semanaActiva,
  seguimientos,
}: GeneradorPDFsProps) {
  const [generando, setGenerando] = useState(false);

  const convertirImagenABase64 = (imagenUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const imagen = new window.Image();
        imagen.crossOrigin = "anonymous";
        imagen.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = imagen.width;
          canvas.height = imagen.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(imagen, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        imagen.src = imagenUrl;
      } catch {
        resolve("");
      }
    });
  };

  const generarPDFDistribucionComunidades = async () => {
    try {
      setGenerando(true);

      // FORMATO HORIZONTAL (LANDSCAPE)
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Encabezado con Logo
      const logoUrl = "/logo-gad.png";
      const logoBase64 = await convertirImagenABase64(logoUrl);

      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 15, 10, 30, 30);
      }

      // Información del GAD
      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.setFont("helvetica", "bold");
      doc.text("GAD Municipal del Cantón", 50, 15);
      doc.text("Montecristi", 50, 20);

      // Título
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "DISTRIBUCIÓN DE COMUNIDADES POR TÉCNICO",
        pageWidth / 2,
        35,
        { align: "center" }
      );

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-ES")}`,
        pageWidth / 2,
        42,
        { align: "center" }
      );

      let yPosition = 50;

      for (const tecnico of comparativasTecnicos) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`Técnico: ${tecnico.tecnico}`, 15, yPosition);
        yPosition += 8;

        const comunidadesTecnico = datos.comunidades.filter(
          (c) => c.tecnicoId === tecnico.tecnicoId
        );

        const tableData = comunidadesTecnico.map((com) => {
          const participantes = datos.participantes.filter(
            (p) => p.comunidadId === com.id
          ).length;

          return [com.nombre, participantes.toString()];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [["Comunidad", "# Participantes"]],
          body: tableData,
          columnStyles: {
            0: { cellWidth: 180 },
            1: { cellWidth: 80, halign: "center" },
          },
          margin: { left: 15, right: 15 },
        });

        yPosition = (doc as any).lastAutoTable.finalY + 10;
      }

      // Pie de página
      const paginasTotal = doc.getNumberOfPages();
      for (let i = 1; i <= paginasTotal; i++) {
        doc.setPage(i);
        doc.setDrawColor(76, 175, 80);
        doc.setLineWidth(0.5);
        doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("Montecristi Crece en Valores", 20, pageHeight - 10);
        doc.text(`Página ${i} de ${paginasTotal}`, pageWidth - 40, pageHeight - 10);
      }

      doc.save("Distribucion_Comunidades_Tecnicos.pdf");
      alert("✅ PDF generado correctamente");
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFInformeSemanal = async () => {
    try {
      setGenerando(true);

      if (!semanaActiva) {
        alert("Selecciona una semana");
        return;
      }

      // FORMATO HORIZONTAL
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Logo
      const logoUrl = "/logo-gad.png";
      const logoBase64 = await convertirImagenABase64(logoUrl);

      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 15, 10, 30, 30);
      }

      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.setFont("helvetica", "bold");
      doc.text("GAD Municipal del Cantón", 50, 15);
      doc.text("Montecristi", 50, 20);

      // Título
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "INFORME SEMANAL - ACTIVIDADES REALIZADAS",
        pageWidth / 2,
        35,
        { align: "center" }
      );

      const infoData = [
        [
          "Período:",
          `${semanaActiva.fechaInicio} al ${semanaActiva.fechaFin}`,
        ],
        ["Generado:", new Date().toLocaleDateString("es-ES")],
      ];

      autoTable(doc, {
        startY: 42,
        head: [],
        body: infoData,
        columnStyles: {
          0: {
            cellWidth: 60,
            fontStyle: "bold",
            fillColor: [76, 175, 80],
            textColor: [255, 255, 255],
          },
          1: { cellWidth: pageWidth - 90 },
        },
        margin: { left: 15, right: 15 },
      });

      let yPosition = (doc as any).lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("ACTIVIDADES REALIZADAS EN LA SEMANA", 15, yPosition);
      yPosition += 8;

      // DETALLE DE ACTIVIDADES CON DESCRIPCIÓN TEXTUAL
      for (const tecnico of comparativasTecnicos) {
        const segsTecnico = seguimientos.filter(
          (s) => s.tecnicoId === tecnico.tecnicoId
        );

        segsTecnico.forEach((seg) => {
          if (seg.actividadesRegulares && seg.actividadesRegulares.length > 0) {
            seg.actividadesRegulares.forEach((actividad: any) => {
              if (
                actividad.estadoActividad === "realizada" &&
                yPosition < pageHeight - 50
              ) {
                // TEXTO DE LA ACTIVIDAD
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`Técnico: ${tecnico.tecnico}`, 15, yPosition);
                yPosition += 6;

                doc.setFont("helvetica", "normal");
                doc.setFontSize(9);
                doc.text(
                  `📍 Comunidad: ${actividad.comunidadNombre || "N/A"}`,
                  20,
                  yPosition
                );
                yPosition += 5;
                doc.text(`📅 Fecha: ${actividad.fecha || "N/A"}`, 20, yPosition);
                yPosition += 5;
                doc.text(
                  `📋 Actividad: ${actividad.actividad || "N/A"}`,
                  20,
                  yPosition
                );
                yPosition += 5;
                doc.text(
                  `👥 Participantes: ${actividad.participantes || actividad.asistentes || "N/A"}`,
                  20,
                  yPosition
                );
                yPosition += 5;
                doc.text(
                  `📊 Porcentaje Asistencia: ${actividad.porcentajeAsistencia || "N/A"}%`,
                  20,
                  yPosition
                );
                yPosition += 6;

                // AGREGAR FOTO SI EXISTE
                if (actividad.fotos && actividad.fotos.length > 0) {
                  try {
                    const fotoBase64 = actividad.fotos[0];
                    if (fotoBase64.includes("data:image")) {
                      doc.addImage(fotoBase64, "JPEG", 20, yPosition, 40, 30);
                      yPosition += 35;
                    }
                  } catch (err) {
                    console.log("Error agregando imagen");
                  }
                }

                yPosition += 5;
              }
            });
          }
        });
      }

      // Pie de página
      const paginasTotal = doc.getNumberOfPages();
      for (let i = 1; i <= paginasTotal; i++) {
        doc.setPage(i);
        doc.setDrawColor(76, 175, 80);
        doc.setLineWidth(0.5);
        doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("Montecristi Crece en Valores", 20, pageHeight - 10);
        doc.text(`Página ${i} de ${paginasTotal}`, pageWidth - 40, pageHeight - 10);
      }

      doc.save(`Informe_Semanal_${semanaActiva.fechaInicio}.pdf`);
      alert("✅ PDF generado correctamente");
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFInformeMensual = async () => {
    try {
      setGenerando(true);

      // FORMATO HORIZONTAL
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Logo
      const logoUrl = "/logo-gad.png";
      const logoBase64 = await convertirImagenABase64(logoUrl);

      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 15, 10, 30, 30);
      }

      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.setFont("helvetica", "bold");
      doc.text("GAD Municipal del Cantón", 50, 15);
      doc.text("Montecristi", 50, 20);

      // Título
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "INFORME MENSUAL",
        pageWidth / 2,
        35,
        { align: "center" }
      );

      const hoy = new Date();
      const infoData = [
        [
          "Período:",
          `${hoy.toLocaleDateString("es-ES", {
            month: "long",
            year: "numeric",
          })}`,
        ],
        ["Generado:", new Date().toLocaleDateString("es-ES")],
      ];

      autoTable(doc, {
        startY: 42,
        head: [],
        body: infoData,
        columnStyles: {
          0: {
            cellWidth: 60,
            fontStyle: "bold",
            fillColor: [76, 175, 80],
            textColor: [255, 255, 255],
          },
          1: { cellWidth: pageWidth - 90 },
        },
        margin: { left: 15, right: 15 },
      });

      let yPosition = (doc as any).lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("CONSOLIDADO MENSUAL POR TÉCNICO", 15, yPosition);
      yPosition += 8;

      const tableData = comparativasTecnicos.map((tecnico) => [
        tecnico.tecnico,
        tecnico.participantes.toString(),
        tecnico.actividades.toString(),
        tecnico.cumplimiento + "%",
        tecnico.asistencia.toFixed(1) + "%",
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [["Técnico", "Participantes", "Actividades", "Cumplimiento", "Asistencia"]],
        body: tableData,
        columnStyles: {
          0: { cellWidth: 100 },
          1: { cellWidth: 60, halign: "center" },
          2: { cellWidth: 60, halign: "center" },
          3: { cellWidth: 60, halign: "center" },
          4: { cellWidth: 60, halign: "center" },
        },
        margin: { left: 15, right: 15 },
      });

      // Pie de página
      const paginasTotal = doc.getNumberOfPages();
      for (let i = 1; i <= paginasTotal; i++) {
        doc.setPage(i);
        doc.setDrawColor(76, 175, 80);
        doc.setLineWidth(0.5);
        doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("Montecristi Crece en Valores", 20, pageHeight - 10);
        doc.text(`Página ${i} de ${paginasTotal}`, pageWidth - 40, pageHeight - 10);
      }

      doc.save(`Informe_Mensual_${hoy.toISOString().slice(0, 7)}.pdf`);
      alert("✅ PDF generado correctamente");
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFInformeAnual = async () => {
    try {
      setGenerando(true);

      // FORMATO HORIZONTAL
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Logo
      const logoUrl = "/logo-gad.png";
      const logoBase64 = await convertirImagenABase64(logoUrl);

      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 15, 10, 30, 30);
      }

      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.setFont("helvetica", "bold");
      doc.text("GAD Municipal del Cantón", 50, 15);
      doc.text("Montecristi", 50, 20);

      // Título
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "INFORME ANUAL",
        pageWidth / 2,
        35,
        { align: "center" }
      );

      const hoy = new Date();
      const infoData = [
        ["Año:", hoy.getFullYear().toString()],
        ["Generado:", new Date().toLocaleDateString("es-ES")],
      ];

      autoTable(doc, {
        startY: 42,
        head: [],
        body: infoData,
        columnStyles: {
          0: {
            cellWidth: 60,
            fontStyle: "bold",
            fillColor: [76, 175, 80],
            textColor: [255, 255, 255],
          },
          1: { cellWidth: pageWidth - 90 },
        },
        margin: { left: 15, right: 15 },
      });

      let yPosition = (doc as any).lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("RESUMEN ANUAL POR TÉCNICO", 15, yPosition);
      yPosition += 8;

      const tableData = comparativasTecnicos.map((tecnico) => [
        tecnico.tecnico,
        tecnico.comunidades.toString(),
        tecnico.participantes.toString(),
        tecnico.actividades.toString(),
        tecnico.cumplimiento + "%",
        tecnico.asistencia.toFixed(1) + "%",
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [["Técnico", "Comunidades", "Participantes", "Actividades", "Cumplimiento", "Asistencia"]],
        body: tableData,
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 50, halign: "center" },
          2: { cellWidth: 60, halign: "center" },
          3: { cellWidth: 60, halign: "center" },
          4: { cellWidth: 50, halign: "center" },
          5: { cellWidth: 50, halign: "center" },
        },
        margin: { left: 15, right: 15 },
      });

      // Pie de página
      const paginasTotal = doc.getNumberOfPages();
      for (let i = 1; i <= paginasTotal; i++) {
        doc.setPage(i);
        doc.setDrawColor(76, 175, 80);
        doc.setLineWidth(0.5);
        doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("Montecristi Crece en Valores", 20, pageHeight - 10);
        doc.text(`Página ${i} de ${paginasTotal}`, pageWidth - 40, pageHeight - 10);
      }

      doc.save(`Informe_Anual_${hoy.getFullYear()}.pdf`);
      alert("✅ PDF generado correctamente");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Panel titulo="📄 Generar Reportes Institucionales">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={generarPDFDistribucionComunidades}
          disabled={generando}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          {generando ? "⏳" : "📥"} Distribución Comunidades
        </button>

        <button
          onClick={generarPDFInformeSemanal}
          disabled={generando}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          {generando ? "⏳" : "📅"} Informe Semanal
        </button>

        <button
          onClick={generarPDFInformeMensual}
          disabled={generando}
          className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          {generando ? "⏳" : "📊"} Informe Mensual
        </button>

        <button
          onClick={generarPDFInformeAnual}
          disabled={generando}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          {generando ? "⏳" : "📈"} Informe Anual
        </button>
      </div>
    </Panel>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function ReportesInstitucionales() {
  const datos = useDatosReportes();
  const [tabActivo, setTabActivo] = useState<
    | "participantes"
    | "agenda"
    | "resumen"
    | "comparativas"
    | "tecnicos"
    | "comunidades"
    | "metas"
    | "alertas"
  >("participantes");
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "año">(
    "semana"
  );
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

  // ============ CALCULAR COMPARATIVAS TÉCNICOS ============
  const comparativasTecnicos = useMemo(() => {
    const tecnicos = datos.usuarios.filter(
      (u) => u.rol === "tecnico" || u.rol === "admin"
    );

    return tecnicos.map((tecnico) => {
      const comunidadesAsignadas = datos.comunidades.filter(
        (c) => c.tecnicoId === tecnico.id
      ).length;

      const participantesTecnico = datos.participantes.filter(
        (p) => p.tecnicoId === tecnico.id
      ).length;

      const actividades = datos.seguimientos
        .filter((s) => s.tecnicoId === tecnico.id)
        .flatMap((s) => s.actividadesRegulares || [])
        .filter((a: any) => a.estadoActividad === "realizada").length;

      const registrosActividades = datos.seguimientos
        .filter((s) => s.tecnicoId === tecnico.id)
        .flatMap((s) => s.actividadesRegulares || [])
        .filter((a: any) => a.estadoActividad === "realizada");

      const asistenciaPromedio =
        registrosActividades.length > 0
          ? registrosActividades.reduce(
              (sum: number, a: any) =>
                sum + (a.porcentajeAsistencia || 0),
              0
            ) / registrosActividades.length
          : 0;

      const planificaciones = datos.planificaciones.filter(
        (p) => p.tecnicoId === tecnico.id && p.estado === "enviado"
      ).length;

      const seguimientos = datos.seguimientos.filter(
        (s) => s.tecnicoId === tecnico.id && s.estado === "enviado"
      ).length;

      const cumplimiento =
        planificaciones > 0 && seguimientos > 0
          ? 100
          : planificaciones > 0 || seguimientos > 0
          ? 50
          : 0;

      return {
        tecnico: tecnico.nombre,
        tecnicoId: tecnico.id,
        comunidades: comunidadesAsignadas,
        participantes: participantesTecnico,
        actividades,
        cumplimiento,
        asistencia: asistenciaPromedio,
      };
    });
  }, [
    datos.usuarios,
    datos.comunidades,
    datos.participantes,
    datos.seguimientos,
    datos.planificaciones,
  ]);

  // ============ CALCULAR COMPARATIVAS COMUNIDADES ============
  const comparativasComunidades = useMemo(() => {
    return datos.comunidades.map((comunidad) => {
      const tecnico = datos.usuarios.find((u) => u.id === comunidad.tecnicoId);
      const participantes = datos.participantes.filter(
        (p) => p.comunidadId === comunidad.id
      ).length;

      const registrosComunidad = datos.seguimientos
        .flatMap((s) => s.actividadesRegulares || [])
        .filter(
          (r: any) =>
            (r.comunidadId === comunidad.id ||
              r.comunidadNombre === comunidad.nombre) &&
            r.estadoActividad === "realizada"
        );

      const asistenciaPromedio =
        registrosComunidad.length > 0
          ? registrosComunidad.reduce(
              (sum: number, r: any) =>
                sum + (r.porcentajeAsistencia || 0),
              0
            ) / registrosComunidad.length
          : 0;

      return {
        comunidad: comunidad.nombre,
        tecnico: tecnico?.nombre || "No asignado",
        participantes,
        asistencia: asistenciaPromedio,
        actividades: registrosComunidad.length,
      };
    });
  }, [datos.comunidades, datos.usuarios, datos.seguimientos]);

  // ============ CALCULAR METAS - META ACTUALIZADA A 85 ============
  const metas = useMemo(() => {
    const tecnicos = datos.usuarios.filter(
      (u) => u.rol === "tecnico" || u.rol === "admin"
    );

    return tecnicos.map((tecnico) => {
      const participantesTecnico = datos.participantes.filter(
        (p) => p.tecnicoId === tecnico.id
      ).length;

      const metaTecnico = 85;
      const porcentaje = Math.round((participantesTecnico / metaTecnico) * 100);

      return {
        tecnico: tecnico.nombre,
        tecnicoId: tecnico.id,
        meta: metaTecnico,
        actual: participantesTecnico,
        porcentaje: Math.min(porcentaje, 100),
      };
    });
  }, [datos.usuarios, datos.participantes]);

  // ============ CALCULAR ALERTAS ============
  const alertas = useMemo(() => {
    const alertasGeneradas: Alerta[] = [];

    comparativasTecnicos.forEach((tecnico) => {
      if (tecnico.cumplimiento < 70) {
        alertasGeneradas.push({
          tipo: "tecnico",
          titulo: `${tecnico.tecnico} - Bajo Cumplimiento`,
          descripcion: `El técnico tiene ${tecnico.cumplimiento}% de cumplimiento.`,
          severidad: tecnico.cumplimiento < 50 ? "alto" : "medio",
          recomendacion:
            "Realizar seguimiento y capacitación al técnico.",
        });
      }
    });

    comparativasComunidades.forEach((comunidad) => {
      if (comunidad.asistencia < 70) {
        alertasGeneradas.push({
          tipo: "comunidad",
          titulo: `${comunidad.comunidad} - Baja Asistencia`,
          descripcion: `Asistencia promedio: ${comunidad.asistencia.toFixed(1)}%`,
          severidad:
            comunidad.asistencia < 50 ? "alto" : "medio",
          recomendacion:
            "Realizar actividades de reenganche en la comunidad.",
        });
      }
    });

    metas.forEach((meta) => {
      if (meta.porcentaje < 70) {
        alertasGeneradas.push({
          tipo: "tecnico",
          titulo: `${meta.tecnico} - Meta de Participantes`,
          descripcion: `Cumplimiento: ${meta.porcentaje}% (${meta.actual}/${meta.meta})`,
          severidad:
            meta.porcentaje < 50 ? "alto" : "medio",
          recomendacion:
            "Intensificar esfuerzos de evangelización.",
        });
      }
    });

    return alertasGeneradas;
  }, [comparativasTecnicos, comparativasComunidades, metas]);

  // ============ CALCULAR ESTADÍSTICAS ============
  const estadisticas = useMemo(() => {
    const registros = datos.seguimientos
      .flatMap((s) => s.actividadesRegulares || [])
      .filter((r: any) => r.estadoActividad === "realizada");

    const asistenciaGlobal =
      registros.length > 0
        ? Math.round(
            registros.reduce((sum: number, r: any) => sum + (r.porcentajeAsistencia || 0), 0) /
              registros.length
          )
        : 0;

    return {
      actividades: registros.length,
      asistencia: asistenciaGlobal,
      participantes: datos.participantes.length,
      cumplimiento:
        comparativasTecnicos.length > 0
          ? Math.round(
              comparativasTecnicos.reduce((sum, t) => sum + t.cumplimiento, 0) /
                comparativasTecnicos.length
            )
          : 0,
    };
  }, [datos.seguimientos, datos.participantes, comparativasTecnicos]);

  // ============ CONSTRUIR AGENDAS - TODAS LAS SEMANAS ============
  const agendasTecnicos = useMemo(() => {
    const tecnicos = datos.usuarios.filter(
      (u) => u.rol === "tecnico" || u.rol === "admin"
    );

    return tecnicos
      .map((tecnico) => {
        let actividades: ActividadPlanificada[] = [];

        if (periodo === "semana") {
          if (semanaActiva) {
            const plan = datos.planificaciones.find(
              (p) =>
                p.tecnicoId === tecnico.id &&
                p.semanaId === semanaActiva.id &&
                p.estado === "enviado"
            );
            actividades = plan?.actividades || [];
          }
        } else if (periodo === "mes") {
          const mesActual = new Date().getMonth();
          actividades = datos.planificaciones
            .filter((p) => p.tecnicoId === tecnico.id && p.estado === "enviado")
            .flatMap((p) =>
              (p.actividades || []).filter((a) => {
                const fechaActividad = new Date(a.fecha);
                return fechaActividad.getMonth() === mesActual;
              })
            );
        } else if (periodo === "año") {
          // TRAE DE TODAS LAS SEMANAS DEL AÑO
          actividades = datos.planificaciones
            .filter((p) => p.tecnicoId === tecnico.id && p.estado === "enviado")
            .flatMap((p) => p.actividades || [])
            .filter((a) => {
              const fechaActividad = new Date(a.fecha);
              return fechaActividad.getFullYear() === new Date().getFullYear();
            });
        }

        return {
          tecnico,
          actividades: actividades.sort((a, b) => {
            const fechaA = new Date(a.fecha).getTime();
            const fechaB = new Date(b.fecha).getTime();
            return fechaA - fechaB;
          }),
        };
      })
      .filter((a) => a.actividades.length > 0);
  }, [datos.planificaciones, datos.usuarios, periodo, semanaActiva]);

  if (datos.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  if (datos.error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Error: {datos.error}</p>
        </div>
      </div>
    );
  }

  const tecnicosYAdmins = datos.usuarios.filter(
    (u) => u.rol === "tecnico" || u.rol === "admin"
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            📊 Reportes Institucionales
          </h1>
          <p className="text-gray-600 mt-2">
            Análisis detallado de datos e información del sistema
          </p>
        </div>

        {/* KPIs Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPICard
            titulo="Actividades"
            valor={estadisticas.actividades}
            icono="📋"
            color="bg-blue-600"
          />
          <KPICard
            titulo="Asistencia Promedio"
            valor={`${estadisticas.asistencia}%`}
            icono="📊"
            color="bg-green-600"
          />
          <KPICard
            titulo="Participantes Totales"
            valor={estadisticas.participantes}
            icono="👥"
            color="bg-purple-600"
          />
          <KPICard
            titulo="Cumplimiento General"
            valor={`${estadisticas.cumplimiento}%`}
            icono="✅"
            color="bg-orange-600"
          />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 bg-white rounded-lg shadow-md p-4 overflow-x-auto">
          {[
            { id: "participantes", label: "👥 Participantes" },
            { id: "agenda", label: "📅 Agenda" },
            { id: "resumen", label: "📈 Resumen Ejecutivo" },
            { id: "comparativas", label: "🔄 Comparativas" },
            { id: "tecnicos", label: "👨‍💼 Técnicos" },
            { id: "comunidades", label: "🏘️ Comunidades" },
            { id: "metas", label: "🎯 Metas" },
            { id: "alertas", label: "⚠️ Alertas" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setTabActivo(
                  tab.id as
                    | "participantes"
                    | "agenda"
                    | "resumen"
                    | "comparativas"
                    | "tecnicos"
                    | "comunidades"
                    | "metas"
                    | "alertas"
                )
              }
              className={`px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap ${
                tabActivo === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* FILTROS SOLO PARA ALERTAS Y COMUNIDADES */}
        {(tabActivo === "alertas" || tabActivo === "comunidades") && (
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Filtrar por Técnico
                </label>
                <select
                  value={filtroTecnico}
                  onChange={(e) => setFiltroTecnico(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Filtrar por Comunidad
                </label>
                <select
                  value={filtroEntidad}
                  onChange={(e) => setFiltroEntidad(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
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
          </div>
        )}

        {/* FILTRO DE PERÍODO SOLO PARA AGENDA */}
        {tabActivo === "agenda" && (
          <div className="bg-white rounded-lg shadow-md p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Período de Agenda
            </label>
            <select
              value={periodo}
              onChange={(e) =>
                setPeriodo(e.target.value as "semana" | "mes" | "año")
              }
              className="w-full md:w-64 border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="semana">Semana Actual</option>
              <option value="mes">Mes Actual</option>
              <option value="año">Año Actual</option>
            </select>
          </div>
        )}

        {/* Contenido por Tab */}

        {/* TAB: PARTICIPANTES */}
        {tabActivo === "participantes" && (
          <GestionParticipantes
            participantes={datos.participantes}
            comunidades={datos.comunidades}
            usuarios={datos.usuarios}
            onActualizar={() => datos.recargar()}
          />
        )}

        {/* TAB: AGENDA */}
        {tabActivo === "agenda" && (
          <AgendaSemanalComponent
            agendasTecnicos={agendasTecnicos}
            semanaActiva={semanaActiva}
            periodo={periodo}
            seguimientos={datos.seguimientos}
          />
        )}

        {/* TAB: RESUMEN EJECUTIVO */}
        {tabActivo === "resumen" && (
          <Panel titulo="📈 Resumen Ejecutivo">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-6 py-3 text-left font-bold text-gray-900">
                      Indicador
                    </th>
                    <th className="px-6 py-3 text-center font-bold text-gray-900">
                      Semana
                    </th>
                    <th className="px-6 py-3 text-center font-bold text-gray-900">
                      Mes
                    </th>
                    <th className="px-6 py-3 text-center font-bold text-gray-900">
                      Año
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      Actividades
                    </td>
                    <td className="px-6 py-4 text-center">
                      {estadisticas.actividades}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {estadisticas.actividades * 4}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {estadisticas.actividades * 52}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      Asistencia Promedio
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-semibold">
                        {estadisticas.asistencia}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-semibold">
                        {estadisticas.asistencia}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-semibold">
                        {estadisticas.asistencia}%
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      Participantes
                    </td>
                    <td className="px-6 py-4 text-center">
                      {Math.round(estadisticas.participantes / 52)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {Math.round(estadisticas.participantes / 4)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {estadisticas.participantes}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50 bg-gray-100 font-bold">
                    <td className="px-6 py-4 text-gray-900">
                      Cumplimiento
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        {estadisticas.cumplimiento}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        {estadisticas.cumplimiento}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        {estadisticas.cumplimiento}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* TAB: COMPARATIVAS */}
        {tabActivo === "comparativas" && (
          <div className="space-y-6">
            <Panel titulo="🔄 Comparativa Técnico vs Técnico">
              <TablaComparativaTecnicos
                tecnicos={comparativasTecnicos}
              />
            </Panel>

            <Panel titulo="🔄 Comparativa Comunidad vs Comunidad">
              <TablaComparativaComunidades
                comunidades={comparativasComunidades}
              />
            </Panel>
          </div>
        )}

        {/* TAB: TÉCNICOS */}
        {tabActivo === "tecnicos" && (
          <Panel titulo="👨‍💼 Análisis Detallado por Técnico">
            <div className="space-y-6">
              {comparativasTecnicos.map((tecnico) => (
                <div
                  key={tecnico.tecnicoId}
                  className="border rounded-lg p-6 space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900">
                      {tecnico.tecnico}
                    </h3>
                    <span
                      className={`px-4 py-2 rounded-full text-sm font-bold text-white ${
                        tecnico.cumplimiento >= 90
                          ? "bg-green-600"
                          : tecnico.cumplimiento >= 70
                          ? "bg-yellow-600"
                          : "bg-red-600"
                      }`}
                    >
                      {tecnico.cumplimiento}% Cumplimiento
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-blue-600 font-bold uppercase">
                        Comunidades
                      </p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">
                        {tecnico.comunidades}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <p className="text-xs text-purple-600 font-bold uppercase">
                        Participantes
                      </p>
                      <p className="text-2xl font-bold text-purple-900 mt-1">
                        {tecnico.participantes}
                      </p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-xs text-green-600 font-bold uppercase">
                        Actividades
                      </p>
                      <p className="text-2xl font-bold text-green-900 mt-1">
                        {tecnico.actividades}
                      </p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg">
                      <p className="text-xs text-orange-600 font-bold uppercase">
                        Asistencia
                      </p>
                      <p className="text-2xl font-bold text-orange-900 mt-1">
                        {tecnico.asistencia.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* TAB: COMUNIDADES CON FILTROS */}
        {tabActivo === "comunidades" && (
          <Panel titulo="🏘️ Análisis Detallado por Comunidad">
            <div className="space-y-6">
              {comparativasComunidades
                .filter(
                  (com) =>
                    filtroTecnico === "todos" ||
                    datos.usuarios.find((u) => u.id === filtroTecnico)?.nombre ===
                      com.tecnico
                )
                .filter(
                  (com) =>
                    filtroEntidad === "todos" ||
                    datos.comunidades.find((c) => c.id === filtroEntidad)?.nombre ===
                      com.comunidad
                )
                .map((comunidad, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-6 space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {comunidad.comunidad}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Técnico:{" "}
                          <span className="font-semibold">
                            {comunidad.tecnico}
                          </span>
                        </p>
                      </div>
                      <span
                        className={`px-4 py-2 rounded-full text-sm font-bold text-white ${
                          comunidad.asistencia >= 80
                            ? "bg-green-600"
                            : comunidad.asistencia >= 60
                            ? "bg-yellow-600"
                            : "bg-red-600"
                        }`}
                      >
                        {comunidad.asistencia.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-xs text-blue-600 font-bold uppercase">
                          Participantes
                        </p>
                        <p className="text-2xl font-bold text-blue-900 mt-1">
                          {comunidad.participantes}
                        </p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <p className="text-xs text-green-600 font-bold uppercase">
                          Actividades
                        </p>
                        <p className="text-2xl font-bold text-green-900 mt-1">
                          {comunidad.actividades}
                        </p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <p className="text-xs text-purple-600 font-bold uppercase">
                          Asistencia
                        </p>
                        <p className="text-2xl font-bold text-purple-900 mt-1">
                          {comunidad.asistencia.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </Panel>
        )}

        {/* TAB: METAS */}
        {tabActivo === "metas" && (
          <Panel titulo="🎯 Metas y Objetivos">
            <TablaMetas metas={metas} />
          </Panel>
        )}

        {/* TAB: ALERTAS CON FILTROS */}
        {tabActivo === "alertas" && (
          <Panel titulo="⚠️ Alertas y Anomalías">
            <TablaAlertas
              alertas={alertas}
              filtroTecnico={filtroTecnico}
              filtroEntidad={filtroEntidad}
              usuarios={datos.usuarios}
              comunidades={datos.comunidades}
            />
          </Panel>
        )}

        {/* GENERADOR DE PDFs AL FINAL */}
        <GeneradorPDFs
          datos={datos}
          comparativasTecnicos={comparativasTecnicos}
          semanaActiva={semanaActiva}
          seguimientos={datos.seguimientos}
        />
      </div>
    </div>
  );
}