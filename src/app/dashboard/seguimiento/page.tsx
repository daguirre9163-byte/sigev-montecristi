"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { db, storage } from "@/lib/firebase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addDoc,
  updateDoc,
  doc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

// ============ TIPOS ============
interface Semana {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  [key: string]: any;
}

interface Participante {
  id: string;
  nombres: string;
  apellidos: string;
  edad?: number;
  sexo?: string;
  comunidadId: string;
  estado: string;
  [key: string]: any;
}

// ============ ACTIVIDADES REGULARES (de Planificación) ============
interface ActividadRegular {
  comunidadId: string;
  comunidadNombre: string;
  actividadPlanificada: string;
  actividadRealizada: string;
  tipoEjecucionActividad: "planificada" | "modificada";
  motivoCambioActividad: string;
  asistentesIds: string[];
  porcentajeAsistencia: number;
  evidenciasFotos: string[];
  evidenciaListaPdf: string;
  fecha: string;
  estadoActividad: "realizada" | "suspendida" | "cancelada" | "reprogramada";
  motivoNoRealizada: string;
  fechaReprogramada: string;
}

// ============ EVENTOS GLOBALES EN SEGUIMIENTO (Reuniones) ============
interface SeguimientoReunion {
  eventoId: string;
  eventoTitulo: string;
  fecha: string;
  horario: string;
  lugar: string;
  objetivo: string;
  
  // Confirmación (de Planificación)
  confirmado: boolean;
  
  // Ejecución (de Seguimiento)
  ejecutado: boolean;
  estado: "realizada" | "cancelada" | "suspendida";
  motivoNoEjecucion?: string;
  observaciones: string;
}

// ============ EVENTOS GLOBALES EN SEGUIMIENTO (Encuentros) ============
interface SeguimientoEncuentro {
  eventoId: string;
  eventoTitulo: string;
  tipoEvento: "clubes" | "promotores" | "liderazgo";
  fecha: string;
  horario: string;
  lugar: string;
  objetivo: string;
  
  // Confirmación (de Planificación)
  confirmado: boolean;
  comunidadesConfirmadas: Array<{
    comunidadId: string;
    comunidadNombre: string;
    participa: "si" | "no";
  }>;
  
  // Ejecución (de Seguimiento)
  ejecutado: boolean;
  estado: "realizada" | "cancelada" | "suspendida";
  motivoNoEjecucion?: string;
  
  comunidadesEjecutadas: Array<{
    comunidadId: string;
    comunidadNombre: string;
    actividadRealizada: string;
    asistentesIds: string[];
    porcentajeAsistencia: number;
    evidenciasFotos: string[];
    observaciones: string;
  }>;
}

interface Alerta {
  id: string;
  eventoId: string;
  tecnicoId: string;
  tipo: "reunion" | "actividad";
  titulo: string;
  estado: "pendiente" | "confirmado";
  createdAt?: any;
  [key: string]: any;
}

// ============ ESTRUCTURA PRINCIPAL DE SEGUIMIENTO ============
interface Seguimiento {
  id?: string;
  semanaId: string;
  tecnicoId: string;
  estado: "borrador" | "enviado";
  
  // Secciones
  actividadesRegulares: ActividadRegular[];
  reuniones: SeguimientoReunion[];
  encuentros: SeguimientoEncuentro[];
  
  // Metadata
  fechaActualizacion?: any;
  createdAt?: any;
}

// ============ HOOK: Cargar datos ============
function useCargarDatos(userId: string | undefined) {
  const [semanaActiva, setSemanaActiva] = useState<Semana | null>(null);
  const [actividadesRegulares, setActividadesRegulares] = useState<ActividadRegular[]>([]);
  const [reuniones, setReuniones] = useState<SeguimientoReunion[]>([]);
  const [encuentros, setEncuentros] = useState<SeguimientoEncuentro[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // 1️⃣ Cargar semana activa
      const semana = await getSemanaActiva();
      if (!semana) {
        setError("No hay semana activa");
        return;
      }
      setSemanaActiva(semana);

      // 2️⃣ Cargar seguimiento existente
      const segQuery = query(
        collection(db, "seguimientos"),
        where("semanaId", "==", semana.id),
        where("tecnicoId", "==", userId)
      );

      const segSnap = await getDocs(segQuery);

      if (!segSnap.empty) {
        const segData = segSnap.docs[0].data() as Seguimiento;
        setActividadesRegulares(segData.actividadesRegulares || []);
        setReuniones(segData.reuniones || []);
        setEncuentros(segData.encuentros || []);
      } else {
        // 3️⃣ Si no existe, crear desde Planificación y Respuestas de Eventos
        await crearSeguimientoInicial(semana.id, userId);
      }

      // 4️⃣ Cargar alertas
      const alertasQuery = query(
        collection(db, "alertas"),
        where("tecnicoId", "==", userId),
        where("estado", "==", "pendiente")
      );
      const alertasSnap = await getDocs(alertasQuery);
      setAlertas(
        alertasSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Alerta))
      );
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar datos";
      setError(mensaje);
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

const crearSeguimientoInicial = async (semanaId: string, userId: string) => {
    try {
      // 📋 Obtener planificación enviada
      const planQuery = query(
        collection(db, "planificaciones"),
        where("semanaId", "==", semanaId),
        where("tecnicoId", "==", userId),
        where("estado", "==", "enviado")
      );

      const planSnap = await getDocs(planQuery);

      if (!planSnap.empty) {
        const planData = planSnap.docs[0].data();
        
        // Crear actividades regulares base
        const actBase: ActividadRegular[] = (planData.actividades || []).map(
          (act: any) => ({
            comunidadId: act.comunidadId,
            comunidadNombre: act.comunidadNombre,
            actividadPlanificada: act.actividad,
            actividadRealizada: "",
            tipoEjecucionActividad: "planificada",
            motivoCambioActividad: "",
            asistentesIds: [],
            porcentajeAsistencia: 0,
            evidenciasFotos: [],
            evidenciaListaPdf: "",
            fecha: act.fecha || "",
            estadoActividad: "realizada",
            motivoNoRealizada: "",
            fechaReprogramada: "",
          })
        );

        setActividadesRegulares(actBase);
      }

      // 🔔 Obtener eventos globales confirmados
      const respuestasQuery = query(
        collection(db, "respuestasEventos"),
        where("tecnicoId", "==", userId)
      );

      const respuestasSnap = await getDocs(respuestasQuery);
      const respuestasData = respuestasSnap.docs.map((d) => d.data());
      const eventosIds = respuestasData.map((r) => r.eventoId);

      if (eventosIds.length > 0) {
        // Obtener todos los eventos
        const eventosSnap = await getDocs(
          collection(db, "eventosGlobales")
        );
        
        const todosEventos = eventosSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Obtener todas las comunidades para mapear nombres
        const comunidadesSnap = await getDocs(
          collection(db, "comunidades")
        );
        const todasComunidades = new Map(
          comunidadesSnap.docs.map((d) => [d.id, d.data().nombre])
        );

        const eventosDelTecnico = todosEventos.filter((e) =>
          eventosIds.includes(e.id)
        );

        // Separar en reuniones y encuentros
        const reunionesBase: SeguimientoReunion[] = [];
        const encuentrosBase: SeguimientoEncuentro[] = [];

        for (const evento of eventosDelTecnico) {
          const respuestaData = respuestasData.find(
            (r) => r.eventoId === evento.id
          );

          if (evento.tipoEvento === "tecnicos") {
            // 🟢 REUNIÓN
            reunionesBase.push({
              eventoId: evento.id,
              eventoTitulo: evento.titulo,
              fecha: evento.fecha,
              horario: evento.horario,
              lugar: evento.lugar,
              objetivo: evento.objetivo,
              confirmado: respuestaData?.confirmado || false,
              ejecutado: false,
              estado: "realizada",
              observaciones: "",
            });
          } else {
            // 🟠 ENCUENTRO (clubes, promotores, liderazgo)
            const comunidadesConfirmadas = Object.entries(
              respuestaData?.respuestas || {}
            ).map(([comId, respuesta]: [string, any]) => ({
              comunidadId: comId,
              comunidadNombre: todasComunidades.get(comId) || respuesta.comunidadNombre || comId, // ✅ OBTENER DEL MAP
              participa: respuesta.participa,
            }));

            encuentrosBase.push({
              eventoId: evento.id,
              eventoTitulo: evento.titulo,
              tipoEvento: evento.tipoEvento,
              fecha: evento.fecha,
              horario: evento.horario,
              lugar: evento.lugar,
              objetivo: evento.objetivo,
              confirmado: true,
              comunidadesConfirmadas,
              ejecutado: false,
              estado: "realizada",
              comunidadesEjecutadas: comunidadesConfirmadas
                .filter((c) => c.participa === "si")
                .map((c) => ({
                  comunidadId: c.comunidadId,
                  comunidadNombre: c.comunidadNombre, // ✅ AHORA TIENE EL NOMBRE CORRECTO
                  actividadRealizada: "",
                  asistentesIds: [],
                  porcentajeAsistencia: 0,
                  evidenciasFotos: [],
                  observaciones: "",
                })),
            });
          }
        }

        setReuniones(reunionesBase);
        setEncuentros(encuentrosBase);
      }
    } catch (err) {
      console.error("Error al crear seguimiento inicial:", err);
    }
  };

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    semanaActiva,
    actividadesRegulares,
    setActividadesRegulares,
    reuniones,
    setReuniones,
    encuentros,
    setEncuentros,
    alertas,
    loading,
    error,
    recargar: cargar,
  };
}

// ============ HOOK: Storage ============
function useStorage() {
  const subirArchivo = useCallback(async (file: File, ruta: string) => {
    try {
      const storageRef = ref(storage, ruta);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error al subir archivo:", error);
      throw error;
    }
  }, []);

  const eliminarArchivo = useCallback(async (urlPath: string) => {
    try {
      const storageRef = ref(storage, urlPath);
      await deleteObject(storageRef);
    } catch (error) {
      console.error("Error al eliminar archivo:", error);
    }
  }, []);

  return { subirArchivo, eliminarArchivo };
}

// ============ HOOK: Guardar Seguimiento ============
function useSeguimiento(userId: string | undefined, semanaId: string | undefined) {
  const [seguimientoId, setSeguimientoId] = useState<string | null>(null);
  const [estadoSeguimiento, setEstadoSeguimiento] = useState<"borrador" | "enviado">(
    "borrador"
  );
  const [bloqueado, setBloqueado] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const cargarSeguimiento = useCallback(async () => {
    if (!userId || !semanaId) return;

    try {
      const segQuery = query(
        collection(db, "seguimientos"),
        where("semanaId", "==", semanaId),
        where("tecnicoId", "==", userId)
      );

      const segSnap = await getDocs(segQuery);

      if (!segSnap.empty) {
        const segDoc = segSnap.docs[0];
        const segData = segDoc.data();

        setSeguimientoId(segDoc.id);
        setEstadoSeguimiento(segData.estado);

        if (segData.estado === "enviado") {
          setBloqueado(true);
        }
      }
    } catch (error) {
      console.error("Error al cargar seguimiento:", error);
    }
  }, [userId, semanaId]);

  useEffect(() => {
    cargarSeguimiento();
  }, [cargarSeguimiento]);

  const guardarSeguimiento = useCallback(
    async (
      actividadesRegulares: ActividadRegular[],
      reuniones: SeguimientoReunion[],
      encuentros: SeguimientoEncuentro[],
      nuevoEstado: "borrador" | "enviado"
    ) => {
      if (!userId || !semanaId) return false;

      try {
        setProcesando(true);

        const data: Seguimiento = {
          semanaId,
          tecnicoId: userId,
          actividadesRegulares,
          reuniones,
          encuentros,
          estado: nuevoEstado,
          fechaActualizacion: serverTimestamp(),
        };

        if (seguimientoId) {
          await updateDoc(doc(db, "seguimientos", seguimientoId), data);
        } else {
          const docRef = await addDoc(collection(db, "seguimientos"), {
            ...data,
            createdAt: serverTimestamp(),
          });
          setSeguimientoId(docRef.id);
        }

        setEstadoSeguimiento(nuevoEstado);

        if (nuevoEstado === "enviado") {
          setBloqueado(true);
        }

        return true;
      } catch (error) {
        console.error("Error al guardar seguimiento:", error);
        return false;
      } finally {
        setProcesando(false);
      }
    },
    [userId, semanaId, seguimientoId]
  );

  return {
    seguimientoId,
    estadoSeguimiento,
    bloqueado,
    procesando,
    guardarSeguimiento,
  };
}

// ============ COMPONENTE: Registro Actividad Regular ============
interface RegistroActividadRegularProps {
  actividad: ActividadRegular;
  index: number;
  bloqueado: boolean;
  participantes: Participante[];
  onActividadChange: (index: number, actividad: ActividadRegular) => void;
  onCargarParticipantes: (index: number) => void;
  onToggleAsistencia: (index: number, participanteId: string) => void;
  onSubirFoto: (index: number, file: File) => Promise<void>;
  onEliminarFoto: (index: number, fotoIndex: number) => Promise<void>;
  onSubirPDF: (index: number, file: File) => Promise<void>;
  onEliminarPDF: (index: number) => void;
}

function RegistroActividadRegular({
  actividad,
  index,
  bloqueado,
  participantes,
  onActividadChange,
  onCargarParticipantes,
  onToggleAsistencia,
  onSubirFoto,
  onEliminarFoto,
  onSubirPDF,
  onEliminarPDF,
}: RegistroActividadRegularProps) {
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [cargandoPDF, setCargandoPDF] = useState(false);
  const [busquedaParticipantes, setBusquedaParticipantes] = useState("");

  const participantesFiltrados = useMemo(() => {
    if (!busquedaParticipantes.trim()) return participantes;

    return participantes.filter((p) =>
      `${p.nombres} ${p.apellidos}`
        .toLowerCase()
        .includes(busquedaParticipantes.toLowerCase())
    );
  }, [participantes, busquedaParticipantes]);

  const handleSeleccionarTodos = useCallback(() => {
    if (bloqueado) return;

    const nuevaActividad = { ...actividad };
    if (actividad.asistentesIds.length === participantes.length) {
      nuevaActividad.asistentesIds = [];
      nuevaActividad.porcentajeAsistencia = 0;
    } else {
      nuevaActividad.asistentesIds = participantes.map((p) => p.id);
      nuevaActividad.porcentajeAsistencia = 100;
    }

    onActividadChange(index, nuevaActividad);
  }, [actividad, participantes, index, bloqueado, onActividadChange]);

  const handleLimpiar = useCallback(() => {
    if (bloqueado) return;

    const nuevaActividad = { ...actividad };
    nuevaActividad.asistentesIds = [];
    nuevaActividad.porcentajeAsistencia = 0;

    onActividadChange(index, nuevaActividad);
  }, [actividad, index, bloqueado, onActividadChange]);

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (actividad.estadoActividad !== "realizada") {
      alert("La actividad no se realizó");
      return;
    }

    try {
      setCargandoFoto(true);
      await onSubirFoto(index, file);
      alert("✅ Foto subida");
    } catch (error) {
      alert("❌ Error al subir foto");
    } finally {
      setCargandoFoto(false);
    }
  };

  const handlePDFChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (actividad.estadoActividad !== "realizada") {
      alert("La actividad no se realizó");
      return;
    }

    try {
      setCargandoPDF(true);
      await onSubirPDF(index, file);
      alert("✅ PDF subido");
    } catch (error) {
      alert("❌ Error al subir PDF");
    } finally {
      setCargandoPDF(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border-l-4 border-blue-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            📍 {actividad.comunidadNombre}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {actividad.actividadPlanificada}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            actividad.estadoActividad === "realizada"
              ? "bg-green-100 text-green-800"
              : actividad.estadoActividad === "suspendida"
              ? "bg-yellow-100 text-yellow-800"
              : actividad.estadoActividad === "cancelada"
              ? "bg-red-100 text-red-800"
              : "bg-orange-100 text-orange-800"
          }`}
        >
          {actividad.estadoActividad === "realizada" && "✅"}
          {actividad.estadoActividad === "suspendida" && "⏸️"}
          {actividad.estadoActividad === "cancelada" && "❌"}
          {actividad.estadoActividad === "reprogramada" && "🔄"}
          {actividad.estadoActividad}
        </span>
      </div>

      {/* Grid de información */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
        <div>
          <p className="text-xs text-gray-600 uppercase font-semibold">Fecha</p>
          <p className="font-medium text-gray-900">{actividad.fecha || "No definida"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600 uppercase font-semibold">Asistencia</p>
          <p className="font-medium text-gray-900">{actividad.porcentajeAsistencia}%</p>
        </div>
      </div>

      {/* Actividad realizada */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Actividad Realizada
        </label>
        <input
          type="text"
          placeholder="Describe la actividad ejecutada"
          value={actividad.actividadRealizada}
          onChange={(e) =>
            onActividadChange(index, {
              ...actividad,
              actividadRealizada: e.target.value,
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
      </div>

      {/* Tipo de ejecución */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tipo de Ejecución
        </label>
        <select
          value={actividad.tipoEjecucionActividad}
          onChange={(e) =>
            onActividadChange(index, {
              ...actividad,
              tipoEjecucionActividad: e.target.value as any,
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value="planificada">Planificada</option>
          <option value="modificada">Diferente a lo planificado</option>
        </select>
      </div>

      {actividad.tipoEjecucionActividad === "modificada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motivo del cambio
          </label>
          <textarea
            placeholder="¿Por qué cambió la actividad?"
            value={actividad.motivoCambioActividad}
            onChange={(e) =>
              onActividadChange(index, {
                ...actividad,
                motivoCambioActividad: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}

      {/* Estado de la actividad */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estado
        </label>
        <select
          value={actividad.estadoActividad}
          onChange={(e) =>
            onActividadChange(index, {
              ...actividad,
              estadoActividad: e.target.value as any,
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value="realizada">✅ Realizada</option>
          <option value="suspendida">⏸️ Suspendida</option>
          <option value="cancelada">❌ Cancelada</option>
          <option value="reprogramada">🔄 Reprogramada</option>
        </select>
      </div>

      {actividad.estadoActividad !== "realizada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motivo
          </label>
          <textarea
            placeholder="¿Por qué no se realizó?"
            value={actividad.motivoNoRealizada}
            onChange={(e) =>
              onActividadChange(index, {
                ...actividad,
                motivoNoRealizada: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}

      {actividad.estadoActividad === "reprogramada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nueva fecha
          </label>
          <input
            type="date"
            value={actividad.fechaReprogramada}
            onChange={(e) =>
              onActividadChange(index, {
                ...actividad,
                fechaReprogramada: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>
      )}

      {/* Participantes */}
      {actividad.estadoActividad === "realizada" && (
        <>
          <button
            onClick={() => onCargarParticipantes(index)}
            disabled={bloqueado}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
          >
            👥 Cargar Participantes ({participantes.length})
          </button>

          {participantes.length > 0 && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-gray-900">
                      Asistencia: {actividad.porcentajeAsistencia}%
                    </h4>
                    <p className="text-sm text-gray-600">
                      {actividad.asistentesIds.length} de {participantes.length}
                    </p>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="🔍 Buscar por nombre..."
                  value={busquedaParticipantes}
                  onChange={(e) => setBusquedaParticipantes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 text-sm mb-3"
                />

                <div className="flex gap-2 flex-wrap mb-3">
                  <button
                    onClick={handleSeleccionarTodos}
                    disabled={bloqueado}
                    className="px-4 py-2 rounded-lg font-medium text-sm bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
                  >
                    ✓ Todos
                  </button>

                  <button
                    onClick={handleLimpiar}
                    disabled={bloqueado || actividad.asistentesIds.length === 0}
                    className="px-4 py-2 rounded-lg font-medium text-sm bg-red-100 hover:bg-red-200 text-red-800 transition disabled:opacity-50"
                  >
                    ✕ Limpiar
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-300 rounded-lg p-2 bg-white">
                {participantesFiltrados.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">Sin resultados</p>
                ) : (
                  participantesFiltrados.map((participante) => (
                    <label
                      key={participante.id}
                      className="flex items-center gap-3 p-3 hover:bg-blue-50 rounded cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={actividad.asistentesIds.includes(participante.id)}
                        onChange={() => onToggleAsistencia(index, participante.id)}
                        disabled={bloqueado}
                        className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">
                          {participante.nombres} {participante.apellidos}
                        </p>
                        {participante.edad && (
                          <p className="text-xs text-gray-600">📅 {participante.edad} años</p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          actividad.asistentesIds.includes(participante.id)
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {actividad.asistentesIds.includes(participante.id)
                          ? "Presente"
                          : "Ausente"}
                      </span>
                    </label>
                  ))
                )}
              </div>

              {/* Evidencias */}
              <div className="pt-4 border-t border-gray-300 space-y-4">
                {/* Fotos */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📷 Fotos
                  </label>

                  {!bloqueado && actividad.estadoActividad === "realizada" && (
                    <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition">
                      {cargandoFoto ? "⏳" : "📷"} {cargandoFoto ? "Subiendo..." : "Subir"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFotoChange}
                        disabled={cargandoFoto}
                        className="hidden"
                      />
                    </label>
                  )}

                  {actividad.evidenciasFotos.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {actividad.evidenciasFotos.map((url, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={url}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-300"
                          />
                          {!bloqueado && (
                            <button
                              onClick={() => onEliminarFoto(index, i)}
                              className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* PDF */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📄 Lista de Asistencia
                  </label>

                  {!bloqueado && actividad.estadoActividad === "realizada" && (
                    <label className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition">
                      {cargandoPDF ? "⏳" : "📄"} {cargandoPDF ? "Subiendo..." : "Subir"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePDFChange}
                        disabled={cargandoPDF}
                        className="hidden"
                      />
                    </label>
                  )}

                  {actividad.evidenciaListaPdf && (
                    <div className="mt-3 flex items-center gap-2 bg-white p-3 rounded-lg border border-purple-300">
                      <span>📄</span>
                      <a
                        href={actividad.evidenciaListaPdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-purple-600 hover:text-purple-700 font-medium hover:underline"
                      >
                        Ver PDF
                      </a>
                      {!bloqueado && (
                        <button
                          onClick={() => onEliminarPDF(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ COMPONENTE: Registro Reunión ============
interface RegistroReunionProps {
  reunion: SeguimientoReunion;
  index: number;
  bloqueado: boolean;
  onReunionChange: (index: number, reunion: SeguimientoReunion) => void;
}

function RegistroReunion({
  reunion,
  index,
  bloqueado,
  onReunionChange,
}: RegistroReunionProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border-l-4 border-yellow-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            📋 {reunion.eventoTitulo}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {new Date(reunion.fecha).toLocaleDateString("es-ES")} | {reunion.horario} | {reunion.lugar}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            reunion.estado === "realizada"
              ? "bg-green-100 text-green-800"
              : reunion.estado === "suspendida"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {reunion.estado === "realizada" && "✅"}
          {reunion.estado === "suspendida" && "⏸️"}
          {reunion.estado === "cancelada" && "❌"}
          {reunion.estado}
        </span>
      </div>

      {/* Información general */}
      <div className="bg-blue-50 p-4 rounded border border-blue-200">
        <p className="text-sm text-gray-700">
          <strong>Confirmado:</strong> {reunion.confirmado ? "✅ Sí" : "❌ No"}
        </p>
        <p className="text-sm text-gray-700 mt-2">
          <strong>🎯 Objetivo:</strong> {reunion.objetivo}
        </p>
      </div>

      {/* Estado de ejecución */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estado de Ejecución
        </label>
        <select
          value={reunion.estado}
          onChange={(e) =>
            onReunionChange(index, {
              ...reunion,
              estado: e.target.value as any,
              ejecutado: e.target.value === "realizada",
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-100"
        >
          <option value="realizada">✅ Realizada</option>
          <option value="suspendida">⏸️ Suspendida</option>
          <option value="cancelada">❌ Cancelada</option>
        </select>
      </div>

      {reunion.estado !== "realizada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motivo
          </label>
          <textarea
            placeholder="¿Por qué no se realizó?"
            value={reunion.motivoNoEjecucion || ""}
            onChange={(e) =>
              onReunionChange(index, {
                ...reunion,
                motivoNoEjecucion: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}

      {reunion.estado === "realizada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            placeholder="Notas adicionales sobre la reunión"
            value={reunion.observaciones}
            onChange={(e) =>
              onReunionChange(index, {
                ...reunion,
                observaciones: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE: Registro Encuentro (VERSIÓN CORREGIDA) ============
interface RegistroEncuentroProps {
  encuentro: SeguimientoEncuentro;
  index: number;
  bloqueado: boolean;
  participantes: Participante[];
  onEncuentroChange: (index: number, encuentro: SeguimientoEncuentro) => void;
  onCargarParticipantes: (index: number, comunidadId: string) => void;
  onToggleAsistencia: (index: number, comunidadIdx: number, participanteId: string) => void;
  onSubirFoto: (index: number, comunidadIdx: number, file: File) => Promise<void>;
  onEliminarFoto: (index: number, comunidadIdx: number, fotoIndex: number) => Promise<void>;
}

function RegistroEncuentro({
  encuentro,
  index,
  bloqueado,
  participantes,
  onEncuentroChange,
  onCargarParticipantes,
  onToggleAsistencia,
  onSubirFoto,
  onEliminarFoto,
}: RegistroEncuentroProps) {
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());
  const [busquedaParticipantes, setBusquedaParticipantes] = useState<Record<number, string>>({});
  const [cargandoFoto, setCargandoFoto] = useState<Record<string, boolean>>({});
  const [participantesCargados, setParticipantesCargados] = useState<Record<number, Participante[]>>({});

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border-l-4 border-orange-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            📅 {encuentro.eventoTitulo}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {new Date(encuentro.fecha).toLocaleDateString("es-ES")} | {encuentro.horario} | {encuentro.lugar}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            encuentro.estado === "realizada"
              ? "bg-green-100 text-green-800"
              : encuentro.estado === "suspendida"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {encuentro.estado === "realizada" && "✅"}
          {encuentro.estado === "suspendida" && "⏸️"}
          {encuentro.estado === "cancelada" && "❌"}
          {encuentro.estado}
        </span>
      </div>

      {/* Información general */}
      <div className="bg-blue-50 p-4 rounded border border-blue-200">
        <p className="text-sm text-gray-700">
          <strong>Tipo:</strong> {encuentro.tipoEvento}
        </p>
        <p className="text-sm text-gray-700 mt-2">
          <strong>🎯 Objetivo:</strong> {encuentro.objetivo}
        </p>
      </div>

      {/* Estado de ejecución */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estado de Ejecución
        </label>
        <select
          value={encuentro.estado}
          onChange={(e) =>
            onEncuentroChange(index, {
              ...encuentro,
              estado: e.target.value as any,
              ejecutado: e.target.value === "realizada",
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
        >
          <option value="realizada">✅ Realizada</option>
          <option value="suspendida">⏸️ Suspendida</option>
          <option value="cancelada">❌ Cancelada</option>
        </select>
      </div>

      {encuentro.estado !== "realizada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motivo
          </label>
          <textarea
            placeholder="¿Por qué no se realizó?"
            value={encuentro.motivoNoEjecucion || ""}
            onChange={(e) =>
              onEncuentroChange(index, {
                ...encuentro,
                motivoNoEjecucion: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}

      {/* Comunidades confirmadas */}
      {encuentro.estado === "realizada" && encuentro.comunidadesConfirmadas.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-bold text-gray-900">Comunidades Participantes</h4>

          {encuentro.comunidadesConfirmadas
            .filter((c) => c.participa === "si")
            .map((comunidad, comIdx) => {
              const ej = encuentro.comunidadesEjecutadas.find(
                (e) => e.comunidadId === comunidad.comunidadId
              ) || {
                comunidadId: comunidad.comunidadId,
                comunidadNombre: comunidad.comunidadNombre,
                actividadRealizada: "",
                asistentesIds: [],
                porcentajeAsistencia: 0,
                evidenciasFotos: [],
                observaciones: "",
              };

              // Índice real del array comunidadesEjecutadas
              const indexEj = encuentro.comunidadesEjecutadas.findIndex(
                (e) => e.comunidadId === comunidad.comunidadId
              );

              // Participantes de esta comunidad
              const participantesComunidad =
                participantesCargados[comIdx] ||
                participantes.filter((p) => p.comunidadId === comunidad.comunidadId);

              return (
                <div
                  key={comIdx}
                  className="border rounded-lg p-4 space-y-3 bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900">
                      📍 {comunidad.comunidadNombre}
                    </h5>
                    <button
                      onClick={() => {
                        const nueva = new Set(expandidas);
                        if (nueva.has(comIdx)) {
                          nueva.delete(comIdx);
                        } else {
                          nueva.add(comIdx);
                        }
                        setExpandidas(nueva);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {expandidas.has(comIdx) ? "▼ Ocultar detalles" : "▶ Mostrar detalles"}
                    </button>
                  </div>

                  {expandidas.has(comIdx) && (
                    <div className="space-y-3 ml-4 bg-white p-3 rounded">
                      {/* Actividad realizada */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Actividad Realizada
                        </label>
                        <input
                          type="text"
                          placeholder="¿Qué se ejecutó?"
                          value={ej.actividadRealizada}
                          onChange={(e) => {
                            const nuevosEj = [...encuentro.comunidadesEjecutadas];
                            
                            if (indexEj >= 0) {
                              nuevosEj[indexEj] = {
                                ...nuevosEj[indexEj],
                                actividadRealizada: e.target.value,
                              };
                            } else {
                              nuevosEj.push({
                                ...ej,
                                actividadRealizada: e.target.value,
                              });
                            }
                            
                            onEncuentroChange(index, {
                              ...encuentro,
                              comunidadesEjecutadas: nuevosEj,
                            });
                          }}
                          disabled={bloqueado}
                          className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                        />
                      </div>

                      {/* Observaciones */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Observaciones
                        </label>
                        <textarea
                          placeholder="Notas adicionales"
                          value={ej.observaciones}
                          onChange={(e) => {
                            const nuevosEj = [...encuentro.comunidadesEjecutadas];
                            
                            if (indexEj >= 0) {
                              nuevosEj[indexEj] = {
                                ...nuevosEj[indexEj],
                                observaciones: e.target.value,
                              };
                            } else {
                              nuevosEj.push({
                                ...ej,
                                observaciones: e.target.value,
                              });
                            }
                            
                            onEncuentroChange(index, {
                              ...encuentro,
                              comunidadesEjecutadas: nuevosEj,
                            });
                          }}
                          disabled={bloqueado}
                          className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                          rows={2}
                        />
                      </div>

                      {/* Botón cargar participantes */}
                      <button
                        onClick={async () => {
                          await onCargarParticipantes(index, comunidad.comunidadId);
                          
                          // Cargar participantes de esta comunidad
                          try {
                            const q = query(
                              collection(db, "participantes"),
                              where("comunidadId", "==", comunidad.comunidadId),
                              where("estado", "==", "activo")
                            );

                            const snapshot = await getDocs(q);
                            const lista = snapshot.docs.map((d) => ({
                              id: d.id,
                              ...d.data(),
                            } as Participante));

                            setParticipantesCargados((prev) => ({
                              ...prev,
                              [comIdx]: lista,
                            }));
                          } catch (err) {
                            alert("Error al cargar participantes");
                            console.error(err);
                          }
                        }}
                        disabled={bloqueado || participantesComunidad.length > 0}
                        className="w-full text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-2 rounded-lg transition"
                      >
                        👥 Cargar Participantes ({participantesComunidad.length})
                      </button>

                      {/* Lista de asistencia */}
                      {participantesComunidad.length > 0 && (
                        <div className="space-y-2 bg-white p-3 rounded border border-gray-300">
                          <div>
                            <p className="font-semibold text-sm text-gray-900">
                              Asistencia: {ej.porcentajeAsistencia}% ({ej.asistentesIds.length}/{participantesComunidad.length})
                            </p>
                          </div>

                          <input
                            type="text"
                            placeholder="🔍 Buscar participante..."
                            value={busquedaParticipantes[comIdx] || ""}
                            onChange={(e) =>
                              setBusquedaParticipantes({
                                ...busquedaParticipantes,
                                [comIdx]: e.target.value,
                              })
                            }
                            className="w-full border border-gray-300 rounded p-2 text-sm mb-2"
                          />

                          <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                            {participantesComunidad
                              .filter((p) =>
                                `${p.nombres} ${p.apellidos}`
                                  .toLowerCase()
                                  .includes(
                                    (busquedaParticipantes[comIdx] || "").toLowerCase()
                                  )
                              )
                              .map((participante) => (
                                <label
                                  key={participante.id}
                                  className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={ej.asistentesIds.includes(participante.id)}
                                    onChange={() => {
                                      const nuevosEj = [...encuentro.comunidadesEjecutadas];
                                      let ejActualizado = { ...ej };

                                      if (indexEj >= 0) {
                                        ejActualizado = nuevosEj[indexEj];
                                      }

                                      const asistentes = ejActualizado.asistentesIds;
                                      if (asistentes.includes(participante.id)) {
                                        ejActualizado.asistentesIds = asistentes.filter(
                                          (id) => id !== participante.id
                                        );
                                      } else {
                                        ejActualizado.asistentesIds.push(participante.id);
                                      }

                                      // Calcular porcentaje
                                      ejActualizado.porcentajeAsistencia =
                                        participantesComunidad.length > 0
                                          ? Math.round(
                                              (ejActualizado.asistentesIds.length /
                                                participantesComunidad.length) *
                                                100
                                            )
                                          : 0;

                                      if (indexEj >= 0) {
                                        nuevosEj[indexEj] = ejActualizado;
                                      } else {
                                        nuevosEj.push(ejActualizado);
                                      }

                                      onEncuentroChange(index, {
                                        ...encuentro,
                                        comunidadesEjecutadas: nuevosEj,
                                      });
                                    }}
                                    disabled={bloqueado}
                                    className="w-4 h-4"
                                  />
                                  <span className="font-medium">
                                    {participante.nombres} {participante.apellidos}
                                  </span>
                                  <span
                                    className={`ml-auto text-xs px-2 py-1 rounded font-semibold ${
                                      ej.asistentesIds.includes(participante.id)
                                        ? "bg-green-100 text-green-800"
                                        : "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {ej.asistentesIds.includes(participante.id)
                                      ? "Presente"
                                      : "Ausente"}
                                  </span>
                                </label>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Fotos */}
                      <div className="pt-3 border-t border-gray-300">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          📷 Fotos
                        </label>

                        {!bloqueado && (
                          <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded font-medium cursor-pointer text-sm transition">
                            📷 Subir
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    setCargandoFoto({
                                      ...cargandoFoto,
                                      [`${index}_${comIdx}`]: true,
                                    });
                                    await onSubirFoto(index, comIdx, file);
                                    alert("✅ Foto subida");
                                  } catch (err) {
                                    alert("❌ Error al subir foto");
                                  } finally {
                                    setCargandoFoto({
                                      ...cargandoFoto,
                                      [`${index}_${comIdx}`]: false,
                                    });
                                  }
                                }
                              }}
                              disabled={cargandoFoto[`${index}_${comIdx}`]}
                              className="hidden"
                            />
                          </label>
                        )}

                        {ej.evidenciasFotos.length > 0 && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {ej.evidenciasFotos.map((url, fIdx) => (
                              <div key={fIdx} className="relative group">
                                <img
                                  src={url}
                                  alt={`Foto ${fIdx + 1}`}
                                  className="w-full h-16 object-cover rounded border border-gray-300"
                                />
                                {!bloqueado && (
                                  <button
                                    onClick={() => onEliminarFoto(index, comIdx, fIdx)}
                                    className="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {ej.evidenciasFotos.length === 0 && (
                          <p className="text-xs text-gray-500 mt-1">Sin fotos aún</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function SeguimientoPage() {
  const { user } = useAuth();

  const {
    semanaActiva,
    actividadesRegulares,
    setActividadesRegulares,
    reuniones,
    setReuniones,
    encuentros,
    setEncuentros,
    alertas,
    loading,
    error,
  } = useCargarDatos(user?.uid);

  const {
    estadoSeguimiento,
    bloqueado,
    procesando,
    guardarSeguimiento,
  } = useSeguimiento(user?.uid, semanaActiva?.id);

  const { subirArchivo, eliminarArchivo } = useStorage();

  const [participantesPorActividad, setParticipantesPorActividad] = useState<
    Record<string, Participante[]>
  >({});

  // MANEJADORES ACTIVIDADES REGULARES
  const handleActividadChange = useCallback(
    (index: number, actividad: ActividadRegular) => {
      const nuevas = [...actividadesRegulares];
      nuevas[index] = actividad;
      setActividadesRegulares(nuevas);
    },
    [actividadesRegulares, setActividadesRegulares]
  );

  const handleCargarParticipantesActividad = useCallback(
    async (index: number) => {
      const actividad = actividadesRegulares[index];

      if (actividad.estadoActividad !== "realizada") {
        alert("La actividad no se realizó");
        return;
      }

      try {
        const q = query(
          collection(db, "participantes"),
          where("comunidadId", "==", actividad.comunidadId),
          where("estado", "==", "activo")
        );

        const snapshot = await getDocs(q);
        const lista = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Participante));

        setParticipantesPorActividad((prev) => ({
          ...prev,
          [index]: lista,
        }));
      } catch (err) {
        alert("Error al cargar participantes");
        console.error(err);
      }
    },
    [actividadesRegulares]
  );

  const handleToggleAsistenciaActividad = useCallback(
    (regIndex: number, participanteId: string) => {
      if (bloqueado) return;

      const nuevas = [...actividadesRegulares];
      const asistentes = nuevas[regIndex].asistentesIds;

      if (asistentes.includes(participanteId)) {
        nuevas[regIndex].asistentesIds = asistentes.filter(
          (id) => id !== participanteId
        );
      } else {
        nuevas[regIndex].asistentesIds.push(participanteId);
      }

      const total = participantesPorActividad[regIndex]?.length || 0;
      const count = nuevas[regIndex].asistentesIds.length;

      nuevas[regIndex].porcentajeAsistencia =
        total > 0 ? Math.round((count / total) * 100) : 0;

      setActividadesRegulares(nuevas);
    },
    [actividadesRegulares, participantesPorActividad, bloqueado, setActividadesRegulares]
  );

  const handleSubirFotoActividad = useCallback(
    async (index: number, file: File) => {
      if (!user || bloqueado) return;

      try {
        const ruta = `seguimientos/${user.uid}/fotos/${Date.now()}_${file.name}`;
        const url = await subirArchivo(file, ruta);

        const nuevas = [...actividadesRegulares];
        nuevas[index].evidenciasFotos.push(url);
        setActividadesRegulares(nuevas);
      } catch (error) {
        throw error;
      }
    },
    [user, bloqueado, actividadesRegulares, setActividadesRegulares, subirArchivo]
  );

  const handleEliminarFotoActividad = useCallback(
    async (index: number, fotoIndex: number) => {
      if (bloqueado) return;

      const nuevas = [...actividadesRegulares];
      const url = nuevas[index].evidenciasFotos[fotoIndex];

      try {
        await eliminarArchivo(url);
      } catch (error) {
        console.error(error);
      }

      nuevas[index].evidenciasFotos.splice(fotoIndex, 1);
      setActividadesRegulares(nuevas);
    },
    [actividadesRegulares, bloqueado, setActividadesRegulares, eliminarArchivo]
  );

  const handleSubirPDFActividad = useCallback(
    async (index: number, file: File) => {
      if (!user || bloqueado) return;

      try {
        const ruta = `seguimientos/${user.uid}/listas/${Date.now()}_${file.name}`;
        const url = await subirArchivo(file, ruta);

        const nuevas = [...actividadesRegulares];
        nuevas[index].evidenciaListaPdf = url;
        setActividadesRegulares(nuevas);
      } catch (error) {
        throw error;
      }
    },
    [user, bloqueado, actividadesRegulares, setActividadesRegulares, subirArchivo]
  );

  const handleEliminarPDFActividad = useCallback(
    (index: number) => {
      if (bloqueado) return;

      const nuevas = [...actividadesRegulares];
      nuevas[index].evidenciaListaPdf = "";
      setActividadesRegulares(nuevas);
    },
    [actividadesRegulares, bloqueado, setActividadesRegulares]
  );

  // MANEJADORES REUNIONES
  const handleReunionChange = useCallback(
    (index: number, reunion: SeguimientoReunion) => {
      const nuevas = [...reuniones];
      nuevas[index] = reunion;
      setReuniones(nuevas);
    },
    [reuniones, setReuniones]
  );

  // MANEJADORES ENCUENTROS
  const handleEncuentroChange = useCallback(
    (index: number, encuentro: SeguimientoEncuentro) => {
      const nuevos = [...encuentros];
      nuevos[index] = encuentro;
      setEncuentros(nuevos);
    },
    [encuentros, setEncuentros]
  );

  const handleCargarParticipantesEncuentro = useCallback(
    async (eventoIdx: number, comunidadId: string) => {
      try {
        const q = query(
          collection(db, "participantes"),
          where("comunidadId", "==", comunidadId),
          where("estado", "==", "activo")
        );

        const snapshot = await getDocs(q);
        const lista = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Participante));

        setParticipantesPorActividad((prev) => ({
          ...prev,
          [`encuentro_${eventoIdx}_${comunidadId}`]: lista,
        }));
      } catch (err) {
        alert("Error al cargar participantes");
        console.error(err);
      }
    },
    []
  );

  const handleToggleAsistenciaEncuentro = useCallback(
    (eventoIdx: number, comIdx: number, participanteId: string) => {
      if (bloqueado) return;

      const nuevos = [...encuentros];
      const encuentro = nuevos[eventoIdx];
      const ej = encuentro.comunidadesEjecutadas[comIdx];

      if (!ej) return;

      if (ej.asistentesIds.includes(participanteId)) {
        ej.asistentesIds = ej.asistentesIds.filter((id) => id !== participanteId);
      } else {
        ej.asistentesIds.push(participanteId);
      }

      // Calcular porcentaje
      const comunidad = encuentro.comunidadesConfirmadas[comIdx];
      const participantesCom = (
        participantesPorActividad[`encuentro_${eventoIdx}_${comunidad.comunidadId}`] || []
      ).filter((p) => p.comunidadId === comunidad.comunidadId);

      ej.porcentajeAsistencia =
        participantesCom.length > 0
          ? Math.round((ej.asistentesIds.length / participantesCom.length) * 100)
          : 0;

      setEncuentros(nuevos);
    },
    [encuentros, participantesPorActividad, bloqueado, setEncuentros]
  );

  const handleSubirFotoEncuentro = useCallback(
    async (eventoIdx: number, comIdx: number, file: File) => {
      if (!user || bloqueado) return;

      try {
        const ruta = `seguimientos/${user.uid}/eventos/${Date.now()}_${file.name}`;
        const url = await subirArchivo(file, ruta);

        const nuevos = [...encuentros];
        nuevos[eventoIdx].comunidadesEjecutadas[comIdx].evidenciasFotos.push(url);
        setEncuentros(nuevos);
      } catch (error) {
        throw error;
      }
    },
    [user, bloqueado, encuentros, setEncuentros, subirArchivo]
  );

  const handleEliminarFotoEncuentro = useCallback(
    async (eventoIdx: number, comIdx: number, fotoIndex: number) => {
      if (bloqueado) return;

      const nuevos = [...encuentros];
      const url = nuevos[eventoIdx].comunidadesEjecutadas[comIdx].evidenciasFotos[fotoIndex];

      try {
        await eliminarArchivo(url);
      } catch (error) {
        console.error(error);
      }

      nuevos[eventoIdx].comunidadesEjecutadas[comIdx].evidenciasFotos.splice(fotoIndex, 1);
      setEncuentros(nuevos);
    },
    [encuentros, bloqueado, setEncuentros, eliminarArchivo]
  );

  // GUARDAR SEGUIMIENTO
  const handleGuardarSeguimiento = useCallback(
    async (estado: "borrador" | "enviado") => {
      if (estado === "enviado") {
        const confirmar = confirm(
          "¿Enviar seguimiento? No podrá realizar cambios después."
        );
        if (!confirmar) return;
      }

      const exito = await guardarSeguimiento(
        actividadesRegulares,
        reuniones,
        encuentros,
        estado
      );

      if (exito) {
        alert(
          estado === "enviado"
            ? "✅ Seguimiento enviado"
            : "💾 Borrador guardado"
        );
      } else {
        alert("❌ Error al guardar");
      }
    },
    [actividadesRegulares, reuniones, encuentros, guardarSeguimiento]
  );

  // GENERAR PDF
  const handleGenerarPDF = useCallback(() => {
    if (!semanaActiva || !user) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    let yPosition = 15;

    // Encabezado
    doc.setFillColor(76, 175, 80);
    doc.rect(15, 10, 8, 8, "F");
    doc.setFontSize(10);
    doc.setTextColor(76, 175, 80);
    doc.text("GAD Montecristi", 25, 15);

    yPosition = 28;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("SEGUIMIENTO SEMANAL INTEGRAL", pageWidth / 2, yPosition, {
      align: "center",
    });

    // Información general
    yPosition = 38;
    const infoData = [
      ["Proyecto:", "Montecristi Crece en Valores"],
      ["Semana:", `${semanaActiva.fechaInicio} - ${semanaActiva.fechaFin}`],
      ["Técnico:", user.displayName || "Técnico"],
    ];

    autoTable(doc, {
      startY: yPosition,
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
      margin: { left: 15, right: 15 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;

    // ============ SECCIÓN: ACTIVIDADES REGULARES ============
    if (actividadesRegulares.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(76, 175, 80);
      doc.text("📋 ACTIVIDADES REGULARES", 15, yPosition);

      yPosition += 8;

      const actividadesTableData = actividadesRegulares.map((act, idx) => [
        String(idx + 1),
        act.comunidadNombre,
        act.actividadPlanificada.substring(0, 25) + "...",
        act.actividadRealizada || "-",
        act.fecha || "-",
        act.porcentajeAsistencia + "%",
        act.estadoActividad,
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [
          [
            "N°",
            "Comunidad",
            "Actividad Planificada",
            "Ejecutada",
            "Fecha",
            "% Asistencia",
            "Estado",
          ],
        ],
        body: actividadesTableData,
        headStyles: {
          fillColor: [76, 175, 80],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 25, halign: "left" },
          2: { cellWidth: 30, halign: "left" },
          3: { cellWidth: 30, halign: "left" },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 },
          6: { cellWidth: 15 },
        },
        margin: { left: 15, right: 15 },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // ============ SECCIÓN: REUNIONES ============
    if (reuniones.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 193, 7);
      doc.text("📋 REUNIONES DE TÉCNICOS", 15, yPosition);

      yPosition += 8;

      const reunionesTableData = reuniones.map((r, idx) => [
        String(idx + 1),
        r.eventoTitulo.substring(0, 25) + "...",
        new Date(r.fecha).toLocaleDateString("es-ES"),
        r.confirmado ? "✓ Confirmado" : "✗ No confirmado",
        r.estado,
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [["N°", "Reunión", "Fecha", "Confirmación", "Estado"]],
        body: reunionesTableData,
        headStyles: {
          fillColor: [255, 193, 7],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 40, halign: "left" },
          2: { cellWidth: 25 },
          3: { cellWidth: 25 },
          4: { cellWidth: 22 },
        },
        margin: { left: 15, right: 15 },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Detalle de reuniones
      reuniones.forEach((reunion, reunionIdx) => {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 15;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255, 193, 7);
        doc.text(`📌 ${reunion.eventoTitulo}`, 15, yPosition);

        yPosition += 6;

        const detalleData = [
          ["Fecha:", new Date(reunion.fecha).toLocaleDateString("es-ES")],
          ["Horario:", reunion.horario],
          ["Lugar:", reunion.lugar],
          ["Confirmado:", reunion.confirmado ? "Sí" : "No"],
          ["Estado:", reunion.estado],
          ["Observaciones:", reunion.observaciones || "-"],
        ];

        autoTable(doc, {
          startY: yPosition,
          head: [],
          body: detalleData,
          columnStyles: {
            0: {
              cellWidth: 30,
              fontStyle: "bold",
              fillColor: [240, 240, 240],
            },
            1: { cellWidth: pageWidth - 60 },
          },
          margin: { left: 15, right: 15 },
        });

        yPosition = (doc as any).lastAutoTable.finalY + 8;

        // Separador
        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 4;
      });
    }

    // ============ SECCIÓN: ENCUENTROS ============
    if (encuentros.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 127, 14);
      doc.text("📅 ENCUENTROS COMUNITARIOS", 15, yPosition);

      yPosition += 8;

      const encuentrosTableData = encuentros.map((e, idx) => [
        String(idx + 1),
        e.eventoTitulo.substring(0, 20) + "...",
        e.tipoEvento,
        new Date(e.fecha).toLocaleDateString("es-ES"),
        e.estado,
        e.comunidadesConfirmadas.filter((c) => c.participa === "si").length,
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [
          [
            "N°",
            "Evento",
            "Tipo",
            "Fecha",
            "Estado",
            "Comunidades",
          ],
        ],
        body: encuentrosTableData,
        headStyles: {
          fillColor: [255, 127, 14],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 35, halign: "left" },
          2: { cellWidth: 25, halign: "left" },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 },
        },
        margin: { left: 15, right: 15 },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Detalle de encuentros por comunidad
      encuentros.forEach((evento, eventoIdx) => {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 15;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255, 127, 14);
        doc.text(`📌 ${evento.eventoTitulo}`, 15, yPosition);

        yPosition += 6;

        const eventoDetalleData = [
          ["Tipo:", evento.tipoEvento],
          ["Fecha:", new Date(evento.fecha).toLocaleDateString("es-ES")],
          ["Horario:", evento.horario],
          ["Lugar:", evento.lugar],
          ["Estado Ejecución:", evento.estado],
        ];

        if (evento.motivoNoEjecucion) {
          eventoDetalleData.push(["Motivo:", evento.motivoNoEjecucion]);
        }

        autoTable(doc, {
          startY: yPosition,
          head: [],
          body: eventoDetalleData,
          columnStyles: {
            0: {
              cellWidth: 30,
              fontStyle: "bold",
              fillColor: [240, 240, 240],
            },
            1: { cellWidth: pageWidth - 60 },
          },
          margin: { left: 15, right: 15 },
        });

        yPosition = (doc as any).lastAutoTable.finalY + 6;

        // Detalle por comunidad del evento
        if (evento.comunidadesEjecutadas.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text("Comunidades Ejecutadas:", 15, yPosition);

          yPosition += 5;

          const comEjecTableData = evento.comunidadesEjecutadas.map((com) => [
            com.comunidadNombre,
            com.actividadRealizada || "-",
            com.porcentajeAsistencia + "%",
            com.asistentesIds.length,
            com.evidenciasFotos.length > 0 ? "✓" : "-",
          ]);

          autoTable(doc, {
            startY: yPosition,
            head: [["Comunidad", "Actividad", "% Asistencia", "Participantes", "Fotos"]],
            body: comEjecTableData,
            headStyles: {
              fillColor: [220, 220, 220],
              textColor: [0, 0, 0],
              fontStyle: "bold",
              fontSize: 8,
            },
            bodyStyles: {
              fontSize: 8,
            },
            columnStyles: {
              0: { cellWidth: 30, halign: "left" },
              1: { cellWidth: 40, halign: "left" },
              2: { cellWidth: 18 },
              3: { cellWidth: 18 },
              4: { cellWidth: 14 },
            },
            margin: { left: 15, right: 15 },
          });

          yPosition = (doc as any).lastAutoTable.finalY + 8;
        }

        // Separador
        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 4;
      });
    }

    // ============ RESUMEN GENERAL ============
    if (yPosition > pageHeight - 40) {
      doc.addPage();
      yPosition = 15;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(76, 175, 80);
    doc.text("📊 RESUMEN GENERAL", 15, yPosition);

    yPosition += 8;

    const resumenData = [
      [
        "Total Actividades Planificadas:",
        String(actividadesRegulares.length),
      ],
      [
        "Actividades Realizadas:",
        String(
          actividadesRegulares.filter((a) => a.estadoActividad === "realizada")
            .length
        ),
      ],
      [
        "Promedio Asistencia Actividades:",
        String(
          Math.round(
            actividadesRegulares.reduce(
              (acc, a) => acc + a.porcentajeAsistencia,
              0
            ) / Math.max(actividadesRegulares.length, 1)
          )
        ) + "%",
      ],
      ["Total Reuniones:", String(reuniones.length)],
      [
        "Reuniones Realizadas:",
        String(reuniones.filter((r) => r.estado === "realizada").length),
      ],
      ["Total Encuentros:", String(encuentros.length)],
      [
        "Encuentros Realizados:",
        String(encuentros.filter((e) => e.estado === "realizada").length),
      ],
      [
        "Promedio Asistencia Encuentros:",
        String(
          Math.round(
            encuentros
              .flatMap((e) => e.comunidadesEjecutadas)
              .reduce((acc, c) => acc + c.porcentajeAsistencia, 0) /
              Math.max(
                encuentros.flatMap((e) => e.comunidadesEjecutadas).length,
                1
              )
          )
        ) + "%",
      ],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: resumenData,
      columnStyles: {
        0: {
          cellWidth: 60,
          fontStyle: "bold",
          fillColor: [240, 240, 240],
        },
        1: {
          cellWidth: pageWidth - 90,
          fontStyle: "bold",
          fillColor: [76, 175, 80],
          textColor: [255, 255, 255],
          halign: "center",
        },
      },
      margin: { left: 15, right: 15 },
    });

    // ============ PIE DE PÁGINA ============
    const paginasTotal = doc.getNumberOfPages();

    for (let i = 1; i <= paginasTotal; i++) {
      doc.setPage(i);

      doc.setDrawColor(76, 175, 80);
      doc.setLineWidth(0.5);
      doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        "Montecristi Crece en Valores - Seguimiento Integral",
        15,
        pageHeight - 10
      );
      doc.text(`Página ${i} de ${paginasTotal}`, pageWidth - 35, pageHeight - 10);
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-ES")}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
    }

    const nombreArchivo = `Seguimiento_${semanaActiva.fechaInicio}_${semanaActiva.fechaFin}.pdf`;
    doc.save(nombreArchivo);
  }, [semanaActiva, user, actividadesRegulares, reuniones, encuentros]);

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando seguimiento...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 m-6">
        <p className="text-yellow-800 font-medium">⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              📋 Seguimiento Semanal Integral
            </h1>
            {semanaActiva && (
              <p className="text-gray-600 mt-1">
                {semanaActiva.fechaInicio} al {semanaActiva.fechaFin}
              </p>
            )}
          </div>
          <span
            className={`px-4 py-2 rounded-full text-white font-semibold ${
              estadoSeguimiento === "enviado"
                ? "bg-green-600"
                : "bg-yellow-600"
            }`}
          >
            {estadoSeguimiento === "enviado" ? "✅ Enviado" : "📝 Borrador"}
          </span>
        </div>

        {/* Alertas de eventos */}
        {alertas.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 font-medium">
              🔔 Tienes {alertas.length} evento(s) pendiente(s) de confirmar en Planificación
            </p>
          </div>
        )}

        {/* Tabs para secciones */}
        <div className="space-y-6">
          {/* SECCIÓN: ACTIVIDADES REGULARES */}
          {actividadesRegulares.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  📋 Actividades Regulares
                </h2>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {actividadesRegulares.length}
                </span>
              </div>

              <div className="space-y-4">
                {actividadesRegulares.map((actividad, index) => (
                  <RegistroActividadRegular
                    key={index}
                    actividad={actividad}
                    index={index}
                    bloqueado={bloqueado}
                    participantes={participantesPorActividad[index] || []}
                    onActividadChange={handleActividadChange}
                    onCargarParticipantes={handleCargarParticipantesActividad}
                    onToggleAsistencia={handleToggleAsistenciaActividad}
                    onSubirFoto={handleSubirFotoActividad}
                    onEliminarFoto={handleEliminarFotoActividad}
                    onSubirPDF={handleSubirPDFActividad}
                    onEliminarPDF={handleEliminarPDFActividad}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SECCIÓN: REUNIONES */}
          {reuniones.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  📋 Reuniones de Técnicos
                </h2>
                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {reuniones.length}
                </span>
              </div>

              <div className="space-y-4">
                {reuniones.map((reunion, index) => (
                  <RegistroReunion
                    key={index}
                    reunion={reunion}
                    index={index}
                    bloqueado={bloqueado}
                    onReunionChange={handleReunionChange}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SECCIÓN: ENCUENTROS */}
          {encuentros.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  📅 Encuentros Comunitarios
                </h2>
                <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {encuentros.length}
                </span>
              </div>

              <div className="space-y-4">
                {encuentros.map((encuentro, index) => (
                  <RegistroEncuentro
                    key={index}
                    encuentro={encuentro}
                    index={index}
                    bloqueado={bloqueado}
                    participantes={participantesPorActividad[`encuentro_${index}`] || []}
                    onEncuentroChange={handleEncuentroChange}
                    onCargarParticipantes={handleCargarParticipantesEncuentro}
                    onToggleAsistencia={handleToggleAsistenciaEncuentro}
                    onSubirFoto={handleSubirFotoEncuentro}
                    onEliminarFoto={handleEliminarFotoEncuentro}
                  />
                ))}
              </div>
            </div>
          )}

          {actividadesRegulares.length === 0 &&
            reuniones.length === 0 &&
            encuentros.length === 0 && (
              <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
                <p className="text-lg">
                  No hay actividades, reuniones ni encuentros para registrar seguimiento
                </p>
              </div>
            )}
        </div>

        {/* Botones de acción */}
        {!bloqueado &&
          (actividadesRegulares.length > 0 ||
            reuniones.length > 0 ||
            encuentros.length > 0) && (
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleGuardarSeguimiento("borrador")}
                disabled={procesando}
                className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
              >
                {procesando ? "⏳ Guardando..." : "💾 Guardar Borrador"}
              </button>

              <button
                onClick={() => handleGuardarSeguimiento("enviado")}
                disabled={procesando}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
              >
                {procesando ? "⏳ Enviando..." : "✅ Enviar Seguimiento"}
              </button>

              <button
                onClick={handleGenerarPDF}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
              >
                📄 Descargar PDF
              </button>
            </div>
          )}

        {bloqueado && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium">
              ✅ Seguimiento enviado. No se pueden realizar cambios.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}