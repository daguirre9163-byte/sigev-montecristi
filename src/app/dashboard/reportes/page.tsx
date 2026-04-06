"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

// ============ HOOK: Cargar comunidades ============
function useCargarComunidades(userId: string | undefined) {
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, [userId]);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getComunidadesByTecnico(userId);
      setComunidades(data.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return { comunidades, loading, error, recargar: cargar };
}

// ============ HOOK: Cargar datos de asistencia ============
function useDatosAsistencia(userId: string | undefined, comunidadId: string) {
  const [participantes, setParticipantes] = useState<AsistenciaParticipante[]>([]);
  const [fechas, setFechas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (comunidadId && userId) {
      cargar();
    }
  }, [comunidadId, userId]);

  const cargar = useCallback(async () => {
    if (!userId || !comunidadId) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Obtener participantes activos de la comunidad
      const partQuery = query(
        collection(db, "participantes"),
        where("comunidadId", "==", comunidadId),
        where("estado", "==", "activo")
      );

      const partSnap = await getDocs(partQuery);
      const participantesMap = new Map<string, Participante>();

      partSnap.forEach((doc) => {
        participantesMap.set(doc.id, {
          id: doc.id,
          ...doc.data(),
        } as Participante);
      });

      // 2. Obtener seguimientos del técnico
      const segQuery = query(
        collection(db, "seguimientos"),
        where("tecnicoId", "==", userId),
        where("estado", "==", "enviado")
      );

      const segSnap = await getDocs(segQuery);

      const fechasSet = new Set<string>();
      const asistenciasMap = new Map<
        string,
        { [fecha: string]: boolean }
      >();

      // Inicializar asistencias vacías para todos los participantes
      participantesMap.forEach((p) => {
        asistenciasMap.set(p.id, {});
      });

      // Procesar seguimientos
      for (const docSeg of segSnap.docs) {
        const data = docSeg.data();

        if (!data.registros) continue;

        for (const registro of data.registros) {
          // Solo procesar registros de esta comunidad que fueron realizados
          if (
            registro.comunidadId === comunidadId &&
            registro.estadoActividad === "realizada" &&
            registro.fecha
          ) {
            fechasSet.add(registro.fecha);

            const asistentesIds = registro.asistentesIds || [];

            // Marcar asistencia para los que asistieron
            asistentesIds.forEach((id: string) => {
              if (asistenciasMap.has(id)) {
                const asistencias = asistenciasMap.get(id) || {};
                asistencias[registro.fecha] = true;
                asistenciasMap.set(id, asistencias);
              }
            });

            // Marcar inasistencia para los que no asistieron
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

      // 3. Construir array de participantes con asistencias
      const fechasOrdenadas = Array.from(fechasSet).sort();
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
        .sort((a, b) => a.nombres.localeCompare(b.nombres));

      setParticipantes(participantesConAsistencia);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId, comunidadId]);

  return { participantes, fechas, loading, error, recargar: cargar };
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
      className={`w-full p-4 rounded-lg shadow-md transition transform hover:scale-105 ${
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
    const presentes = Object.values(asistencias).filter((v) => v).length;
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
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
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
      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-blue-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">Total Participantes</p>
          <p className="text-2xl font-bold text-blue-800">{participantes.length}</p>
        </div>
        <div className="bg-blue-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">👨 Masculino</p>
          <p className="text-2xl font-bold text-blue-800">{estadisticas.porGenero.M}</p>
        </div>
        <div className="bg-pink-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">👩 Femenino</p>
          <p className="text-2xl font-bold text-pink-800">{estadisticas.porGenero.F}</p>
        </div>
        <div className="bg-purple-100 rounded-lg p-4 text-center">
          <p className="text-gray-700 text-sm font-semibold">Semanas Visitadas</p>
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

      {/* Botón Exportar */}
      <div className="flex justify-end">
        <button
          onClick={onExportar}
          disabled={procesando}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2"
        >
          📥 Exportar Excel
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gradient-to-r from-green-600 to-green-700 text-white sticky top-0">
            <tr>
              <th className="border border-gray-300 px-4 py-3 text-left font-bold sticky left-0 bg-green-600 z-20">
                N°
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-bold sticky left-12 bg-green-600 z-20 w-40">
                Nombres
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-bold sticky left-52 bg-green-600 z-20 w-40">
                Apellidos
              </th>
              <th className="border border-gray-300 px-4 py-3 text-center font-bold w-20">
                Edad
              </th>
              <th className="border border-gray-300 px-4 py-3 text-center font-bold w-16">
                Género
              </th>

              {/* Fechas */}
              {fechas.map((fecha) => (
                <th
                  key={fecha}
                  className="border border-gray-300 px-3 py-3 text-center font-bold bg-green-600 whitespace-nowrap text-sm"
                  title={fecha}
                >
                  {formatearFecha(fecha)}
                </th>
              ))}

              <th className="border border-gray-300 px-4 py-3 text-center font-bold bg-green-600 sticky right-0 z-20 w-24">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {participantes.map((p, index) => {
              const { presentes, total } = calcularAsistencias(p.asistencias);

              return (
                <tr key={p.participanteId} className="hover:bg-gray-50 transition">
                  <td className="border border-gray-300 px-4 py-2 font-semibold text-center sticky left-0 bg-white z-10">
                    {index + 1}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 font-semibold sticky left-12 bg-white z-10">
                    {p.nombres}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 sticky left-52 bg-white z-10">
                    {p.apellidos}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    {p.edad}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center font-semibold">
                    {p.genero === "M" ? "👨" : p.genero === "F" ? "👩" : "⚪"}
                  </td>

                  {/* Asistencias */}
                  {fechas.map((fecha) => (
                    <td
                      key={`${p.participanteId}-${fecha}`}
                      className="border border-gray-300 px-3 py-2 text-center font-bold text-lg"
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

                  <td className="border border-gray-300 px-4 py-2 text-center font-bold sticky right-0 bg-white z-10">
                    <span
                      className={`px-2 py-1 rounded text-sm font-semibold ${
                        presentes > 0
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {presentes}/{total}
                    </span>
                  </td>
                </tr>
              );
            })}

            {/* Fila de totales */}
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
                    className="border border-gray-300 px-3 py-3 text-center"
                  >
                    <div className="font-bold text-lg">{presentes}</div>
                    <div className="text-sm text-gray-600">{porcentaje}%</div>
                  </td>
                );
              })}

              <td className="border border-gray-300 px-4 py-3 text-center">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function ReportesPage() {
  const { user } = useAuth();
  const { comunidades, loading: loadingComunidades } = useCargarComunidades(
    user?.uid
  );

  const [comunidadSeleccionada, setComunidadSeleccionada] = useState("");
  const {
    participantes,
    fechas,
    loading: loadingAsistencia,
  } = useDatosAsistencia(user?.uid, comunidadSeleccionada);

  const [procesando, setProcesando] = useState(false);

  // Contar participantes por comunidad
  const participantesPorComunidad = useMemo(() => {
    const map = new Map<string, number>();

    if (comunidadSeleccionada) {
      // Cargar conteo para la comunidad seleccionada
      getDocs(
        query(
          collection(db, "participantes"),
          where("comunidadId", "==", comunidadSeleccionada),
          where("estado", "==", "activo")
        )
      ).then((snap) => {
        map.set(comunidadSeleccionada, snap.size);
      });
    }

    return map;
  }, [comunidadSeleccionada]);

  const [conteoParticipantes, setConteoParticipantes] = useState<
    Map<string, number>
  >(new Map());

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
          Género: p.genero === "M" ? "Masculino" : p.genero === "F" ? "Femenino" : "Otro",
        };

        fechas.forEach((fecha) => {
          fila[fecha] = p.asistencias[fecha] === true ? 1 : p.asistencias[fecha] === false ? 0 : "";
        });

        const { presentes, total } = {
          presentes: Object.values(p.asistencias).filter((v) => v).length,
          total: Object.values(p.asistencias).length,
        };
        fila["Total"] = `${presentes}/${total}`;

        return fila;
      });

      const worksheet = XLSX.utils.json_to_sheet(datos);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        comunidadSeleccionada
      );

      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const file = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const comunidad = comunidades.find((c) => c.id === comunidadSeleccionada);
      saveAs(file, `Asistencia_${comunidad?.nombre}.xlsx`);

      alert("Archivo exportado correctamente");
    } catch (error) {
      alert("Error al exportar");
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  if (loadingComunidades) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando comunidades...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            📊 Reportes de Asistencia
          </h1>
          <p className="text-gray-600 mt-1">
            Visualiza la asistencia semanal por comunidad
          </p>
        </div>

        {/* Comunidades */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            🏘️ Comunidades
          </h2>

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
        </div>

        {/* Tabla de Asistencia */}
        {comunidadSeleccionada && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              📋 Asistencia - {comunidades.find((c) => c.id === comunidadSeleccionada)?.nombre}
            </h2>

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
  );
}