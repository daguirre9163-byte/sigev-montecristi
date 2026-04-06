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

interface Planificacion {
  id: string;
  tecnicoId: string;
  semanaId: string;
  actividades: Actividad[];
  estado: string;
  [key: string]: any;
}

interface Actividad {
  comunidadId: string;
  comunidadNombre: string;
  actividad: string;
  fecha: string;
  [key: string]: any;
}

interface Registro {
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

// ============ HOOK: Cargar datos ============
function useCargarDatos(userId: string | undefined) {
  const [semanaActiva, setSemanaActiva] = useState<Semana | null>(null);
  const [planificacion, setPlanificacion] = useState<Planificacion | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Cargar semana activa
      const semana = await getSemanaActiva();
      if (!semana) {
        setError("No hay semana activa");
        return;
      }
      setSemanaActiva(semana);

      // 2. Cargar planificación enviada
      const planQuery = query(
        collection(db, "planificaciones"),
        where("semanaId", "==", semana.id),
        where("tecnicoId", "==", userId),
        where("estado", "==", "enviado")
      );

      const planSnap = await getDocs(planQuery);
      if (planSnap.empty) {
        setError("No existe planificación enviada para esta semana");
        return;
      }

      const planData = planSnap.docs[0].data() as Planificacion;
      setPlanificacion(planData);

      // 3. Cargar seguimiento existente o crear nuevo
      const segQuery = query(
        collection(db, "seguimientos"),
        where("semanaId", "==", semana.id),
        where("tecnicoId", "==", userId)
      );

      const segSnap = await getDocs(segQuery);

      if (!segSnap.empty) {
        const segData = segSnap.docs[0].data();
        setRegistros(segData.registros || []);
      } else {
        // Crear registros base desde planificación
        const registrosBase: Registro[] = planData.actividades.map(
          (act) => ({
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
        setRegistros(registrosBase);
      }

      // 4. Cargar alertas del técnico
      const alertasQuery = query(
        collection(db, "alertas"),
        where("tecnicoId", "==", userId),
        where("estado", "==", "pendiente")
      );

      const alertasSnap = await getDocs(alertasQuery);
      const alertasList = alertasSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Alerta));
      setAlertas(alertasList);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar datos";
      setError(mensaje);
      console.error("Error al cargar datos:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    semanaActiva,
    planificacion,
    registros,
    setRegistros,
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

  const eliminarArchivo = useCallback(async (url: string) => {
    try {
      const storageRef = ref(storage, url);
      await deleteObject(storageRef);
    } catch (error) {
      console.error("Error al eliminar archivo:", error);
    }
  }, []);

  return { subirArchivo, eliminarArchivo };
}

// ============ HOOK: Seguimiento ============
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
    async (registros: Registro[], nuevoEstado: "borrador" | "enviado") => {
      if (!userId || !semanaId) return false;

      try {
        setProcesando(true);

        const data = {
          semanaId,
          tecnicoId: userId,
          registros,
          estado: nuevoEstado,
          fechaActualizacion: serverTimestamp(),
        };

        if (seguimientoId) {
          await updateDoc(doc(db, "seguimientos", seguimientoId), data);
        } else {
          const docRef = await addDoc(collection(db, "seguimientos"), data);
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

// ============ COMPONENTE: Card de Alerta ============
interface CardAlertaProps {
  alerta: Alerta;
  onClose: () => void;
}

function CardAlerta({ alerta, onClose }: CardAlertaProps) {
  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {alerta.tipo === "reunion" ? "📋" : "🏘️"}
            </span>
            <h3 className="font-bold text-gray-900">{alerta.titulo}</h3>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {alerta.tipo === "reunion"
              ? "Confirma tu asistencia en Planificación"
              : "Configura tu participación en Planificación"}
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition"
      >
        ✓ Ir a Planificación
      </button>
    </div>
  );
}

// ============ COMPONENTE: Registro de seguimiento ============
interface RegistroSeguimientoProps {
  registro: Registro;
  index: number;
  bloqueado: boolean;
  participantes: Participante[];
  onRegistroChange: (index: number, registro: Registro) => void;
  onCargarParticipantes: (index: number) => void;
  onToggleAsistencia: (index: number, participanteId: string) => void;
  onSubirFoto: (index: number, file: File) => Promise<void>;
  onEliminarFoto: (index: number, fotoIndex: number) => Promise<void>;
  onSubirPDF: (index: number, file: File) => Promise<void>;
  onEliminarPDF: (index: number) => void;
}

function RegistroSeguimiento({
  registro,
  index,
  bloqueado,
  participantes,
  onRegistroChange,
  onCargarParticipantes,
  onToggleAsistencia,
  onSubirFoto,
  onEliminarFoto,
  onSubirPDF,
  onEliminarPDF,
}: RegistroSeguimientoProps) {
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [cargandoPDF, setCargandoPDF] = useState(false);
  const [busquedaParticipantes, setBusquedaParticipantes] = useState("");

  // ============ FILTRAR PARTICIPANTES ============
  const participantesFiltrados = useMemo(() => {
    if (!busquedaParticipantes.trim()) return participantes;

    return participantes.filter((p) =>
      `${p.nombres} ${p.apellidos}`
        .toLowerCase()
        .includes(busquedaParticipantes.toLowerCase())
    );
  }, [participantes, busquedaParticipantes]);

  // ============ SELECCIONAR TODOS ============
  const handleSeleccionarTodos = useCallback(() => {
    if (bloqueado) return;

    const nuevoRegistro = { ...registro };
    const idsParticipantes = participantes.map((p) => p.id);

    // Si ya están todos seleccionados, deseleccionar todos
    if (registro.asistentesIds.length === participantes.length) {
      nuevoRegistro.asistentesIds = [];
      nuevoRegistro.porcentajeAsistencia = 0;
    } else {
      // Si no están todos, seleccionar todos
      nuevoRegistro.asistentesIds = idsParticipantes;
      nuevoRegistro.porcentajeAsistencia = 100;
    }

    onRegistroChange(index, nuevoRegistro);
  }, [registro, participantes, index, bloqueado, onRegistroChange]);

  // ============ DESELECCIONAR TODOS ============
  const handleLimpiar = useCallback(() => {
    if (bloqueado) return;

    const nuevoRegistro = { ...registro };
    nuevoRegistro.asistentesIds = [];
    nuevoRegistro.porcentajeAsistencia = 0;

    onRegistroChange(index, nuevoRegistro);
  }, [registro, index, bloqueado, onRegistroChange]);

  // ============ MANEJAR CAMBIO DE FOTO ============
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (registro.estadoActividad !== "realizada") {
      alert("La actividad no se realizó, no se pueden subir evidencias.");
      return;
    }

    try {
      setCargandoFoto(true);
      await onSubirFoto(index, file);
      alert("✅ Foto subida correctamente");
    } catch (error) {
      alert("❌ Error al subir foto");
    } finally {
      setCargandoFoto(false);
    }
  };

  // ============ MANEJAR CAMBIO DE PDF ============
  const handlePDFChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (registro.estadoActividad !== "realizada") {
      alert("La actividad no se realizó, no se puede subir lista.");
      return;
    }

    try {
      setCargandoPDF(true);
      await onSubirPDF(index, file);
      alert("✅ PDF subido correctamente");
    } catch (error) {
      alert("❌ Error al subir PDF");
    } finally {
      setCargandoPDF(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border-l-4 border-green-500">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">
          📍 {registro.comunidadNombre}
        </h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            registro.estadoActividad === "realizada"
              ? "bg-green-100 text-green-800"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {registro.estadoActividad === "realizada" && "✅ Realizada"}
          {registro.estadoActividad === "suspendida" && "⏸️ Suspendida"}
          {registro.estadoActividad === "cancelada" && "❌ Cancelada"}
          {registro.estadoActividad === "reprogramada" && "🔄 Reprogramada"}
        </span>
      </div>

      {/* Información básica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
        <div>
          <p className="text-sm text-gray-600">Actividad planificada</p>
          <p className="font-semibold text-gray-900">
            {registro.actividadPlanificada}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Fecha</p>
          <p className="font-semibold text-gray-900">
            {registro.fecha || "No definida"}
          </p>
        </div>
      </div>

      {/* Actividad realizada */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Actividad Realizada
        </label>
        <input
          type="text"
          placeholder="Describe la actividad que se realizó"
          value={registro.actividadRealizada}
          onChange={(e) =>
            onRegistroChange(index, {
              ...registro,
              actividadRealizada: e.target.value,
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* Tipo de ejecución */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tipo de Ejecución
        </label>
        <select
          value={registro.tipoEjecucionActividad}
          onChange={(e) =>
            onRegistroChange(index, {
              ...registro,
              tipoEjecucionActividad: e.target.value as any,
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        >
          <option value="planificada">Actividad planificada</option>
          <option value="modificada">Actividad diferente</option>
        </select>
      </div>

      {/* Motivo cambio */}
      {registro.tipoEjecucionActividad === "modificada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motivo del cambio
          </label>
          <textarea
            placeholder="Explique por qué se cambió la actividad"
            value={registro.motivoCambioActividad}
            onChange={(e) =>
              onRegistroChange(index, {
                ...registro,
                motivoCambioActividad: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}

      {/* Estado de actividad */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estado de la Actividad
        </label>
        <select
          value={registro.estadoActividad}
          onChange={(e) =>
            onRegistroChange(index, {
              ...registro,
              estadoActividad: e.target.value as any,
            })
          }
          disabled={bloqueado}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        >
          <option value="realizada">✅ Realizada</option>
          <option value="suspendida">⏸️ Suspendida</option>
          <option value="cancelada">❌ Cancelada</option>
          <option value="reprogramada">🔄 Reprogramada</option>
        </select>
      </div>

      {/* Motivo no realizada */}
      {registro.estadoActividad !== "realizada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motivo
          </label>
          <textarea
            placeholder="Explique por qué no se realizó"
            value={registro.motivoNoRealizada}
            onChange={(e) =>
              onRegistroChange(index, {
                ...registro,
                motivoNoRealizada: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            rows={2}
          />
        </div>
      )}

      {/* Fecha reprogramada */}
      {registro.estadoActividad === "reprogramada" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nueva Fecha
          </label>
          <input
            type="date"
            value={registro.fechaReprogramada}
            onChange={(e) =>
              onRegistroChange(index, {
                ...registro,
                fechaReprogramada: e.target.value,
              })
            }
            disabled={bloqueado}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
          />
        </div>
      )}

      {/* Participantes */}
      {registro.estadoActividad === "realizada" && (
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
              {/* Encabezado participantes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-gray-900">
                      Asistencia: {registro.porcentajeAsistencia}%
                    </h4>
                    <p className="text-sm text-gray-600">
                      {registro.asistentesIds.length} de {participantes.length}{" "}
                      presentes
                    </p>
                  </div>
                </div>

                {/* Búsqueda de participantes */}
                <input
                  type="text"
                  placeholder="🔍 Buscar por nombre..."
                  value={busquedaParticipantes}
                  onChange={(e) => setBusquedaParticipantes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm mb-3"
                />

                {/* Botones de selección */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleSeleccionarTodos}
                    disabled={bloqueado}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                      registro.asistentesIds.length === participantes.length
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-white border border-green-600 text-green-600 hover:bg-green-50"
                    } disabled:opacity-50`}
                  >
                    {registro.asistentesIds.length === participantes.length
                      ? "✓ Todos seleccionados"
                      : "✓ Seleccionar todos"}
                  </button>

                  <button
                    onClick={handleLimpiar}
                    disabled={bloqueado || registro.asistentesIds.length === 0}
                    className="px-4 py-2 rounded-lg font-medium text-sm bg-red-100 hover:bg-red-200 text-red-800 transition disabled:opacity-50"
                  >
                    ✕ Desseleccionar todos
                  </button>

                  {busquedaParticipantes && (
                    <button
                      onClick={() => setBusquedaParticipantes("")}
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 transition"
                    >
                      🔄 Limpiar búsqueda
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de participantes filtrados */}
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-300 rounded-lg p-2 bg-white">
                {participantesFiltrados.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">
                    No hay participantes que coincidan con la búsqueda
                  </p>
                ) : (
                  participantesFiltrados.map((participante) => (
                    <label
                      key={participante.id}
                      className="flex items-center gap-3 p-3 hover:bg-blue-50 rounded cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={registro.asistentesIds.includes(
                          participante.id
                        )}
                        onChange={() =>
                          onToggleAsistencia(index, participante.id)
                        }
                        disabled={bloqueado}
                        className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {participante.nombres} {participante.apellidos}
                        </p>
                        <div className="flex gap-2 text-xs text-gray-600">
                          {participante.edad && (
                            <span>📅 {participante.edad} años</span>
                          )}
                          {participante.sexo && <span>👤 {participante.sexo}</span>}
                        </div>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          registro.asistentesIds.includes(participante.id)
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {registro.asistentesIds.includes(participante.id)
                          ? "Presente"
                          : "Ausente"}
                      </div>
                    </label>
                  ))
                )}
              </div>

              {/* Resumen de búsqueda */}
              {busquedaParticipantes && (
                <p className="text-sm text-gray-600 text-center">
                  Mostrando {participantesFiltrados.length} de{" "}
                  {participantes.length} participantes
                </p>
              )}

              {/* Fotos */}
              <div className="pt-4 border-t border-gray-300">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📷 Evidencias Fotográficas
                </label>

                {!bloqueado && registro.estadoActividad === "realizada" && (
                  <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition">
                    {cargandoFoto ? "⏳ Subiendo..." : "📷 Subir Foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFotoChange}
                      disabled={cargandoFoto}
                      className="hidden"
                    />
                  </label>
                )}

                {registro.evidenciasFotos.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {registro.evidenciasFotos.map((url, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={url}
                          alt={`Foto ${i + 1}`}
                          className="w-full h-24 object-cover rounded-lg border border-gray-300 shadow-sm"
                        />
                        {!bloqueado && (
                          <button
                            onClick={() => onEliminarFoto(index, i)}
                            className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg"
                            title="Eliminar foto"
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
              <div className="pt-4 border-t border-gray-300">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📄 Lista de Asistencia PDF
                </label>

                {!bloqueado && registro.estadoActividad === "realizada" && (
                  <label className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition">
                    {cargandoPDF ? "⏳ Subiendo..." : "📄 Subir PDF"}
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePDFChange}
                      disabled={cargandoPDF}
                      className="hidden"
                    />
                  </label>
                )}

                {registro.evidenciaListaPdf && (
                  <div className="mt-3 flex items-center gap-2 bg-white p-3 rounded-lg border border-purple-300">
                    <span className="text-2xl">📄</span>
                    <a
                      href={registro.evidenciaListaPdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-purple-600 hover:text-purple-700 font-medium hover:underline"
                    >
                      Ver Lista de Asistencia
                    </a>
                    {!bloqueado && (
                      <button
                        onClick={() => onEliminarPDF(index)}
                        className="text-red-600 hover:text-red-700 font-bold transition"
                        title="Eliminar PDF"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function SeguimientoPage() {
  const { user } = useAuth();
  const {
    semanaActiva,
    planificacion,
    registros,
    setRegistros,
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

  const [participantesPorRegistro, setParticipantesPorRegistro] = useState<
    Record<number, Participante[]>
  >({});

  const [alertaMostrada, setAlertaMostrada] = useState<string | null>(null);

  // Manejadores
  const handleRegistroChange = useCallback((index: number, registro: Registro) => {
    const nuevos = [...registros];
    nuevos[index] = registro;
    setRegistros(nuevos);
  }, [registros, setRegistros]);

  const handleCargarParticipantes = useCallback(
    async (index: number) => {
      const registro = registros[index];

      if (registro.estadoActividad !== "realizada") {
        alert("No se puede registrar asistencia si la actividad no se realizó");
        return;
      }

      try {
        const q = query(
          collection(db, "participantes"),
          where("comunidadId", "==", registro.comunidadId),
          where("estado", "==", "activo")
        );

        const snapshot = await getDocs(q);
        const lista = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Participante));

        setParticipantesPorRegistro((prev) => ({
          ...prev,
          [index]: lista,
        }));
      } catch (err) {
        alert("Error al cargar participantes");
        console.error(err);
      }
    },
    [registros]
  );

  const handleToggleAsistencia = useCallback(
    (regIndex: number, participanteId: string) => {
      if (bloqueado) return;

      const nuevos = [...registros];
      const asistentes = nuevos[regIndex].asistentesIds;

      if (asistentes.includes(participanteId)) {
        nuevos[regIndex].asistentesIds = asistentes.filter(
          (id) => id !== participanteId
        );
      } else {
        nuevos[regIndex].asistentesIds.push(participanteId);
      }

      const total = participantesPorRegistro[regIndex]?.length || 0;
      const count = nuevos[regIndex].asistentesIds.length;

      nuevos[regIndex].porcentajeAsistencia =
        total > 0 ? Math.round((count / total) * 100) : 0;

      setRegistros(nuevos);
    },
    [registros, participantesPorRegistro, bloqueado, setRegistros]
  );

  const handleSubirFoto = useCallback(
    async (index: number, file: File) => {
      if (!user || bloqueado) return;

      try {
        const ruta = `seguimientos/${user.uid}/fotos/${Date.now()}_${file.name}`;
        const url = await subirArchivo(file, ruta);

        const nuevos = [...registros];
        nuevos[index].evidenciasFotos.push(url);
        setRegistros(nuevos);
      } catch (error) {
        console.error("Error al subir foto:", error);
        throw error;
      }
    },
    [user, bloqueado, registros, setRegistros, subirArchivo]
  );

  const handleEliminarFoto = useCallback(
    async (index: number, fotoIndex: number) => {
      if (bloqueado) return;

      const nuevos = [...registros];
      const url = nuevos[index].evidenciasFotos[fotoIndex];

      try {
        await eliminarArchivo(url);
      } catch (error) {
        console.error("Error al eliminar foto:", error);
      }

      nuevos[index].evidenciasFotos.splice(fotoIndex, 1);
      setRegistros(nuevos);
    },
    [registros, bloqueado, setRegistros, eliminarArchivo]
  );

  const handleSubirPDF = useCallback(
    async (index: number, file: File) => {
      if (!user || bloqueado) return;

      try {
        const ruta = `seguimientos/${user.uid}/listas/${Date.now()}_${file.name}`;
        const url = await subirArchivo(file, ruta);

        const nuevos = [...registros];
        nuevos[index].evidenciaListaPdf = url;
        setRegistros(nuevos);
      } catch (error) {
        console.error("Error al subir PDF:", error);
        throw error;
      }
    },
    [user, bloqueado, registros, setRegistros, subirArchivo]
  );

  const handleEliminarPDF = useCallback(
    (index: number) => {
      if (bloqueado) return;

      const nuevos = [...registros];
      nuevos[index].evidenciaListaPdf = "";
      setRegistros(nuevos);
    },
    [registros, bloqueado, setRegistros]
  );

  const handleGuardarSeguimiento = useCallback(
    async (estado: "borrador" | "enviado") => {
      if (estado === "enviado") {
        const confirmar = confirm(
          "¿Seguro que desea enviar el seguimiento? No podrá realizar cambios después."
        );
        if (!confirmar) return;
      }

      const exito = await guardarSeguimiento(registros, estado);

      if (exito) {
        alert(
          estado === "enviado"
            ? "Seguimiento enviado correctamente"
            : "Seguimiento guardado como borrador"
        );
      } else {
        alert("Error al guardar el seguimiento");
      }
    },
    [registros, guardarSeguimiento]
  );

  const handleGenerarPDF = useCallback(() => {
    if (!semanaActiva || !user) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    let yPosition = 15;

    // ============ ENCABEZADO CON LOGO ============
    doc.setFillColor(76, 175, 80); // Verde de Plan Internacional
    doc.rect(15, 10, 8, 8, "F");
    doc.setFontSize(10);
    doc.setTextColor(76, 175, 80);
    doc.text("GAD Municipal del Cantón", 25, 12);
    doc.text("Montecristi", 25, 16);

    // Título principal
    yPosition = 28;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("SEGUIMIENTO SEMANAL DE ACTIVIDADES", pageWidth / 2, yPosition, {
      align: "center",
    });

    // ============ INFORMACIÓN GENERAL ============
    yPosition = 38;
    const infoData = [
      ["Proyecto:", "Montecristi Crece en Valores"],
      ["Semana:", `${semanaActiva.fechaInicio} al ${semanaActiva.fechaFin}`],
      ["Técnico:", user.displayName || "Técnico"],
      [
        "Comunidades Asignadas:",
        registros.map((r) => r.comunidadNombre).join(", "),
      ],
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
          halign: "left",
        },
        1: {
          cellWidth: pageWidth - 70,
          halign: "left",
        },
      },
      margin: { left: 15, right: 15 },
    });

    // Obtener Y position después de la tabla de información
    yPosition = (doc as any).lastAutoTable.finalY + 10;

    // ============ SECCIÓN DE ACTIVIDADES EJECUTADAS ============
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("ACTIVIDADES EJECUTADAS", 15, yPosition);

    yPosition += 7;

    // Preparar datos de actividades
    const actividadesTableData = registros.map((reg, idx) => [
      String(idx + 1),
      reg.comunidadNombre,
      reg.actividadPlanificada.substring(0, 20) + "...",
      reg.actividadRealizada || "-",
      reg.fecha || "-",
      reg.porcentajeAsistencia + "%",
      reg.asistentesIds.length,
      estadoSeguimiento === "enviado" ? "✓ Enviado" : "📝 Borrador",
      reg.evidenciasFotos.length > 0 && reg.evidenciaListaPdf
        ? "✓ Completa"
        : "Incompleta",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [
        [
          "N°",
          "Comunidad",
          "Componente",
          "Actividad Realizada",
          "Fecha",
          "% Asistencia",
          "Participantes",
          "Estado",
          "Evidencia",
        ],
      ],
      body: actividadesTableData,
      headStyles: {
        fillColor: [76, 175, 80],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        valign: "middle",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        halign: "center",
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 20, halign: "left" },
        2: { cellWidth: 20, halign: "left" },
        3: { cellWidth: 25, halign: "left" },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
        6: { cellWidth: 15 },
        7: { cellWidth: 15 },
        8: { cellWidth: 15 },
      },
      margin: { left: 15, right: 15 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 8;

    // ============ SECCIÓN DE RESUMEN ============
    const resumenData = [
      [
        "Total de Actividades Planificadas:",
        String(registros.length),
      ],
      [
        "Actividades Realizadas:",
        String(
          registros.filter((r) => r.estadoActividad === "realizada").length
        ),
      ],
      [
        "Actividades Suspendidas/Canceladas:",
        String(
          registros.filter(
            (r) =>
              r.estadoActividad === "suspendida" ||
              r.estadoActividad === "cancelada"
          ).length
        ),
      ],
      [
        "Actividades Reprogramadas:",
        String(
          registros.filter((r) => r.estadoActividad === "reprogramada").length
        ),
      ],
      [
        "Asistencia Promedio:",
        String(
          Math.round(
            registros.reduce((acc, r) => acc + r.porcentajeAsistencia, 0) /
              registros.length
          )
        ) + "%",
      ],
    ];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("RESUMEN GENERAL", 15, yPosition);

    yPosition += 7;

    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: resumenData,
      columnStyles: {
        0: {
          cellWidth: 60,
          fontStyle: "bold",
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          halign: "left",
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

    yPosition = (doc as any).lastAutoTable.finalY + 10;

    // ============ SECCIÓN DE DETALLE POR COMUNIDAD ============
    registros.forEach((reg, index) => {
      // Verificar si necesita nueva página
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(76, 175, 80);
      doc.text(`DETALLE - ${reg.comunidadNombre}`, 15, yPosition);

      yPosition += 6;

      const detalleData = [
        ["Actividad Planificada:", reg.actividadPlanificada],
        ["Actividad Realizada:", reg.actividadRealizada || "No realizada"],
        ["Tipo de Ejecución:", reg.tipoEjecucionActividad],
        [
          "Motivo de Cambio:",
          reg.motivoCambioActividad || "Sin cambios",
        ],
        ["Estado:", reg.estadoActividad],
        [
          "Motivo No Realizada:",
          reg.motivoNoRealizada || "-",
        ],
        [
          "Fecha Reprogramada:",
          reg.fechaReprogramada || "-",
        ],
        ["Participantes Asistentes:", `${reg.asistentesIds.length}`],
        ["% Asistencia:", `${reg.porcentajeAsistencia}%`],
        [
          "Evidencias Fotográficas:",
          reg.evidenciasFotos.length > 0
            ? `${reg.evidenciasFotos.length} fotos`
            : "Sin fotos",
        ],
        [
          "Lista PDF:",
          reg.evidenciaListaPdf ? "Sí" : "No",
        ],
      ];

      autoTable(doc, {
        startY: yPosition,
        head: [],
        body: detalleData,
        columnStyles: {
          0: {
            cellWidth: 40,
            fontStyle: "bold",
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            halign: "left",
            fontSize: 8,
          },
          1: {
            cellWidth: pageWidth - 70,
            halign: "left",
            fontSize: 8,
          },
        },
        margin: { left: 15, right: 15 },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 8;

      // Separador entre comunidades
      if (index < registros.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 4;
      }
    });

    // ============ PIE DE PÁGINA ============
    const paginasTotal = doc.getNumberOfPages();

    for (let i = 1; i <= paginasTotal; i++) {
      doc.setPage(i);

      // Línea separadora
      doc.setDrawColor(76, 175, 80);
      doc.setLineWidth(0.5);
      doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);

      // Texto pie de página
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Montecristi Crece en Valores - Seguimiento Semanal`,
        15,
        pageHeight - 10
      );
      doc.text(
        `Página ${i} de ${paginasTotal}`,
        pageWidth - 35,
        pageHeight - 10
      );

      // Fecha de generación
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-ES")}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
    }

    // ============ DESCARGAR ============
    const nombreArchivo = `Seguimiento_${semanaActiva.fechaInicio}_${semanaActiva.fechaFin}.pdf`;
    doc.save(nombreArchivo);
  }, [semanaActiva, user, registros, estadoSeguimiento]);

  // UI: Cargando
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">
            Cargando seguimiento...
          </p>
        </div>
      </div>
    );
  }

  // UI: Error
  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 font-medium">⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              📋 Seguimiento Semanal
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
        {alertaMostrada !== null &&
          alertas.find((a) => a.id === alertaMostrada) && (
            <CardAlerta
              alerta={alertas.find((a) => a.id === alertaMostrada)!}
              onClose={() => setAlertaMostrada(null)}
            />
          )}

        {/* Mostrar si hay alertas sin mostrar */}
        {alertas.length > 0 &&
          !alertaMostrada &&
          alertas.map((alerta) => (
            <CardAlerta
              key={alerta.id}
              alerta={alerta}
              onClose={() => setAlertaMostrada(alerta.id)}
            />
          ))}

        {/* Registros de seguimiento */}
        <div className="space-y-6">
          {registros.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              <p className="text-lg">No hay actividades para seguimiento</p>
            </div>
          ) : (
            registros.map((registro, index) => (
              <RegistroSeguimiento
                key={index}
                registro={registro}
                index={index}
                bloqueado={bloqueado}
                participantes={participantesPorRegistro[index] || []}
                onRegistroChange={handleRegistroChange}
                onCargarParticipantes={handleCargarParticipantes}
                onToggleAsistencia={handleToggleAsistencia}
                onSubirFoto={handleSubirFoto}
                onEliminarFoto={handleEliminarFoto}
                onSubirPDF={handleSubirPDF}
                onEliminarPDF={handleEliminarPDF}
              />
            ))
          )}
        </div>

        {/* Botones de acción */}
        {!bloqueado && registros.length > 0 && (
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