"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

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
  genero: string;
  comunidadId: string;
  [key: string]: any;
}

interface Semana {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
  [key: string]: any;
}

interface Seguimiento {
  id: string;
  tecnicoId: string;
  semanaId: string;
  registros?: any[];
  estado: string;
  [key: string]: any;
}

interface AsistenciaParticipante {
  id: string;
  nombres: string;
  apellidos: string;
  edad: number;
  genero: string;
  asistencias: { [fecha: string]: boolean };
}

interface AlertaTecnico {
  tecnicoId: string;
  tecnico: string;
  comunidad: string;
  diasSinVisita: number;
  ultimaVisita: string;
  severidad: "alto" | "medio" | "bajo";
}

interface DatosComunidad {
  comunidad: Comunidad;
  tecnico: Usuario | null;
  participantes: AsistenciaParticipante[];
  fechas: string[];
  totalActividades: number;
  asistenciaPromedio: number;
  alertas: AlertaTecnico[];
}

interface Evidencia {
  id: string;
  fecha: string;
  comunidad: string;
  tecnico: string;
  tecnicoId: string;
  fotos: string[];
  pdf: string;
  actividadRealizada: string;
  porcentajeAsistencia: number;
}

// ============ HOOK: Cargar datos principales ============
function useDatosReportes() {
  const [data, setData] = useState({
    usuarios: [] as Usuario[],
    comunidades: [] as Comunidad[],
    semanas: [] as Semana[],
    seguimientos: [] as Seguimiento[],
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

      const [usuariosSnap, semanasSnap, segSnap] = await Promise.all([
        getDocs(collection(db, "usuarios")),
        getDocs(collection(db, "semanas")),
        getDocs(collection(db, "seguimientos")),
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
    <div
      className={`${color} rounded-lg p-6 text-white shadow-md hover:shadow-lg transition`}
    >
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

// ============ COMPONENTE: Vista de Comunidad ============
function VistaComunidad({
  datos,
  onVolver,
}: {
  datos: DatosComunidad;
  onVolver: () => void;
}) {
  const [exportando, setExportando] = useState(false);

  const estadisticas = useMemo(() => {
    const porFecha: { [fecha: string]: { presentes: number; total: number } } = {};

    datos.fechas.forEach((fecha) => {
      porFecha[fecha] = { presentes: 0, total: 0 };
    });

    datos.participantes.forEach((p) => {
      datos.fechas.forEach((fecha) => {
        porFecha[fecha].total++;
        if (p.asistencias[fecha] === true) {
          porFecha[fecha].presentes++;
        }
      });
    });

    return porFecha;
  }, [datos]);

  const handleExportarExcel = async () => {
    try {
      setExportando(true);

      const worksheetData = datos.participantes.map((p, idx) => {
        const fila: any = {
          "N°": idx + 1,
          Nombres: p.nombres,
          Apellidos: p.apellidos,
          Edad: p.edad,
          Género: p.genero,
        };

        datos.fechas.forEach((fecha) => {
          fila[fecha] =
            p.asistencias[fecha] === true
              ? 1
              : p.asistencias[fecha] === false
              ? 0
              : "";
        });

        return fila;
      });

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Asistencia");

      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const file = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      saveAs(file, `Asistencia_${datos.comunidad.nombre}.xlsx`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Botón Volver */}
      <button
        onClick={onVolver}
        className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-semibold transition"
      >
        ← Volver
      </button>

      {/* Encabezado */}
      <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
        <h2 className="text-3xl font-bold text-gray-900">
          {datos.comunidad.nombre}
        </h2>
        {datos.tecnico && (
          <p className="text-gray-600">
            Técnico asignado:{" "}
            <span className="font-semibold">{datos.tecnico.nombre}</span>
          </p>
        )}
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          titulo="Participantes"
          valor={datos.participantes.length}
          icono="👥"
          color="bg-blue-500"
        />
        <KPICard
          titulo="Actividades"
          valor={datos.totalActividades}
          icono="📋"
          color="bg-green-500"
        />
        <KPICard
          titulo="Semanas Visitadas"
          valor={datos.fechas.length}
          icono="📅"
          color="bg-purple-500"
        />
        <KPICard
          titulo="Asistencia Promedio"
          valor={`${datos.asistenciaPromedio.toFixed(1)}%`}
          icono="📊"
          color="bg-orange-500"
        />
      </div>

      {/* Botón Exportar */}
      <div className="flex justify-end">
        <button
          onClick={handleExportarExcel}
          disabled={exportando}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
        >
          📥 Exportar Excel
        </button>
      </div>

      {/* Tabla de Asistencia */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-green-600 to-green-700 text-white">
            <tr>
              <th className="px-6 py-3 text-left font-bold sticky left-0 bg-green-600 z-10">
                N°
              </th>
              <th className="px-6 py-3 text-left font-bold sticky left-12 bg-green-600 z-10 w-40">
                Nombres
              </th>
              <th className="px-6 py-3 text-left font-bold sticky left-52 bg-green-600 z-10 w-40">
                Apellidos
              </th>
              <th className="px-6 py-3 text-center font-bold w-20">Edad</th>
              <th className="px-6 py-3 text-center font-bold w-16">Género</th>

              {datos.fechas.map((fecha) => (
                <th
                  key={fecha}
                  className="px-3 py-3 text-center font-bold bg-green-600 whitespace-nowrap text-sm"
                  title={fecha}
                >
                  {new Date(fecha + "T00:00:00").toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                  })}
                </th>
              ))}

              <th className="px-4 py-3 text-center font-bold bg-green-600 sticky right-0 z-10 w-24">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {datos.participantes.map((p, index) => {
              const presentes = Object.values(p.asistencias).filter(
                (v) => v === true
              ).length;
              const total = Object.keys(p.asistencias).length;

              return (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-2 font-semibold text-center sticky left-0 bg-white z-10">
                    {index + 1}
                  </td>
                  <td className="px-6 py-2 font-semibold sticky left-12 bg-white z-10">
                    {p.nombres}
                  </td>
                  <td className="px-6 py-2 sticky left-52 bg-white z-10">
                    {p.apellidos}
                  </td>
                  <td className="px-6 py-2 text-center">{p.edad}</td>
                  <td className="px-6 py-2 text-center font-semibold">
                    {p.genero === "M" ? "👨" : p.genero === "F" ? "👩" : "⚪"}
                  </td>

                  {datos.fechas.map((fecha) => (
                    <td
                      key={`${p.id}-${fecha}`}
                      className="px-3 py-2 text-center font-bold"
                    >
                      {p.asistencias[fecha] === true ? (
                        <span className="text-green-600 bg-green-100 rounded px-2 py-1">
                          1
                        </span>
                      ) : p.asistencias[fecha] === false ? (
                        <span className="text-red-600 bg-red-100 rounded px-2 py-1">
                          0
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  ))}

                  <td className="px-4 py-2 text-center font-bold sticky right-0 bg-white z-10">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-semibold">
                      {presentes}/{total}
                    </span>
                  </td>
                </tr>
              );
            })}

            {/* Fila de totales */}
            <tr className="bg-gray-100 font-bold">
              <td colSpan={5} className="px-6 py-3 text-right">
                TOTAL ASISTENTES
              </td>

              {datos.fechas.map((fecha) => {
                const stats = estadisticas[fecha];
                const porcentaje =
                  stats.total > 0
                    ? Math.round((stats.presentes / stats.total) * 100)
                    : 0;

                return (
                  <td key={`total-${fecha}`} className="px-3 py-3 text-center">
                    <div className="font-bold">{stats.presentes}</div>
                    <div className="text-sm text-gray-600">{porcentaje}%</div>
                  </td>
                );
              })}

              <td className="px-4 py-3 text-center">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Alertas */}
      {datos.alertas.length > 0 && (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">⚠️ Alertas</h3>
          <div className="space-y-3">
            {datos.alertas.map((alerta, idx) => (
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
                <p className="font-bold text-gray-900">{alerta.comunidad}</p>
                <p className="text-sm text-gray-600">
                  {alerta.diasSinVisita} días sin visita - Última: {alerta.ultimaVisita}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE: Selector de Comunidades ============
function SelectorComunidades({
  comunidades,
  usuarios,
  onSeleccionar,
  cargando,
}: {
  comunidades: Comunidad[];
  usuarios: Usuario[];
  onSeleccionar: (comunidad: Comunidad) => void;
  cargando: boolean;
}) {
  const [tecnicoFiltro, setTecnicoFiltro] = useState("todos");
  const [expandido, setExpandido] = useState(false);

  const comunidadesFiltradas = useMemo(() => {
    if (tecnicoFiltro === "todos") return comunidades;
    return comunidades.filter((c) => c.tecnicoId === tecnicoFiltro);
  }, [comunidades, tecnicoFiltro]);

  const tecnicos = usuarios
    .filter((u) => u.rol === "tecnico" || u.rol === "admin")
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">🏘️ Comunidades</h2>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Filtrar por Técnico
          </label>
          <select
            value={tecnicoFiltro}
            onChange={(e) => {
              setTecnicoFiltro(e.target.value);
              setExpandido(true);
            }}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos los técnicos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            onClick={() => setExpandido(!expandido)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center justify-between"
          >
            <span>
              {expandido ? "▼" : "▶"} Mostrar Comunidades (
              {comunidadesFiltradas.length})
            </span>
          </button>

          {expandido && (
            <div className="mt-3 border rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
              {comunidadesFiltradas.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No hay comunidades para este técnico
                </p>
              ) : (
                comunidadesFiltradas.map((comunidad) => (
                  <button
                    key={comunidad.id}
                    onClick={() => {
                      onSeleccionar(comunidad);
                      setExpandido(false);
                    }}
                    disabled={cargando}
                    className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 disabled:opacity-50 rounded-lg border border-gray-200 hover:border-blue-400 transition space-y-1"
                  >
                    <p className="font-semibold text-gray-900">
                      {comunidad.nombre}
                    </p>
                    <p className="text-xs text-gray-600">
                      Técnico:{" "}
                      {usuarios.find((u) => u.id === comunidad.tecnicoId)
                        ?.nombre || "Desconocido"}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ COMPONENTE: Descargador de Evidencias ============
function DescargadorEvidencias({
  seguimientos,
  usuarios,
  comunidades,
}: {
  seguimientos: Seguimiento[];
  usuarios: Usuario[];
  comunidades: Comunidad[];
}) {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [tecnicoFiltro, setTecnicoFiltro] = useState("todos");
  const [comunidadFiltro, setComunidadFiltro] = useState("todas");
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [mostrarEvidencias, setMostrarEvidencias] = useState(false);

  const tecnicos = usuarios
    .filter((u) => u.rol === "tecnico" || u.rol === "admin")
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const handleFiltrar = () => {
    const evidenciasTemp: Evidencia[] = [];

    for (const seguimiento of seguimientos) {
      if (tecnicoFiltro !== "todos" && seguimiento.tecnicoId !== tecnicoFiltro)
        continue;

      if (!seguimiento.registros) continue;

      for (const registro of seguimiento.registros) {
        if (registro.estadoActividad !== "realizada") continue;

        if (comunidadFiltro !== "todas" && registro.comunidadId !== comunidadFiltro)
          continue;

        const fechaRegistro = new Date(registro.fecha);
        if (fechaInicio && fechaRegistro < new Date(fechaInicio)) continue;
        if (fechaFin && fechaRegistro > new Date(fechaFin)) continue;

        if (registro.evidenciasFotos?.length > 0 || registro.evidenciaListaPdf) {
          const tecnico = usuarios.find((u) => u.id === seguimiento.tecnicoId);
          evidenciasTemp.push({
            id: `${seguimiento.id}-${registro.comunidadNombre}`,
            fecha: registro.fecha,
            comunidad: registro.comunidadNombre,
            tecnico: tecnico?.nombre || "Desconocido",
            tecnicoId: seguimiento.tecnicoId,
            fotos: registro.evidenciasFotos || [],
            pdf: registro.evidenciaListaPdf || "",
            actividadRealizada: registro.actividadRealizada,
            porcentajeAsistencia: registro.porcentajeAsistencia || 0,
          });
        }
      }
    }

    setEvidencias(evidenciasTemp);
    setMostrarEvidencias(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">📸 Descargar Evidencias</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Fecha Inicio
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Fecha Fin
          </label>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Técnico
          </label>
          <select
            value={tecnicoFiltro}
            onChange={(e) => setTecnicoFiltro(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Comunidad
          </label>
          <select
            value={comunidadFiltro}
            onChange={(e) => setComunidadFiltro(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">Todas</option>
            {comunidades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleFiltrar}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition"
      >
        🔍 Buscar Evidencias
      </button>

      {mostrarEvidencias && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">
            Resultados: {evidencias.length} evidencias encontradas
          </h3>

          {evidencias.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 font-medium">
                No se encontraron evidencias con los filtros seleccionados
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {evidencias.map((evidencia) => (
                <div
                  key={evidencia.id}
                  className="border rounded-lg p-6 space-y-4"
                >
                  {/* Información de la evidencia */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded">
                    <div>
                      <p className="text-sm text-gray-600">Fecha</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(evidencia.fecha).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Comunidad</p>
                      <p className="font-semibold text-gray-900">
                        {evidencia.comunidad}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Técnico</p>
                      <p className="font-semibold text-gray-900">
                        {evidencia.tecnico}
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Actividad Realizada</p>
                    <p className="font-semibold text-gray-900">
                      {evidencia.actividadRealizada}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Asistencia: <span className="font-bold text-green-600">{evidencia.porcentajeAsistencia}%</span>
                    </p>
                  </div>

                  {/* Descargas */}
                  <div className="space-y-3">
                    {/* Fotos */}
                    {evidencia.fotos.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-3">
                          📷 Fotos ({evidencia.fotos.length})
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {evidencia.fotos.map((foto, idx) => (
                            <a
                              key={idx}
                              href={foto}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative group"
                            >
                              <img
                                src={foto}
                                alt={`Foto ${idx + 1}`}
                                className="w-full h-24 object-cover rounded-lg border border-gray-300 hover:border-blue-500 transition group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <span className="text-white font-bold">Descargar</span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PDF */}
                    {evidencia.pdf && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">
                          📄 Lista de Asistencia
                        </p>
                        <a
                          href={evidencia.pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-800 px-4 py-2 rounded-lg font-semibold transition"
                        >
                          📥 Descargar PDF
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE: Generador de PDFs ============
function GeneradorPDFs({
  datos: { usuarios, comunidades, seguimientos, semanas },
}: {
  datos: ReturnType<typeof useDatosReportes>;
}) {
  const [generando, setGenerando] = useState(false);
  const [semanaSeleccionada, setSemanaSeleccionada] = useState(
    semanas.find((s) => s.activa)?.id || semanas[0]?.id || ""
  );
  const [mesSeleccionado, setMesSeleccionado] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const generarPDFDistribucionTecnicos = async () => {
    try {
      setGenerando(true);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Encabezado
      doc.setFillColor(76, 175, 80);
      doc.rect(15, 10, 8, 8, "F");
      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.text("GAD Municipal del Cantón", 25, 12);
      doc.text("Montecristi", 25, 16);

      // Título
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "DISTRIBUCIÓN DE TÉCNICOS POR COMUNIDAD",
        pageWidth / 2,
        28,
        { align: "center" }
      );

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-ES")}`,
        pageWidth / 2,
        35,
        { align: "center" }
      );

      let yPosition = 45;

      // Procesar cada técnico
      const tecnicos = usuarios.filter((u) => u.rol === "tecnico" || u.rol === "admin");

      for (const tecnico of tecnicos) {
        const comunidadesTecnico = comunidades.filter(
          (c) => c.tecnicoId === tecnico.id
        );

        if (comunidadesTecnico.length === 0) continue;

        // Verificar espacio en página
        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = 20;
        }

        // Nombre técnico
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`Técnico: ${tecnico.nombre}`, 15, yPosition);
        yPosition += 8;

        // Tabla de comunidades
        const tableData = [];
        for (const comunidad of comunidadesTecnico) {
          const participantes = await getDocs(
            query(
              collection(db, "participantes"),
              where("comunidadId", "==", comunidad.id),
              where("estado", "==", "activo")
            )
          );

          tableData.push({
            Comunidad: comunidad.nombre,
            Participantes: participantes.size,
          });
        }

        autoTable(doc, {
          startY: yPosition,
          head: [["Comunidad", "# Participantes"]],
          body: tableData.map((row) => [row.Comunidad, row.Participantes]),
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 50, halign: "center" },
          },
          margin: { left: 20, right: 20 },
          didDrawPage: () => {},
        });

        yPosition = (doc as any).lastAutoTable.finalY + 8;
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

      doc.save("Distribucion_Tecnicos_Comunidades.pdf");
      alert("✅ PDF generado correctamente");
    } catch (error) {
      alert("❌ Error al generar PDF");
      console.error(error);
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFInformeSemanal = async () => {
    try {
      setGenerando(true);

      const semana = semanas.find((s) => s.id === semanaSeleccionada);
      if (!semana) {
        alert("Selecciona una semana");
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Encabezado
      doc.setFillColor(76, 175, 80);
      doc.rect(15, 10, 8, 8, "F");
      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.text("GAD Municipal del Cantón", 25, 12);
      doc.text("Montecristi", 25, 16);

      // Título
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "INFORME SEMANAL DE SEGUIMIENTOS",
        pageWidth / 2,
        28,
        { align: "center" }
      );

      // Información de la semana
      const infoData = [
        ["Período:", `${semana.fechaInicio} al ${semana.fechaFin}`],
        ["Generado:", new Date().toLocaleDateString("es-ES")],
      ];

      autoTable(doc, {
        startY: 35,
        head: [],
        body: infoData,
        columnStyles: {
          0: {
            cellWidth: 40,
            fontStyle: "bold",
            fillColor: [76, 175, 80],
            textColor: [255, 255, 255],
          },
          1: { cellWidth: pageWidth - 70 },
        },
        margin: { left: 20, right: 20 },
      });

      let yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Consolidado por técnico
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("CONSOLIDADO POR TÉCNICO", 20, yPosition);
      yPosition += 8;

      const semanaSeguimientos = seguimientos.filter(
        (s) => s.semanaId === semanaSeleccionada
      );

      const tableDataTecnicos = semanaSeguimientos.map((seg) => {
        const actividades =
          seg.registros?.filter((r) => r.estadoActividad === "realizada") || [];
        const asistenciaPromedio =
          actividades.length > 0
            ? Math.round(
                actividades.reduce(
                  (sum: number, a: any) =>
                    sum + (a.porcentajeAsistencia || 0),
                  0
                ) / actividades.length
              )
            : 0;

        return {
          Técnico:
            usuarios.find((u) => u.id === seg.tecnicoId)?.nombre ||
            "Desconocido",
          Actividades: actividades.length,
          "% Asistencia": asistenciaPromedio + "%",
          Estado: seg.estado === "enviado" ? "✅ Enviado" : "📝 Borrador",
        };
      });

      autoTable(doc, {
        startY: yPosition,
        head: [["Técnico", "Actividades", "% Asistencia", "Estado"]],
        body: tableDataTecnicos.map((row) => [
          row.Técnico,
          row.Actividades,
          row["% Asistencia"],
          row.Estado,
        ]),
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 40, halign: "center" },
          2: { cellWidth: 40, halign: "center" },
          3: { cellWidth: 40, halign: "center" },
        },
        margin: { left: 20, right: 20 },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Actividades por técnico
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("ACTIVIDADES REALIZADAS POR TÉCNICO", 20, yPosition);
      yPosition += 7;

      for (const seg of semanaSeguimientos) {
        const tecnico = usuarios.find((u) => u.id === seg.tecnicoId);
        const actividades =
          seg.registros?.filter((r) => r.estadoActividad === "realizada") || [];

        if (actividades.length === 0) continue;

        // Verificar espacio
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`${tecnico?.nombre || "Desconocido"}:`, 20, yPosition);
        yPosition += 5;

        const actividadesData = actividades.map((a: any) => [
          a.comunidadNombre,
          a.actividadRealizada,
          a.porcentajeAsistencia + "%",
          a.asistentesIds?.length || 0,
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [["Comunidad", "Actividad", "% Asistencia", "# Asistentes"]],
          body: actividadesData,
          columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 70 },
            2: { cellWidth: 35, halign: "center" },
            3: { cellWidth: 30, halign: "center" },
          },
          margin: { left: 20, right: 20 },
          fontSize: 8,
        });

        yPosition = (doc as any).lastAutoTable.finalY + 5;
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

      doc.save(`Informe_Semanal_${semana.fechaInicio}.pdf`);
      alert("✅ PDF generado correctamente");
    } catch (error) {
      alert("❌ Error al generar PDF");
      console.error(error);
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFInformeMensual = async () => {
    try {
      setGenerando(true);

      const [year, month] = mesSeleccionado.split("-");
      const iniciomes = new Date(Number(year), Number(month) - 1, 1);
      const finmes = new Date(Number(year), Number(month), 0);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Encabezado
      doc.setFillColor(76, 175, 80);
      doc.rect(15, 10, 8, 8, "F");
      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.text("GAD Municipal del Cantón", 25, 12);
      doc.text("Montecristi", 25, 16);

      // Título
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(
        "INFORME MENSUAL DE SEGUIMIENTOS",
        pageWidth / 2,
        28,
        { align: "center" }
      );

      const infoData = [
        [
          "Período:",
          `${iniciomes.toLocaleDateString("es-ES")} al ${finmes.toLocaleDateString("es-ES")}`,
        ],
        ["Generado:", new Date().toLocaleDateString("es-ES")],
      ];

      autoTable(doc, {
        startY: 35,
        head: [],
        body: infoData,
        columnStyles: {
          0: {
            cellWidth: 40,
            fontStyle: "bold",
            fillColor: [76, 175, 80],
            textColor: [255, 255, 255],
          },
          1: { cellWidth: pageWidth - 70 },
        },
        margin: { left: 20, right: 20 },
      });

      let yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Consolidado
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("CONSOLIDADO MENSUAL", 20, yPosition);
      yPosition += 8;

      const semanasDelMes = seguimientos.filter((s) => {
        const semanaInfo = semanas.find((sem) => sem.id === s.semanaId);
        if (!semanaInfo) return false;
        const fechaInicioSemana = new Date(semanaInfo.fechaInicio);
        return fechaInicioSemana >= iniciomes && fechaInicioSemana <= finmes;
      });

      const tableData = semanasDelMes.map((seg) => {
        const actividades =
          seg.registros?.filter((r) => r.estadoActividad === "realizada") || [];
        return {
          Técnico:
            usuarios.find((u) => u.id === seg.tecnicoId)?.nombre ||
            "Desconocido",
          Actividades: actividades.length,
          Asistentes: actividades.reduce(
            (sum: number, a: any) => sum + (a.asistentesIds?.length || 0),
            0
          ),
          "% Promedio":
            actividades.length > 0
              ? Math.round(
                  actividades.reduce(
                    (sum: number, a: any) =>
                      sum + (a.porcentajeAsistencia || 0),
                    0
                  ) / actividades.length
                ) + "%"
              : "-",
        };
      });

      autoTable(doc, {
        startY: yPosition,
        head: [["Técnico", "Actividades", "Asistentes", "% Promedio"]],
        body: tableData.map((row) => [
          row.Técnico,
          row.Actividades,
          row.Asistentes,
          row["% Promedio"],
        ]),
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 50, halign: "center" },
          2: { cellWidth: 50, halign: "center" },
          3: { cellWidth: 50, halign: "center" },
        },
        margin: { left: 20, right: 20 },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Actividades por técnico
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("ACTIVIDADES REALIZADAS POR TÉCNICO", 20, yPosition);
      yPosition += 7;

      for (const seg of semanasDelMes) {
        const tecnico = usuarios.find((u) => u.id === seg.tecnicoId);
        const actividades =
          seg.registros?.filter((r) => r.estadoActividad === "realizada") || [];

        if (actividades.length === 0) continue;

        // Verificar espacio
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`${tecnico?.nombre || "Desconocido"}:`, 20, yPosition);
        yPosition += 5;

        const actividadesData = actividades.map((a: any) => [
          a.comunidadNombre,
          a.actividadRealizada,
          a.porcentajeAsistencia + "%",
          a.asistentesIds?.length || 0,
          a.evidenciasFotos?.length ? "Sí" : "No",
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [["Comunidad", "Actividad", "% Asistencia", "# Asistentes", "Fotos"]],
          body: actividadesData,
          columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: 60 },
            2: { cellWidth: 30, halign: "center" },
            3: { cellWidth: 30, halign: "center" },
            4: { cellWidth: 25, halign: "center" },
          },
          margin: { left: 20, right: 20 },
          fontSize: 8,
        });

        yPosition = (doc as any).lastAutoTable.finalY + 5;
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

      doc.save(`Informe_Mensual_${mesSeleccionado}.pdf`);
      alert("✅ PDF generado correctamente");
    } catch (error) {
      alert("❌ Error al generar PDF");
      console.error(error);
    } finally {
      setGenerando(false);
    }
  };

  const generarPDFAlertas = async () => {
    try {
      setGenerando(true);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Encabezado
      doc.setFillColor(76, 175, 80);
      doc.rect(15, 10, 8, 8, "F");
      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.text("GAD Municipal del Cantón", 25, 12);
      doc.text("Montecristi", 25, 16);

      // Título
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("INFORME DE ALERTAS", pageWidth / 2, 28, {
        align: "center",
      });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-ES")}`,
        pageWidth / 2,
        35,
        { align: "center" }
      );

      let yPosition = 45;

      // Calcular alertas
      const alertas: any[] = [];

      for (const comunidad of comunidades) {
        const registrosComunidad = seguimientos.flatMap(
          (s) =>
            s.registros?.filter(
              (r) =>
                r.comunidadId === comunidad.id ||
                r.comunidadNombre === comunidad.nombre
            ) || []
        );

        const ultimaVisita =
          registrosComunidad.length > 0
            ? registrosComunidad.sort((a: any, b: any) =>
                new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
              )[0].fecha
            : "Sin visitas";

        const diasSinVisita =
          ultimaVisita === "Sin visitas"
            ? 999
            : Math.floor(
                (new Date().getTime() - new Date(ultimaVisita).getTime()) /
                  (1000 * 60 * 60 * 24)
              );

        if (diasSinVisita >= 14) {
          const tecnico = usuarios.find((u) => u.id === comunidad.tecnicoId);
          alertas.push({
            Comunidad: comunidad.nombre,
            Técnico: tecnico?.nombre || "Desconocido",
            "Días Sin Visita": diasSinVisita,
            "Última Visita": ultimaVisita,
            Severidad: diasSinVisita >= 21 ? "🔴 ALTO" : "🟡 MEDIO",
          });
        }
      }

      if (alertas.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.text(
          "✅ No hay alertas activas. Todas las comunidades están siendo visitadas regularmente.",
          20,
          yPosition
        );
      } else {
        autoTable(doc, {
          startY: yPosition,
          head: [["Comunidad", "Técnico", "Días Sin Visita", "Última Visita", "Severidad"]],
          body: alertas.map((row) => [
            row.Comunidad,
            row.Técnico,
            row["Días Sin Visita"],
            row["Última Visita"],
            row.Severidad,
          ]),
          columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 50 },
            2: { cellWidth: 45, halign: "center" },
            3: { cellWidth: 40, halign: "center" },
            4: { cellWidth: 35, halign: "center" },
          },
          margin: { left: 20, right: 20 },
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

      doc.save("Informe_Alertas.pdf");
      alert("✅ PDF generado correctamente");
    } catch (error) {
      alert("❌ Error al generar PDF");
      console.error(error);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">📄 Generar Reportes PDF</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Distribución de Técnicos */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Distribución de Técnicos</h3>
          <button
            onClick={generarPDFDistribucionTecnicos}
            disabled={generando}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
          >
            {generando ? "⏳ Generando..." : "👨‍💼 Generar PDF"}
          </button>
        </div>

        {/* Informe Semanal */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Informe Semanal</h3>
          <select
            value={semanaSeleccionada}
            onChange={(e) => setSemanaSeleccionada(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-green-500"
          >
            {semanas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fechaInicio} - {s.fechaFin}
              </option>
            ))}
          </select>
          <button
            onClick={generarPDFInformeSemanal}
            disabled={generando}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
          >
            {generando ? "⏳ Generando..." : "📅 Generar PDF"}
          </button>
        </div>

        {/* Informe Mensual */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Informe Mensual</h3>
          <input
            type="month"
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={generarPDFInformeMensual}
            disabled={generando}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
          >
            {generando ? "⏳ Generando..." : "📊 Generar PDF"}
          </button>
        </div>

        {/* Informe de Alertas */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Informe de Alertas</h3>
          <p className="text-sm text-gray-600">Comunidades sin visita 14+ días</p>
          <button
            onClick={generarPDFAlertas}
            disabled={generando}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
          >
            {generando ? "⏳ Generando..." : "⚠️ Generar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function ReportesInstitucionales() {
  const datos = useDatosReportes();
  const [comunidadSeleccionada, setComunidadSeleccionada] =
    useState<Comunidad | null>(null);
  const [datoComunidad, setDatoComunidad] = useState<DatosComunidad | null>(null);
  const [cargandoComunidad, setCargandoComunidad] = useState(false);

  const handleSeleccionarComunidad = async (comunidad: Comunidad) => {
    try {
      setCargandoComunidad(true);

      const tecnico = datos.usuarios.find(
        (u) => u.id === comunidad.tecnicoId
      ) || null;

      const partSnap = await getDocs(
        query(
          collection(db, "participantes"),
          where("comunidadId", "==", comunidad.id),
                    where("estado", "==", "activo")
        )
      );

      const participantesMap = new Map();
      partSnap.forEach((doc) => {
        participantesMap.set(doc.id, {
          id: doc.id,
          ...doc.data(),
        } as Participante);
      });

      const segSnap = await getDocs(collection(db, "seguimientos"));

      const fechasSet = new Set<string>();
      const asistenciasMap = new Map();

      participantesMap.forEach((p) => {
        asistenciasMap.set(p.id, {});
      });

      let totalActividades = 0;
      let sumaAsistencia = 0;
      let contadorActividades = 0;

      for (const docSeg of segSnap.docs) {
        const data = docSeg.data();
        if (!data.registros) continue;

        for (const registro of data.registros) {
          if (
            (registro.comunidadId === comunidad.id ||
              registro.comunidadNombre === comunidad.nombre) &&
            registro.estadoActividad === "realizada" &&
            registro.fecha
          ) {
            fechasSet.add(registro.fecha);
            totalActividades++;
            sumaAsistencia += registro.porcentajeAsistencia || 0;
            contadorActividades++;

            const asistentesIds = registro.asistentesIds || [];
            asistentesIds.forEach((id: string) => {
              if (asistenciasMap.has(id)) {
                const asistencias = asistenciasMap.get(id) || {};
                asistencias[registro.fecha] = true;
                asistenciasMap.set(id, asistencias);
              }
            });

            participantesMap.forEach((p) => {
              if (!asistentesIds.includes(p.id)) {
                const asistencias = asistenciasMap.get(p.id) || {};
                if (!(registro.fecha in asistencias)) {
                  asistencias[registro.fecha] = false;
                }
                asistenciasMap.set(p.id, asistencias);
              }
            });
          }
        }
      }

      const ultimaVisita =
        fechasSet.size > 0
          ? Array.from(fechasSet).sort().reverse()[0]
          : "Sin visitas";

      const diasSinVisita =
        ultimaVisita === "Sin visitas"
          ? 999
          : Math.floor(
              (new Date().getTime() - new Date(ultimaVisita).getTime()) /
                (1000 * 60 * 60 * 24)
            );

      const alertas: AlertaTecnico[] = [];
      if (diasSinVisita >= 14) {
        alertas.push({
          tecnicoId: tecnico?.id || "",
          tecnico: tecnico?.nombre || "Desconocido",
          comunidad: comunidad.nombre,
          diasSinVisita,
          ultimaVisita,
          severidad: diasSinVisita >= 21 ? "alto" : "medio",
        });
      }

      const fechasOrdenadas = Array.from(fechasSet).sort();

      const participantesConAsistencia = Array.from(participantesMap.values())
        .map((p) => ({
          id: p.id,
          nombres: p.nombres,
          apellidos: p.apellidos,
          edad: p.edad,
          genero: p.genero,
          asistencias: asistenciasMap.get(p.id) || {},
        }))
        .sort((a, b) => a.nombres.localeCompare(b.nombres));

      setDatoComunidad({
        comunidad,
        tecnico,
        participantes: participantesConAsistencia,
        fechas: fechasOrdenadas,
        totalActividades,
        asistenciaPromedio:
          contadorActividades > 0
            ? sumaAsistencia / contadorActividades
            : 0,
        alertas,
      });

      setComunidadSeleccionada(comunidad);
    } catch (error) {
      alert("Error al cargar datos de la comunidad");
      console.error(error);
    } finally {
      setCargandoComunidad(false);
    }
  };

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

  if (comunidadSeleccionada && datoComunidad) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <VistaComunidad
            datos={datoComunidad}
            onVolver={() => {
              setComunidadSeleccionada(null);
              setDatoComunidad(null);
            }}
          />
        </div>
      </div>
    );
  }

  const tecnicosYAdmins = datos.usuarios.filter(
    (u) => u.rol === "tecnico" || u.rol === "admin"
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            📊 Reportes Institucionales
          </h1>
          <p className="text-gray-600 mt-2">
            Vista integral de todas las comunidades, técnicos y actividades
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPICard
            titulo="Técnicos"
            valor={tecnicosYAdmins.length}
            icono="👨‍💼"
            color="bg-blue-500"
          />
          <KPICard
            titulo="Comunidades"
            valor={datos.comunidades.length}
            icono="🏘️"
            color="bg-green-500"
          />
          <KPICard
            titulo="Semanas"
            valor={datos.semanas.length}
            icono="📅"
            color="bg-purple-500"
          />
          <KPICard
            titulo="Seguimientos"
            valor={datos.seguimientos.length}
            icono="📋"
            color="bg-orange-500"
          />
        </div>

        {/* Generador de PDFs */}
        <GeneradorPDFs datos={datos} />

        {/* Descargador de Evidencias */}
        <DescargadorEvidencias
          seguimientos={datos.seguimientos}
          usuarios={datos.usuarios}
          comunidades={datos.comunidades}
        />

        {/* Selector de Comunidades */}
        <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">🏘️ Comunidades</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Filtrar por Técnico
              </label>
              <select
                id="tecnico-filter"
                onChange={(e) => {
                  const tecnicoId = e.target.value;
                  if (tecnicoId) {
                    const comunidadesTecnico = datos.comunidades.filter(
                      (c) => c.tecnicoId === tecnicoId
                    );
                    if (comunidadesTecnico.length > 0) {
                      handleSeleccionarComunidad(comunidadesTecnico[0]);
                    }
                  }
                }}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona un técnico para ver sus comunidades</option>
                {tecnicosYAdmins.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                O selecciona una comunidad directamente
              </label>
              <select
                onChange={(e) => {
                  const comunidad = datos.comunidades.find(
                    (c) => c.id === e.target.value
                  );
                  if (comunidad) {
                    handleSeleccionarComunidad(comunidad);
                  }
                }}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona una comunidad...</option>
                {datos.comunidades.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} -{" "}
                    {tecnicosYAdmins.find((t) => t.id === c.tecnicoId)
                      ?.nombre || "Sin asignar"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {cargandoComunidad && (
            <div className="text-center py-8">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p className="text-gray-600">Cargando datos de la comunidad...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}