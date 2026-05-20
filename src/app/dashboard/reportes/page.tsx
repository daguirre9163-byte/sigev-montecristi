"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// ============ TIPOS ============
interface Comunidad {
  id: string;
  nombre: string;
  tecnicoId: string;
  [key: string]: any;
}

interface Participante {
  id: string;
  nombres: string;
  apellidos: string;
  edad: number;
  genero: "M" | "F" | "O";
  estado?: string;
  [key: string]: any;
}

interface AsistenciaParticipante {
  participanteId: string;
  nombres: string;
  apellidos: string;
  edad: number;
  genero: "M" | "F" | "O";
  asistencias: {
    [fecha: string]: boolean;
  };
}

interface Semana {
  id: string;
  fechaInicio: string;
  fechaFin: string;
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
  [key: string]: any;
}

interface EventoGlobal {
  id: string;
  titulo: string;
  fecha: string;
  horario: string;
  lugar: string;
  objetivo: string;
  tipoEvento: string;
  estado?: string;
  confirmado?: boolean;
  createdAt?: any;
  [key: string]: any;
}

interface EventoConfirmado extends EventoGlobal {
  confirmado: boolean;
  tipoRespuesta: "reunion" | "encuentro";
}

// ============ HOOK: Cargar comunidades ============
function useCargarComunidades(userId: string | undefined) {
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getComunidadesByTecnico(userId);
      setComunidades(data.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar comunidades";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { comunidades, loading, error, recargar: cargar };
}

// ============ HOOK: Cargar datos de asistencia ============
function useDatosAsistencia(comunidadId: string) {
  const [participantes, setParticipantes] = useState<AsistenciaParticipante[]>([]);
  const [fechas, setFechas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizarFecha = (valor: any): string | null => {
    if (!valor) return null;

    if (typeof valor === "string") {
      const texto = valor.trim();

      if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return texto;
      }

      const fecha = new Date(texto);
      if (!isNaN(fecha.getTime())) {
        return fecha.toISOString().split("T")[0];
      }
    }

    if (valor instanceof Date && !isNaN(valor.getTime())) {
      return valor.toISOString().split("T")[0];
    }

    return null;
  };

  const cargar = useCallback(async () => {
    if (!comunidadId) {
      setParticipantes([]);
      setFechas([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Participantes activos de la comunidad
      const partQuery = query(
        collection(db, "participantes"),
        where("comunidadId", "==", comunidadId),
        where("estado", "==", "activo")
      );

      const partSnap = await getDocs(partQuery);
      const participantesMap = new Map<string, Participante>();

      partSnap.forEach((docSnap) => {
        participantesMap.set(docSnap.id, {
          id: docSnap.id,
          ...docSnap.data(),
        } as Participante);
      });

      if (participantesMap.size === 0) {
        setParticipantes([]);
        setFechas([]);
        return;
      }

      // 2. Todos los seguimientos enviados
      const segQuery = query(
        collection(db, "seguimientos"),
        where("estado", "==", "enviado")
      );

      const segSnap = await getDocs(segQuery);

      const fechasSet = new Set<string>();
      const asistenciasMap = new Map<string, { [fecha: string]: boolean }>();

      participantesMap.forEach((p) => {
        asistenciasMap.set(p.id, {});
      });

      for (const segDoc of segSnap.docs) {
        const data = segDoc.data();
        const actividades = Array.isArray(data.actividadesRegulares)
          ? data.actividadesRegulares
          : [];

        for (const actividad of actividades) {
          const mismaComunidad = actividad?.comunidadId === comunidadId;
          const realizada = actividad?.estadoActividad === "realizada";
          const fechaNormalizada = normalizarFecha(actividad?.fecha);
          const asistentesIds = Array.isArray(actividad?.asistentesIds)
            ? actividad.asistentesIds
            : [];

          if (!mismaComunidad || !realizada || !fechaNormalizada) {
            continue;
          }

          fechasSet.add(fechaNormalizada);

          // Presentes
          asistentesIds.forEach((id: string) => {
            if (participantesMap.has(id)) {
              const actual = asistenciasMap.get(id) || {};
              actual[fechaNormalizada] = true;
              asistenciasMap.set(id, actual);
            }
          });

          // Ausentes
          participantesMap.forEach((p) => {
            if (!asistentesIds.includes(p.id)) {
              const actual = asistenciasMap.get(p.id) || {};
              if (!(fechaNormalizada in actual)) {
                actual[fechaNormalizada] = false;
                asistenciasMap.set(p.id, actual);
              }
            }
          });
        }
      }

      const fechasOrdenadas = Array.from(fechasSet).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );
      setFechas(fechasOrdenadas);

      const participantesConAsistencia = Array.from(participantesMap.values())
        .map((p) => ({
          participanteId: p.id,
          nombres: p.nombres,
          apellidos: p.apellidos,
          edad: p.edad,
          genero: p.genero,
          asistencias: asistenciasMap.get(p.id) || {},
        }))
        .sort((a, b) => {
          const nombreA = `${a.nombres} ${a.apellidos}`.toLowerCase();
          const nombreB = `${b.nombres} ${b.apellidos}`.toLowerCase();
          return nombreA.localeCompare(nombreB);
        });

      setParticipantes(participantesConAsistencia);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar asistencia";
      setError(mensaje);
      console.error("Error cargando asistencia:", err);
    } finally {
      setLoading(false);
    }
  }, [comunidadId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { participantes, fechas, loading, error, recargar: cargar };
}

// ============ HOOK: Cargar agenda semanal ============
function useCargaAgendaSemanal(userId: string | undefined) {
  const [actividades, setActividades] = useState<ActividadPlanificada[]>([]);
  const [semanaActiva, setSemanaActiva] = useState<Semana | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const semana = await getSemanaActiva();
      if (!semana) {
        setError("No hay semana activa");
        return;
      }
      setSemanaActiva(semana);

      const planQuery = query(
        collection(db, "planificaciones"),
        where("semanaId", "==", semana.id),
        where("tecnicoId", "==", userId),
        where("estado", "==", "enviado")
      );

      const planSnap = await getDocs(planQuery);

      if (!planSnap.empty) {
        const planData = planSnap.docs[0].data();
        const actividadesOrdenadas = (planData.actividades || []).sort(
          (a: any, b: any) => {
            const fechaA = new Date(a.fecha).getTime();
            const fechaB = new Date(b.fecha).getTime();
            return fechaA - fechaB;
          }
        );
        setActividades(actividadesOrdenadas);
      } else {
        setActividades([]);
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar agenda";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { actividades, semanaActiva, loading, error, recargar: cargar };
}

// ============ HOOK: Cargar eventos globales ============
function useCargaEventosGlobales(userId: string | undefined) {
  const [eventosConfirmados, setEventosConfirmados] = useState<EventoConfirmado[]>([]);
  const [eventosHistorico, setEventosHistorico] = useState<EventoConfirmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Respuestas del técnico
      const respuestasQuery = query(
        collection(db, "respuestasEventos"),
        where("tecnicoId", "==", userId)
      );

      const respuestasSnap = await getDocs(respuestasQuery);
      const respuestasData = respuestasSnap.docs.map((d) => d.data());

      // 2. Todos los eventos globales
      const eventosSnap = await getDocs(collection(db, "eventosGlobales"));
      const todosEventos = eventosSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as EventoGlobal));

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const proximos: EventoConfirmado[] = [];
      const historico: EventoConfirmado[] = [];

      for (const evento of todosEventos) {
        const respuesta = respuestasData.find((r) => r.eventoId === evento.id);
        if (!respuesta) continue;

        const fechaEvento = new Date(evento.fecha);
        fechaEvento.setHours(0, 0, 0, 0);

        const eventoConfirmado: EventoConfirmado = {
          ...evento,
          confirmado: respuesta.confirmado ?? true,
          tipoRespuesta: (respuesta.tipoRespuesta || "reunion") as
            | "reunion"
            | "encuentro",
        };

        if (fechaEvento >= hoy) {
          proximos.push(eventoConfirmado);
        } else {
          historico.push(eventoConfirmado);
        }
      }

      proximos.sort(
        (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
      );
      historico.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      );

      setEventosConfirmados(proximos);
      setEventosHistorico(historico);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar eventos";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { eventosConfirmados, eventosHistorico, loading, error, recargar: cargar };
}

// ============ COMPONENTE: Card de Comunidad ============
interface CardComunidadProps {
  comunidad: Comunidad;
  numeroPar: number;
  seleccionada: boolean;
  onClick: () => void;
}

function CardComunidad({
  comunidad,
  numeroPar,
  seleccionada,
  onClick,
}: CardComunidadProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-lg shadow-md transition transform hover:scale-[1.02] ${
        seleccionada
          ? "bg-green-600 text-white border-2 border-green-800"
          : "bg-white text-gray-900 border-2 border-gray-300 hover:border-green-500"
      }`}
    >
      <h3 className="text-lg font-bold">{comunidad.nombre}</h3>
      <p className={`text-sm ${seleccionada ? "text-green-100" : "text-gray-600"}`}>
        👥 {numeroPar} participantes
      </p>
    </button>
  );
}

// ============ COMPONENTE: Tabla de Asistencia ============
interface TablaAsistenciaProps {
  participantes: AsistenciaParticipante[];
  fechas: string[];
  comunidadNombre: string;
  onExportar: () => void;
  procesando: boolean;
}

function TablaAsistencia({
  participantes,
  fechas,
  comunidadNombre,
  onExportar,
  procesando,
}: TablaAsistenciaProps) {
  const calcularAsistencias = (asistencias: { [fecha: string]: boolean }) => {
    const total = Object.values(asistencias).length;
    const presentes = Object.values(asistencias).filter(Boolean).length;
    return { presentes, total };
  };

  const estadisticas = useMemo(() => {
    const porFecha: { [fecha: string]: { presentes: number; total: number } } = {};
    const porGenero: { M: number; F: number; O: number } = { M: 0, F: 0, O: 0 };

    fechas.forEach((fecha) => {
      porFecha[fecha] = { presentes: 0, total: 0 };
    });

    participantes.forEach((p) => {
      porGenero[p.genero]++;

      fechas.forEach((fecha) => {
        porFecha[fecha].total++;
        if (p.asistencias[fecha] === true) {
          porFecha[fecha].presentes++;
        }
      });
    });

    return { porFecha, porGenero };
  }, [participantes, fechas]);

  const formatearFecha = (fecha: string) => {
    const date = new Date(fecha + "T00:00:00");
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });
  };

  if (participantes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-gray-500 text-lg">No hay datos de asistencia</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-blue-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">Total Participantes</p>
          <p className="text-2xl font-bold text-blue-800">{participantes.length}</p>
        </div>

        <div className="bg-sky-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">👨 Masculino</p>
          <p className="text-2xl font-bold text-sky-800">{estadisticas.porGenero.M}</p>
        </div>

        <div className="bg-pink-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">👩 Femenino</p>
          <p className="text-2xl font-bold text-pink-800">{estadisticas.porGenero.F}</p>
        </div>

        <div className="bg-purple-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">Fechas Registradas</p>
          <p className="text-2xl font-bold text-purple-800">{fechas.length}</p>
        </div>

        <div className="bg-green-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">Asistencia Promedio</p>
          <p className="text-2xl font-bold text-green-800">
            {fechas.length > 0
              ? Math.round(
                  (Object.values(estadisticas.porFecha).reduce(
                    (sum, f) => sum + (f.total > 0 ? (f.presentes / f.total) * 100 : 0),
                    0
                  ) /
                    fechas.length) *
                    100
                ) / 100
              : 0}
            %
          </p>
        </div>
      </div>

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-gray-900">
            Registro de asistencia - {comunidadNombre}
          </h4>
          <p className="text-sm text-gray-500">
            Fechas registradas desde el módulo de seguimiento.
          </p>
        </div>

        <button
          onClick={onExportar}
          disabled={procesando}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          📥 Exportar Excel
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-sm">
            <thead className="bg-gradient-to-r from-green-600 to-green-700 text-white">
              <tr>
                <th className="border border-green-500 px-3 py-3 text-center font-bold min-w-[60px]">
                  N°
                </th>
                <th className="border border-green-500 px-4 py-3 text-left font-bold min-w-[180px]">
                  Nombres
                </th>
                <th className="border border-green-500 px-4 py-3 text-left font-bold min-w-[180px]">
                  Apellidos
                </th>
                <th className="border border-green-500 px-3 py-3 text-center font-bold min-w-[70px]">
                  Edad
                </th>
                <th className="border border-green-500 px-3 py-3 text-center font-bold min-w-[90px]">
                  Género
                </th>

                {fechas.map((fecha) => (
                  <th
                    key={fecha}
                    title={fecha}
                    className="border border-green-500 px-2 py-3 text-center font-bold min-w-[78px] whitespace-nowrap"
                  >
                    {formatearFecha(fecha)}
                  </th>
                ))}

                <th className="border border-green-500 px-3 py-3 text-center font-bold min-w-[90px]">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {participantes.map((p, index) => {
                const { presentes, total } = calcularAsistencias(p.asistencias);

                return (
                  <tr key={p.participanteId} className="hover:bg-gray-50 transition">
                    <td className="border border-gray-200 px-3 py-3 text-center font-semibold">
                      {index + 1}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 font-semibold text-gray-900">
                      {p.nombres}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 text-gray-800">
                      {p.apellidos}
                    </td>
                    <td className="border border-gray-200 px-3 py-3 text-center">
                      {p.edad}
                    </td>
                    <td className="border border-gray-200 px-3 py-3 text-center font-semibold">
                      {p.genero === "M" ? "👨" : p.genero === "F" ? "👩" : "⚪"}
                    </td>

                    {fechas.map((fecha) => (
                      <td
                        key={`${p.participanteId}-${fecha}`}
                        className="border border-gray-200 px-2 py-3 text-center"
                      >
                        {p.asistencias[fecha] === true ? (
                          <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-md bg-green-100 text-green-700 font-bold">
                            1
                          </span>
                        ) : p.asistencias[fecha] === false ? (
                          <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-md bg-red-100 text-red-700 font-bold">
                            0
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    ))}

                    <td className="border border-gray-200 px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center min-w-[54px] px-3 py-1 rounded-md text-sm font-bold ${
                          total > 0
                            ? "bg-gray-100 text-gray-800"
                            : "bg-gray-50 text-gray-500"
                        }`}
                      >
                        {presentes}/{total}
                      </span>
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-gray-100 font-bold">
                <td colSpan={5} className="border border-gray-300 px-4 py-3 text-right">
                  TOTAL ASISTENTES
                </td>

                {fechas.map((fecha) => {
                  const { presentes, total } = estadisticas.porFecha[fecha];
                  const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

                  return (
                    <td
                      key={`total-${fecha}`}
                      className="border border-gray-300 px-2 py-3 text-center"
                    >
                      <div className="font-bold text-base">{presentes}</div>
                      <div className="text-xs text-gray-600">{porcentaje}%</div>
                    </td>
                  );
                })}

                <td className="border border-gray-300 px-3 py-3 text-center">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============ COMPONENTE: Agenda Semanal ============
interface AgendaSemanalProps {
  actividades: ActividadPlanificada[];
  semanaActiva: Semana | null;
}

function AgendaSemanal({ actividades, semanaActiva }: AgendaSemanalProps) {
  const formatearFecha = (fecha: string) => {
    const date = new Date(fecha + "T00:00:00");
    return date.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  if (!semanaActiva) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-gray-500 text-lg">No hay semana activa</p>
      </div>
    );
  }

  if (actividades.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-gray-500 text-lg">No hay actividades planificadas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {actividades.map((actividad, idx) => (
          <div
            key={idx}
            className="bg-white rounded-lg shadow-md p-5 border-l-4 border-blue-500 hover:shadow-lg transition"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Comunidad</p>
                  <p className="text-lg font-bold text-gray-900">📍 {actividad.comunidadNombre}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Fecha y Hora</p>
                  <p className="text-sm text-gray-700">📅 {formatearFecha(actividad.fecha)}</p>
                  <p className="text-sm text-gray-700">🕐 {actividad.horario}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Componente</p>
                  <p className="text-sm font-medium text-gray-900">{actividad.componente}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Actividad</p>
                  <p className="text-sm text-gray-800">{actividad.actividad}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    Objetivo Específico
                  </p>
                  <p className="text-sm text-gray-800">{actividad.objetivoEspecifico}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    Producto Esperado
                  </p>
                  <p className="text-sm text-gray-800">{actividad.productoEsperado}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ COMPONENTE: Eventos Globales ============
interface EventosGlobalesProps {
  eventosConfirmados: EventoConfirmado[];
  eventosHistorico: EventoConfirmado[];
}

function EventosGlobales({
  eventosConfirmados,
  eventosHistorico,
}: EventosGlobalesProps) {
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const formatearFecha = (fecha: string) => {
    const date = new Date(fecha + "T00:00:00");
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case "tecnicos":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "clubes":
      case "promotores":
      case "liderazgo":
        return "bg-orange-100 text-orange-800 border-orange-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getTipoIcono = (tipo: string) => {
    switch (tipo) {
      case "tecnicos":
        return "📋";
      case "clubes":
      case "promotores":
      case "liderazgo":
        return "📅";
      default:
        return "📌";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          📅 Eventos Próximos ({eventosConfirmados.length})
        </h3>

        {eventosConfirmados.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
            <p>No hay eventos próximos confirmados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {eventosConfirmados.map((evento) => (
              <div
                key={evento.id}
                className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500 hover:shadow-lg transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getTipoIcono(evento.tipoEvento)}</span>
                      <h4 className="text-lg font-bold text-gray-900">{evento.titulo}</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                      <div>
                        <p className="font-semibold">📅 Fecha:</p>
                        <p>{formatearFecha(evento.fecha)}</p>
                      </div>
                      <div>
                        <p className="font-semibold">🕐 Horario:</p>
                        <p>{evento.horario}</p>
                      </div>
                      <div>
                        <p className="font-semibold">📍 Lugar:</p>
                        <p>{evento.lugar}</p>
                      </div>
                      <div>
                        <p className="font-semibold">🎯 Objetivo:</p>
                        <p>{evento.objetivo}</p>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold border whitespace-nowrap ${getTipoColor(
                      evento.tipoEvento
                    )}`}
                  >
                    {evento.tipoEvento === "tecnicos" ? "Reunión" : "Encuentro"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => setMostrarHistorico(!mostrarHistorico)}
          className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 hover:text-blue-600 transition"
        >
          {mostrarHistorico ? "▼" : "▶"} 📊 Eventos Pasados ({eventosHistorico.length})
        </button>

        {mostrarHistorico && (
          <div className="grid grid-cols-1 gap-4">
            {eventosHistorico.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
                <p>No hay eventos pasados</p>
              </div>
            ) : (
              eventosHistorico.map((evento) => (
                <div
                  key={evento.id}
                  className="bg-gray-50 rounded-lg shadow-md p-4 border-l-4 border-gray-400 opacity-75"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{getTipoIcono(evento.tipoEvento)}</span>
                        <h4 className="text-lg font-bold text-gray-900">{evento.titulo}</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="font-semibold">📅 Fecha:</p>
                          <p>{formatearFecha(evento.fecha)}</p>
                        </div>
                        <div>
                          <p className="font-semibold">🕐 Horario:</p>
                          <p>{evento.horario}</p>
                        </div>
                        <div>
                          <p className="font-semibold">📍 Lugar:</p>
                          <p>{evento.lugar}</p>
                        </div>
                        <div>
                          <p className="font-semibold">🎯 Objetivo:</p>
                          <p>{evento.objetivo}</p>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold border whitespace-nowrap ${getTipoColor(
                        evento.tipoEvento
                      )}`}
                    >
                      {evento.tipoEvento === "tecnicos" ? "Reunión" : "Encuentro"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function MisReportesPage() {
  const { user } = useAuth();

  const { comunidades, loading: loadingComunidades, error: errorComunidades } =
    useCargarComunidades(user?.uid);

  const {
    actividades,
    semanaActiva,
    loading: loadingAgenda,
    error: errorAgenda,
  } = useCargaAgendaSemanal(user?.uid);

  const {
    eventosConfirmados,
    eventosHistorico,
    loading: loadingEventos,
    error: errorEventos,
  } = useCargaEventosGlobales(user?.uid);

  const [comunidadSeleccionada, setComunidadSeleccionada] = useState("");
  const {
    participantes,
    fechas,
    loading: loadingAsistencia,
    error: errorAsistencia,
  } = useDatosAsistencia(comunidadSeleccionada);

  const [procesando, setProcesando] = useState(false);
  const [conteoParticipantes, setConteoParticipantes] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    const cargarConteos = async () => {
      const map = new Map<string, number>();

      for (const comunidad of comunidades) {
        const snap = await getDocs(
          query(
            collection(db, "participantes"),
            where("comunidadId", "==", comunidad.id),
            where("estado", "==", "activo")
          )
        );
        map.set(comunidad.id, snap.size);
      }

      setConteoParticipantes(map);
    };

    if (comunidades.length > 0) {
      cargarConteos();
    }
  }, [comunidades]);

  const handleExportarExcel = () => {
    if (participantes.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    try {
      setProcesando(true);

      const datos = participantes.map((p, idx) => {
        const fila: any = {
          "N°": idx + 1,
          Nombres: p.nombres,
          Apellidos: p.apellidos,
          Edad: p.edad,
          Género:
            p.genero === "M"
              ? "Masculino"
              : p.genero === "F"
              ? "Femenino"
              : "Otro",
        };

        fechas.forEach((fecha) => {
          fila[fecha] =
            p.asistencias[fecha] === true ? 1 : p.asistencias[fecha] === false ? 0 : "";
        });

        const presentes = Object.values(p.asistencias).filter(Boolean).length;
        const total = Object.values(p.asistencias).length;
        fila["Total"] = `${presentes}/${total}`;

        return fila;
      });

      const worksheet = XLSX.utils.json_to_sheet(datos);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Asistencia");

      const buffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      const file = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const comunidad = comunidades.find((c) => c.id === comunidadSeleccionada);
      saveAs(file, `Asistencia_${comunidad?.nombre || "Comunidad"}.xlsx`);
    } catch (error) {
      alert("Error al exportar");
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  if (loadingComunidades || loadingAgenda || loadingEventos) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  const errorGeneral = errorComunidades || errorAgenda || errorEventos;

  if (errorGeneral) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">❌ {errorGeneral}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">📊 Mis Reportes</h1>
          <p className="text-gray-600 mt-1">
            Visualiza tu agenda semanal, eventos globales y asistencia por comunidad
          </p>
        </div>

        {/* SECCIÓN 1: AGENDA SEMANAL */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">📅 Agenda Semanal</h2>
          <AgendaSemanal actividades={actividades} semanaActiva={semanaActiva} />
        </div>

        {/* SECCIÓN 2: EVENTOS GLOBALES */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">🌍 Eventos Globales</h2>
          <EventosGlobales
            eventosConfirmados={eventosConfirmados}
            eventosHistorico={eventosHistorico}
          />
        </div>

        {/* SECCIÓN 3: ASISTENCIA POR COMUNIDAD */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">👥 Asistencia por Comunidad</h2>

          {/* Errores de asistencia */}
          {errorAsistencia && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 font-medium">⚠️ {errorAsistencia}</p>
            </div>
          )}

          {/* Comunidades */}
          {comunidades.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 font-medium">
                No tienes comunidades asignadas
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {comunidades.map((comunidad) => (
                <CardComunidad
                  key={comunidad.id}
                  comunidad={comunidad}
                  numeroPar={conteoParticipantes.get(comunidad.id) || 0}
                  seleccionada={comunidadSeleccionada === comunidad.id}
                  onClick={() => setComunidadSeleccionada(comunidad.id)}
                />
              ))}
            </div>
          )}

          {/* Tabla de Asistencia */}
          {comunidadSeleccionada && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                📋 Asistencia -{" "}
                {comunidades.find((c) => c.id === comunidadSeleccionada)?.nombre}
              </h3>

              {loadingAsistencia ? (
                <div className="flex items-center justify-center p-8">
                  <div className="text-center space-y-4">
                    <div className="animate-spin text-3xl">⏳</div>
                    <p className="text-gray-600">Cargando asistencia...</p>
                  </div>
                </div>
              ) : (
                <TablaAsistencia
                  participantes={participantes}
                  fechas={fechas}
                  comunidadNombre={
                    comunidades.find((c) => c.id === comunidadSeleccionada)?.nombre || ""
                  }
                  onExportar={handleExportarExcel}
                  procesando={procesando}
                />
              )}
            </div>
          )}

          {/* Mensaje cuando no hay comunidad seleccionada */}
          {!comunidadSeleccionada && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
              <p className="text-blue-800 text-lg font-medium">
                👆 Selecciona una comunidad para ver la asistencia semanal
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}