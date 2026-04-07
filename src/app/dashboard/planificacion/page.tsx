"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ============ TIPOS ============
interface Usuario {
  uid: string;
  email?: string;
}

interface Semana {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  [key: string]: any;
}

interface Comunidad {
  id: string;
  nombre: string;
  [key: string]: any;
}

interface Participante {
  id: string;
  nombres: string;
  apellidos: string;
  comunidadId: string;
  [key: string]: any;
}

interface Actividad {
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

interface EventoGlobal {
  id: string;
  titulo: string;
  fecha: string;
  horario: string;
  lugar: string;
  objetivo: string;
  tipoEvento: string;
  tecnicosIds: string[];
  [key: string]: any;
}

interface Alerta {
  id: string;
  eventoId: string;
  tecnicoId: string;
  tipo: "reunion" | "actividad";
  titulo: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  confirmada?: boolean;
  tipoEvento?: string;
  createdAt?: any;
  [key: string]: any;
}

// ============ HOOK: Cargar datos ============
function useCargarDatos(userId: string | undefined) {
  const [semanaActiva, setSemanaActiva] = useState<Semana | null>(null);
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [eventosGlobales, setEventosGlobales] = useState<EventoGlobal[]>([]);
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
      if (semana) setSemanaActiva(semana);

      // 2. Cargar comunidades del técnico
      const comunidadesData = await getComunidadesByTecnico(userId);
      setComunidades(comunidadesData);

      // 3. Cargar participantes
      const participantesSnap = await getDocs(
        collection(db, "participantes")
      );
      const listaParticipantes = participantesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Participante));
      setParticipantes(listaParticipantes);

      // 4. Cargar eventos globales asignados al técnico
      const eventosSnap = await getDocs(
        collection(db, "eventosGlobales")
      );
      let eventos = eventosSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as EventoGlobal))
        .filter(
          (ev) =>
            Array.isArray(ev.tecnicosIds) &&
            ev.tecnicosIds.includes(userId)
        );

      // 5. Filtrar eventos ya respondidos
      const respuestasSnap = await getDocs(
        query(
          collection(db, "respuestasEventos"),
          where("tecnicoId", "==", userId)
        )
      );
      const eventosRespondidos = respuestasSnap.docs.map(
        (d) => d.data().eventoId
      );
      eventos = eventos.filter((ev) => !eventosRespondidos.includes(ev.id));

      setEventosGlobales(eventos);

      // 6. Cargar alertas del técnico
      const alertasSnap = await getDocs(
        query(
          collection(db, "alertas"),
          where("tecnicoId", "==", userId)
        )
      );
      const listaAlertas = alertasSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Alerta));
      setAlertas(listaAlertas.filter((a) => a.estado === "pendiente"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    semanaActiva,
    comunidades,
    participantes,
    eventosGlobales,
    alertas,
    loading,
    error,
    recargar: cargar,
  };
}

// ============ HOOK: Planificación ============
function usePlanificacion(
  userId: string | undefined,
  semanaId: string | undefined
) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState("");
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [estado, setEstado] = useState("borrador");

  const cargarPlanificacion = useCallback(async () => {
    if (!userId || !semanaId) return;

    try {
      const q = query(
        collection(db, "planificaciones"),
        where("semanaId", "==", semanaId),
        where("tecnicoId", "==", userId)
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();

        setPlanId(docSnap.id);
        setObjetivo(data.objetivoSemana || "");
        setActividades(data.actividades || []);
        setEstado(data.estado || "borrador");
      }
    } catch (error) {
      console.error("Error al cargar planificación:", error);
    }
  }, [userId, semanaId]);

  useEffect(() => {
    cargarPlanificacion();
  }, [cargarPlanificacion]);

  return {
    planId,
    setPlanId,
    objetivo,
    setObjetivo,
    actividades,
    setActividades,
    estado,
    setEstado,
    cargarPlanificacion,
  };
}

// ============ COMPONENTE: Card de Alerta ============
interface CardAlertaProps {
  alerta: Alerta;
  evento: EventoGlobal | null;
  onConfirmar?: () => void;
  onConfiguraParticipantes?: () => void;
  procesando?: boolean;
}

function CardAlerta({
  alerta,
  evento,
  onConfirmar,
  onConfiguraParticipantes,
  procesando = false,
}: CardAlertaProps) {
  if (!evento) return null;

  const es_reunion = alerta.tipo === "reunion";

  return (
    <div className="bg-white rounded-lg shadow-md border-l-4 border-orange-500 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {es_reunion ? "📋" : "🏘️"}
            </span>
            <h3 className="font-bold text-gray-900">{evento.titulo}</h3>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            📅 {new Date(evento.fecha).toLocaleDateString("es-ES")} | 🕐{" "}
            {evento.horario}
          </p>
          {evento.lugar && (
            <p className="text-sm text-gray-600">📍 {evento.lugar}</p>
          )}
        </div>
        <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-semibold">
          {es_reunion ? "Confirmación" : "Configuración"}
        </div>
      </div>

      <p className="text-sm text-gray-700">{evento.objetivo}</p>

      <div className="flex gap-2">
        {es_reunion ? (
          <button
            onClick={onConfirmar}
            disabled={procesando}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-3 rounded text-sm transition"
          >
            {procesando ? "⏳ Confirmando..." : "✓ Confirmar Asistencia"}
          </button>
        ) : (
          <button
            onClick={onConfiguraParticipantes}
            disabled={procesando}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-2 px-3 rounded text-sm transition"
          >
            {procesando ? "⏳ Guardando..." : "⚙️ Configurar Participación"}
          </button>
        )}
      </div>
    </div>
  );
}

// ============ COMPONENTE: Modal Reunión (Confirmación simple) ============
interface ModalReunionProps {
  evento: EventoGlobal;
  onConfirmar: () => void;
  onRechazar: () => void;
  procesando: boolean;
  onClose: () => void;
}

function ModalReunion({
  evento,
  onConfirmar,
  onRechazar,
  procesando,
  onClose,
}: ModalReunionProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-4 max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Confirmar Asistencia</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ✕
        </button>
      </div>

      <div className="bg-blue-50 p-4 rounded space-y-2 text-sm">
        <h3 className="font-bold text-gray-900">{evento.titulo}</h3>
        <p>
          <strong>📅 Fecha:</strong>{" "}
          {new Date(evento.fecha).toLocaleDateString("es-ES")}
        </p>
        <p>
          <strong>🕐 Horario:</strong> {evento.horario}
        </p>
        {evento.lugar && (
          <p>
            <strong>📍 Lugar:</strong> {evento.lugar}
          </p>
        )}
        <p>
          <strong>🎯 Objetivo:</strong> {evento.objetivo}
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
        <p className="text-sm text-yellow-800">
          ⚠️ Por favor confirma si asistirás a esta reunión de técnicos
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onConfirmar}
          disabled={procesando}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 rounded transition"
        >
          {procesando ? "⏳ Confirmando..." : "✓ Confirmar Asistencia"}
        </button>

        <button
          onClick={onRechazar}
          disabled={procesando}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-2 rounded transition"
        >
          {procesando ? "⏳ Rechazando..." : "✕ No puedo asistir"}
        </button>
      </div>
    </div>
  );
}

// ============ COMPONENTE: Modal Encuentro (Selección de comunidades y participantes) ============
interface ModalEncuentroProps {
  evento: EventoGlobal;
  comunidades: Comunidad[];
  participantes: Participante[];
  respuestasEvento: Record<string, any>;
  onRespuestaChange: (comunidadId: string, campo: string, valor: any) => void;
  onGuardar: () => void;
  procesando: boolean;
  onClose: () => void;
}

function ModalEncuentro({
  evento,
  comunidades,
  participantes,
  respuestasEvento,
  onRespuestaChange,
  onGuardar,
  procesando,
  onClose,
}: ModalEncuentroProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-4 max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">{evento.titulo}</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ✕
        </button>
      </div>

      <div className="bg-blue-50 p-3 rounded space-y-2 text-sm">
        <p>
          <strong>📅 Fecha:</strong>{" "}
          {new Date(evento.fecha).toLocaleDateString("es-ES")}
        </p>
        <p>
          <strong>🕐 Horario:</strong> {evento.horario}
        </p>
        {evento.lugar && (
          <p>
            <strong>📍 Lugar:</strong> {evento.lugar}
          </p>
        )}
        <p>
          <strong>🎯 Objetivo:</strong> {evento.objetivo}
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
        <p className="text-sm text-yellow-800">
          ℹ️ Selecciona las comunidades en las que participarás y los participantes
          que asistirán
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-gray-900">Comunidades</h3>
        {comunidades.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No tienes comunidades asignadas
          </p>
        ) : (
          comunidades.map((comunidad) => (
            <div
              key={comunidad.id}
              className="border rounded-lg p-3 space-y-2 bg-gray-50"
            >
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    respuestasEvento[comunidad.id]?.participa === "si"
                  }
                  onChange={(e) =>
                    onRespuestaChange(
                      comunidad.id,
                      "participa",
                      e.target.checked ? "si" : "no"
                    )
                  }
                  className="w-4 h-4"
                />
                {comunidad.nombre}
              </label>

              {respuestasEvento[comunidad.id]?.participa === "si" && (
                <div className="space-y-2 ml-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-2">
                      Seleccionar participantes
                    </label>

                    {/* Botón Todos */}
                    <button
                      onClick={() => {
                        const todos = participantes
                          .filter((p) => p.comunidadId === comunidad.id)
                          .map((p) => p.id);
                        onRespuestaChange(
                          comunidad.id,
                          "participantes",
                          todos
                        );
                      }}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded mt-1 transition"
                    >
                      ✓ Todos
                    </button>

                    {/* Lista de participantes */}
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      {participantes
                        .filter((p) => p.comunidadId === comunidad.id)
                        .map((participante) => (
                          <label
                            key={participante.id}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={
                                respuestasEvento[
                                  comunidad.id
                                ]?.participantes?.includes(participante.id) ||
                                false
                              }
                              onChange={(e) => {
                                const lista =
                                  respuestasEvento[comunidad.id]
                                    ?.participantes || [];
                                if (e.target.checked) {
                                  onRespuestaChange(
                                    comunidad.id,
                                    "participantes",
                                    [...lista, participante.id]
                                  );
                                } else {
                                  onRespuestaChange(
                                    comunidad.id,
                                    "participantes",
                                    lista.filter(
                                      (id: string) => id !== participante.id
                                    )
                                  );
                                }
                              }}
                              className="w-4 h-4"
                            />
                            <span>
                              {participante.nombres} {participante.apellidos}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>

                  <textarea
                    placeholder="Observación o requerimiento"
                    value={respuestasEvento[comunidad.id]?.observacion || ""}
                    onChange={(e) =>
                      onRespuestaChange(
                        comunidad.id,
                        "observacion",
                        e.target.value
                      )
                    }
                    className="w-full border rounded p-2 text-sm"
                    rows={2}
                  />
                </div>
              )}

              {respuestasEvento[comunidad.id]?.participa === "no" && (
                <textarea
                  placeholder="Justificación de no participación"
                  value={respuestasEvento[comunidad.id]?.justificacion || ""}
                  onChange={(e) =>
                    onRespuestaChange(
                      comunidad.id,
                      "justificacion",
                      e.target.value
                    )
                  }
                  className="w-full border rounded p-2 text-sm ml-6"
                  rows={2}
                />
              )}
            </div>
          ))
        )}
      </div>

      <button
        onClick={onGuardar}
        disabled={procesando}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 rounded transition"
      >
        {procesando ? "⏳ Guardando..." : "✓ Enviar Respuesta"}
      </button>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function PlanificacionPage() {
  const { user } = useAuth();

  const {
    semanaActiva,
    comunidades,
    participantes,
    eventosGlobales,
    alertas,
    loading,
    error,
    recargar,
  } = useCargarDatos(user?.uid);

  const {
    planId,
    setPlanId,
    objetivo,
    setObjetivo,
    actividades,
    setActividades,
    estado,
    setEstado,
  } = usePlanificacion(user?.uid, semanaActiva?.id);

  const [eventoModalActivo, setEventoModalActivo] = useState<string | null>(
    null
  );
  const [tipoModalActivo, setTipoModalActivo] = useState<"reunion" | "encuentro" | null>(
    null
  );
  const [respuestasEvento, setRespuestasEvento] = useState<Record<string, any>>(
    {}
  );
  const [procesando, setProcesando] = useState(false);

  // ============ MANEJADORES ============

  const handleActualizarRespuesta = useCallback(
    (comunidadId: string, campo: string, valor: any) => {
      setRespuestasEvento((prev) => ({
        ...prev,
        [comunidadId]: {
          ...prev[comunidadId],
          [campo]: valor,
        },
      }));
    },
    []
  );

  const handleConfirmarReunion = useCallback(
    async (eventoId: string) => {
      if (!user) return;

      try {
        setProcesando(true);
        await addDoc(collection(db, "respuestasEventos"), {
          eventoId,
          tecnicoId: user.uid,
          tipoRespuesta: "reunion",
          confirmado: true,
          createdAt: serverTimestamp(),
        });

        alert("✅ Asistencia confirmada");
        setEventoModalActivo(null);
        setTipoModalActivo(null);
        recargar();
      } catch (error) {
        alert("❌ Error al confirmar asistencia");
        console.error(error);
      } finally {
        setProcesando(false);
      }
    },
    [user, recargar]
  );

  const handleRechazarReunion = useCallback(
    async (eventoId: string) => {
      if (!user) return;

      try {
        setProcesando(true);
        await addDoc(collection(db, "respuestasEventos"), {
          eventoId,
          tecnicoId: user.uid,
          tipoRespuesta: "reunion",
          confirmado: false,
          createdAt: serverTimestamp(),
        });

        alert("✅ Respuesta registrada");
        setEventoModalActivo(null);
        setTipoModalActivo(null);
        recargar();
      } catch (error) {
        alert("❌ Error al registrar respuesta");
        console.error(error);
      } finally {
        setProcesando(false);
      }
    },
    [user, recargar]
  );

  const handleGuardarEncuentro = useCallback(
    async (eventoId: string) => {
      if (!user) return;

      // Validar que al menos una comunidad fue seleccionada
      const algunaSeleccionada = Object.values(respuestasEvento).some(
        (r: any) => r.participa === "si"
      );

      if (!algunaSeleccionada) {
        alert("⚠️ Debes seleccionar al menos una comunidad");
        return;
      }

      try {
        setProcesando(true);
        await addDoc(collection(db, "respuestasEventos"), {
          eventoId,
          tecnicoId: user.uid,
          tipoRespuesta: "encuentro",
          respuestas: respuestasEvento,
          createdAt: serverTimestamp(),
        });

        alert("✅ Respuesta enviada correctamente");
        setEventoModalActivo(null);
        setTipoModalActivo(null);
        setRespuestasEvento({});
        recargar();
      } catch (error) {
        alert("❌ Error al guardar la respuesta");
        console.error(error);
      } finally {
        setProcesando(false);
      }
    },
    [user, respuestasEvento, recargar]
  );

  const handleAbreModalReunion = useCallback(
    (eventoId: string) => {
      setEventoModalActivo(eventoId);
      setTipoModalActivo("reunion");
      setRespuestasEvento({});
    },
    []
  );

  const handleAbreModalEncuentro = useCallback(
    (eventoId: string) => {
      setEventoModalActivo(eventoId);
      setTipoModalActivo("encuentro");
      setRespuestasEvento({});
    },
    []
  );

  const handleAgregarActividad = useCallback(() => {
    if (estado === "enviado") {
      alert("La planificación ya fue enviada");
      return;
    }

    setActividades([
      ...actividades,
      {
        comunidadId: "",
        comunidadNombre: "",
        componente: "",
        actividad: "",
        dia: "",
        fecha: "",
        horario: "",
        objetivoEspecifico: "",
        productoEsperado: "",
      },
    ]);
  }, [estado, actividades, setActividades]);

  const handleActualizarActividad = useCallback(
    (index: number, campo: string, valor: string) => {
      if (estado === "enviado") return;

      const nuevas = [...actividades];
      nuevas[index][campo as keyof Actividad] = valor;

      if (campo === "fecha") {
        const fechaObj = new Date(valor);
        const opciones: Intl.DateTimeFormatOptions = {
          day: "2-digit",
          month: "short",
        };
        nuevas[index].dia = fechaObj
          .toLocaleDateString("es-ES", opciones)
          .replace(".", "");
      }

      if (campo === "comunidadId") {
        const comunidad = comunidades.find((c) => c.id === valor);
        nuevas[index].comunidadNombre = comunidad?.nombre || "";
      }

      setActividades(nuevas);
    },
    [estado, actividades, comunidades, setActividades]
  );

  const handleValidar = useCallback(() => {
    if (!objetivo.trim()) {
      alert("Ingrese el objetivo semanal");
      return false;
    }

    if (actividades.length === 0) {
      alert("Debe agregar al menos una actividad");
      return false;
    }

    return true;
  }, [objetivo, actividades]);

  const handleGuardarPlanificacion = useCallback(
    async (nuevoEstado: "borrador" | "enviado") => {
      if (!user || !semanaActiva) return;
      if (!handleValidar()) return;

      if (estado === "enviado") {
        alert("La planificación ya fue enviada");
        return;
      }

      try {
        setProcesando(true);

        const data = {
          semanaId: semanaActiva.id,
          tecnicoId: user.uid,
          tecnicoEmail: user.email,
          objetivoSemana: objetivo,
          actividades,
          estado: nuevoEstado,
          fechaActualizacion: serverTimestamp(),
        };

        if (planId) {
          await updateDoc(doc(db, "planificaciones", planId), data);
        } else {
          const docRef = await addDoc(
            collection(db, "planificaciones"),
            data
          );
          setPlanId(docRef.id);
        }

        setEstado(nuevoEstado);
        alert(
          nuevoEstado === "enviado"
            ? "✅ Planificación enviada correctamente"
            : "💾 Borrador guardado"
        );
      } catch (error) {
        alert("❌ Error al guardar la planificación");
        console.error(error);
      } finally {
        setProcesando(false);
      }
    },
    [
      user,
      semanaActiva,
      estado,
      planId,
      objetivo,
      actividades,
      handleValidar,
      setEstado,
      setPlanId,
    ]
  );

  const handleGenerarPDF = useCallback(() => {
    if (!semanaActiva) return;

    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("PROYECTO MONTECRISTI CRECE EN VALORES", 14, 15);

    doc.setFontSize(11);
    doc.text(
      `Semana: ${semanaActiva.fechaInicio} al ${semanaActiva.fechaFin}`,
      14,
      25
    );

    doc.text(`Objetivo: ${objetivo}`, 14, 35);

    const tableData = actividades.map((act, index) => [
      String(index + 1),
      act.comunidadNombre,
      act.componente,
      act.actividad,
      act.fecha || act.dia,
      act.horario,
      act.objetivoEspecifico,
      act.productoEsperado,
    ]);

    autoTable(doc, {
      startY: 45,
      head: [
        [
          "N°",
          "Comunidad",
          "Componente",
          "Actividad",
          "Fecha",
          "Horario",
          "Objetivo específico",
          "Producto esperado",
        ],
      ],
      body: tableData,
      styles: { fontSize: 8 },
    });

    doc.save(
      `Planificacion_${semanaActiva.fechaInicio}_${semanaActiva.fechaFin}.pdf`
    );
  }, [semanaActiva, objetivo, actividades]);

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">
            Cargando planificación...
          </p>
        </div>
      </div>
    );
  }

  if (!semanaActiva) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 m-6">
        <p className="text-yellow-800 font-medium">
          ⚠️ No hay semana activa en el sistema
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-6">
        <p className="text-red-800 font-medium">❌ {error}</p>
      </div>
    );
  }

  const eventoActual = eventosGlobales.find(
    (e) => e.id === eventoModalActivo
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Encabezado */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            📋 Planificación Semanal
          </h1>
          <p className="text-gray-600 mt-1">
            {semanaActiva.fechaInicio} al {semanaActiva.fechaFin}
          </p>
        </div>

        {/* Estado de planificación */}
        <div
          className={`rounded-lg p-4 font-semibold flex items-center gap-2 ${
            estado === "enviado"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-yellow-100 text-yellow-800 border border-yellow-300"
          }`}
        >
          <span className="text-xl">{estado === "enviado" ? "✅" : "📝"}</span>
          Estado: {estado === "enviado" ? "Enviado" : "Borrador"}
        </div>

        {/* ALERTAS DE EVENTOS GLOBALES */}
        {alertas.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔔</span>
              <h2 className="text-xl font-bold text-gray-900">
                Eventos Globales Pendientes ({alertas.length})
              </h2>
            </div>

            {alertas.map((alerta) => {
              const evento = eventosGlobales.find(
                (e) => e.id === alerta.eventoId
              );
              const esReunion = alerta.tipo === "reunion";

              return (
                <CardAlerta
                  key={alerta.id}
                  alerta={alerta}
                  evento={evento || null}
                  onConfirmar={() => handleAbreModalReunion(alerta.eventoId)}
                  onConfiguraParticipantes={() =>
                    handleAbreModalEncuentro(alerta.eventoId)
                  }
                  procesando={procesando}
                />
              );
            })}
          </div>
        )}

        {/* MODALES */}
        {eventoModalActivo && eventoActual && tipoModalActivo === "reunion" && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ModalReunion
              evento={eventoActual}
              onConfirmar={() => handleConfirmarReunion(eventoActual.id)}
              onRechazar={() => handleRechazarReunion(eventoActual.id)}
              procesando={procesando}
              onClose={() => {
                setEventoModalActivo(null);
                setTipoModalActivo(null);
              }}
            />
          </div>
        )}

        {eventoModalActivo && eventoActual && tipoModalActivo === "encuentro" && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ModalEncuentro
              evento={eventoActual}
              comunidades={comunidades}
              participantes={participantes}
              respuestasEvento={respuestasEvento}
              onRespuestaChange={handleActualizarRespuesta}
              onGuardar={() => handleGuardarEncuentro(eventoActual.id)}
              procesando={procesando}
              onClose={() => {
                setEventoModalActivo(null);
                setTipoModalActivo(null);
                setRespuestasEvento({});
              }}
            />
          </div>
        )}

        {/* PLANIFICACIÓN REGULAR */}
        <div className="space-y-6">
          {/* Objetivo */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Objetivo de la Semana
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Describe el objetivo principal de esta semana"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              disabled={estado === "enviado"}
            />
          </div>

          {/* Actividades */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Actividades</h3>

            {actividades.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                <p>No hay actividades. Agrega una para comenzar.</p>
              </div>
            ) : (
              actividades.map((actividad, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg shadow-md p-6 space-y-3 border-l-4 border-blue-500"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                      className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={actividad.comunidadId}
                      onChange={(e) =>
                        handleActualizarActividad(
                          index,
                          "comunidadId",
                          e.target.value
                        )
                      }
                      disabled={estado === "enviado"}
                    >
                      <option value="">Seleccione comunidad</option>
                      {comunidades.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>

                    <input
                      placeholder="Componente"
                      className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={actividad.componente}
                      onChange={(e) =>
                        handleActualizarActividad(
                          index,
                          "componente",
                          e.target.value
                        )
                      }
                      disabled={estado === "enviado"}
                    />
                  </div>

                  <input
                    placeholder="Actividad"
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={actividad.actividad}
                    onChange={(e) =>
                      handleActualizarActividad(
                        index,
                        "actividad",
                        e.target.value
                      )
                    }
                    disabled={estado === "enviado"}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="date"
                      className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={actividad.fecha || ""}
                      onChange={(e) =>
                        handleActualizarActividad(
                          index,
                          "fecha",
                          e.target.value
                        )
                      }
                      disabled={estado === "enviado"}
                    />

                    <input
                      placeholder="Horario (ej: 2:00 PM - 4:00 PM)"
                      className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={actividad.horario}
                      onChange={(e) =>
                        handleActualizarActividad(
                          index,
                          "horario",
                          e.target.value
                        )
                      }
                      disabled={estado === "enviado"}
                    />
                  </div>

                  <textarea
                    placeholder="Objetivo específico"
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                    value={actividad.objetivoEspecifico}
                    onChange={(e) =>
                      handleActualizarActividad(
                        index,
                        "objetivoEspecifico",
                        e.target.value
                      )
                    }
                    disabled={estado === "enviado"}
                  />

                  <textarea
                    placeholder="Producto esperado"
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                    value={actividad.productoEsperado}
                    onChange={(e) =>
                      handleActualizarActividad(
                        index,
                        "productoEsperado",
                        e.target.value
                      )
                    }
                    disabled={estado === "enviado"}
                  />
                </div>
              ))
            )}
          </div>

          {/* Botones */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAgregarActividad}
              disabled={estado === "enviado"}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              ➕ Agregar actividad
            </button>

            <button
              onClick={() => handleGuardarPlanificacion("borrador")}
              disabled={procesando || estado === "enviado"}
              className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              {procesando ? "⏳ Guardando..." : "💾 Guardar borrador"}
            </button>

            <button
              onClick={() => handleGuardarPlanificacion("enviado")}
              disabled={procesando || estado === "enviado"}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              {procesando ? "⏳ Enviando..." : "✓ Enviar planificación"}
            </button>

            <button
              onClick={handleGenerarPDF}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              📄 Descargar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}