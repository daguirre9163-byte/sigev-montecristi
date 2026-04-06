"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";

// ============ TIPOS ============
interface Semana {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  limitePlanificacion?: any;
  limiteSeguimiento?: any;
  activa: boolean;
  createdAt?: any;
}

interface FormSemana {
  fechaInicio: string;
  fechaFin: string;
  limitePlanificacion: string;
  limiteSeguimiento: string;
}

interface ValidationError {
  field: string;
  message: string;
}

interface EstadisticasSemana {
  totalPlanificaciones: number;
  planificacionesEnviadas: number;
  totalSeguimientos: number;
  seguimientosEnviados: number;
}

// ============ VALIDACIONES ============
const validarFormulario = (form: FormSemana): ValidationError[] => {
  const errores: ValidationError[] = [];

  if (!form.fechaInicio) {
    errores.push({
      field: "fechaInicio",
      message: "La fecha de inicio es requerida",
    });
  }

  if (!form.fechaFin) {
    errores.push({
      field: "fechaFin",
      message: "La fecha de fin es requerida",
    });
  }

  if (form.fechaInicio && form.fechaFin) {
    if (form.fechaFin < form.fechaInicio) {
      errores.push({
        field: "fechaFin",
        message: "La fecha de fin debe ser posterior a la de inicio",
      });
    }
  }

  if (form.limitePlanificacion && form.limiteSeguimiento) {
    if (form.limiteSeguimiento < form.limitePlanificacion) {
      errores.push({
        field: "limiteSeguimiento",
        message: "El límite de seguimiento debe ser posterior al de planificación",
      });
    }
  }

  return errores;
};

// ============ COMPONENTE: Input ============
interface InputProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

function Input({
  label,
  type = "text",
  value,
  onChange,
  error,
  required = false,
}: InputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
    </div>
  );
}

// ============ COMPONENTE: Modal de Gestión ============
interface ModalGestionProps {
  semana: Semana;
  estadisticas: EstadisticasSemana;
  onClose: () => void;
  onActualizar: () => void;
  procesando: boolean;
}

function ModalGestion({
  semana,
  estadisticas,
  onClose,
  onActualizar,
  procesando,
}: ModalGestionProps) {
  const [accion, setAccion] = useState<"cambiar_planificaciones" | "cambiar_seguimientos" | null>(
    null
  );
  const [procesandoAccion, setProcesandoAccion] = useState(false);

  const handleCambiarEstado = async (tipo: "planificaciones" | "seguimientos", nuevoEstado: "borrador" | "enviado") => {
    if (!confirm(`¿Cambiar todas las ${tipo} a ${nuevoEstado}?`)) return;

    try {
      setProcesandoAccion(true);

      const query2 = query(
        collection(db, tipo === "planificaciones" ? "planificaciones" : "seguimientos"),
        where("semanaId", "==", semana.id)
      );

      const snap = await getDocs(query2);

      for (const docSnap of snap.docs) {
        await updateDoc(doc(db, tipo === "planificaciones" ? "planificaciones" : "seguimientos", docSnap.id), {
          estado: nuevoEstado,
        });
      }

      alert(`${tipo} actualizadas a ${nuevoEstado}`);
      setProcesandoAccion(false);
      setAccion(null);
      onActualizar();
    } catch (error) {
      alert("Error al actualizar");
      setProcesandoAccion(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Gestionar Semana: {semana.fechaInicio} a {semana.fechaFin}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-gray-600 text-sm font-semibold">Planificaciones</p>
            <p className="text-2xl font-bold text-blue-600">
              {estadisticas.planificacionesEnviadas}/{estadisticas.totalPlanificaciones}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-gray-600 text-sm font-semibold">Seguimientos</p>
            <p className="text-2xl font-bold text-green-600">
              {estadisticas.seguimientosEnviados}/{estadisticas.totalSeguimientos}
            </p>
          </div>
        </div>

        {accion === null ? (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900">Selecciona una acción</h3>

            <button
              onClick={() => setAccion("cambiar_planificaciones")}
              className="w-full p-4 border-2 border-blue-300 rounded-lg hover:bg-blue-50 transition text-left space-y-2"
            >
              <p className="font-semibold text-blue-800">📋 Gestionar Planificaciones</p>
              <p className="text-sm text-gray-600">
                {estadisticas.totalPlanificaciones} total - {estadisticas.planificacionesEnviadas} enviadas
              </p>
            </button>

            <button
              onClick={() => setAccion("cambiar_seguimientos")}
              className="w-full p-4 border-2 border-green-300 rounded-lg hover:bg-green-50 transition text-left space-y-2"
            >
              <p className="font-semibold text-green-800">✓ Gestionar Seguimientos</p>
              <p className="text-sm text-gray-600">
                {estadisticas.totalSeguimientos} total - {estadisticas.seguimientosEnviados} enviados
              </p>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900">
              {accion === "cambiar_planificaciones"
                ? "Cambiar estado de Planificaciones"
                : "Cambiar estado de Seguimientos"}
            </h3>

            <div className="space-y-2">
              <button
                onClick={() =>
                  handleCambiarEstado(
                    accion === "cambiar_planificaciones"
                      ? "planificaciones"
                      : "seguimientos",
                    "borrador"
                  )
                }
                disabled={procesandoAccion}
                className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
              >
                {procesandoAccion ? "⏳ Procesando..." : "📝 Cambiar a Borrador"}
              </button>

              <button
                onClick={() =>
                  handleCambiarEstado(
                    accion === "cambiar_planificaciones"
                      ? "planificaciones"
                      : "seguimientos",
                    "enviado"
                  )
                }
                disabled={procesandoAccion}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
              >
                {procesandoAccion ? "⏳ Procesando..." : "✅ Cambiar a Enviado"}
              </button>
            </div>

            <button
              onClick={() => setAccion(null)}
              className="w-full bg-gray-400 hover:bg-gray-500 text-white font-semibold py-3 rounded-lg transition"
            >
              Atrás
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-3 rounded-lg transition"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ============ COMPONENTE: Tabla de Semanas ============
interface TablaSemanaProps {
  semanas: Semana[];
  onActivar: (id: string) => void;
  onCerrar: (id: string) => void;
  onGestionar: (semana: Semana) => void;
  procesando: boolean;
}

function TablaSemanans({
  semanas,
  onActivar,
  onCerrar,
  onGestionar,
  procesando,
}: TablaSemanaProps) {
  const formatDate = (date: string | Date) => {
    if (!date) return "-";
    try {
      if (typeof date === "string") {
        return new Date(date).toLocaleDateString("es-ES");
      }
      return date.toLocaleDateString("es-ES");
    } catch {
      return "-";
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <tr>
            <th className="px-6 py-4 text-left font-semibold">Inicio</th>
            <th className="px-6 py-4 text-left font-semibold">Fin</th>
            <th className="px-6 py-4 text-left font-semibold">Límite Planificación</th>
            <th className="px-6 py-4 text-left font-semibold">Límite Seguimiento</th>
            <th className="px-6 py-4 text-center font-semibold">Estado</th>
            <th className="px-6 py-4 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {semanas.map((semana) => (
            <tr key={semana.id} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 font-medium text-gray-900">
                {formatDate(semana.fechaInicio)}
              </td>
              <td className="px-6 py-4 font-medium text-gray-900">
                {formatDate(semana.fechaFin)}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {formatDate(
                  semana.limitePlanificacion?.toDate?.()
                    ? semana.limitePlanificacion.toDate()
                    : semana.limitePlanificacion
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {formatDate(
                  semana.limiteSeguimiento?.toDate?.()
                    ? semana.limiteSeguimiento.toDate()
                    : semana.limiteSeguimiento
                )}
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-4 py-2 rounded-full text-sm font-semibold text-white ${
                    semana.activa ? "bg-green-600" : "bg-gray-500"
                  }`}
                >
                  {semana.activa ? "✅ Activa" : "⏸️ Cerrada"}
                </span>
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                <button
                  onClick={() => onGestionar(semana)}
                  disabled={procesando}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition text-sm"
                  title="Gestionar planificaciones y seguimientos"
                >
                  ⚙️ Gestionar
                </button>

                {!semana.activa && (
                  <button
                    onClick={() => onActivar(semana.id)}
                    disabled={procesando}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition text-sm"
                  >
                    ▶️ Activar
                  </button>
                )}

                {semana.activa && (
                  <button
                    onClick={() => onCerrar(semana.id)}
                    disabled={procesando}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition text-sm"
                  >
                    ⏹️ Cerrar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function SemanasAdmin() {
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const [form, setForm] = useState<FormSemana>({
    fechaInicio: "",
    fechaFin: "",
    limitePlanificacion: "",
    limiteSeguimiento: "",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<Semana | null>(null);
  const [estadisticasModal, setEstadisticasModal] = useState<EstadisticasSemana>({
    totalPlanificaciones: 0,
    planificacionesEnviadas: 0,
    totalSeguimientos: 0,
    seguimientosEnviados: 0,
  });

  const erroresValidacion = useMemo(
    () => validarFormulario(form),
    [form]
  );

  // Cargar semanas
  useEffect(() => {
    cargarSemanas();
  }, []);

  const cargarSemanas = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "semanas"));

      const lista = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Semana));

      lista.sort((a: any, b: any) =>
        b.fechaInicio.localeCompare(a.fechaInicio)
      );

      setSemanas(lista);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Crear semana
  const handleCrearSemana = async () => {
    if (erroresValidacion.length > 0) {
      alert("Por favor corrija los errores");
      return;
    }

    const existe = semanas.find(
      (s) => s.fechaInicio === form.fechaInicio
    );

    if (existe) {
      alert("Una semana con esta fecha de inicio ya existe");
      return;
    }

    try {
      setProcesando(true);

      await addDoc(collection(db, "semanas"), {
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        limitePlanificacion: form.limitePlanificacion
          ? Timestamp.fromDate(new Date(form.limitePlanificacion))
          : null,
        limiteSeguimiento: form.limiteSeguimiento
          ? Timestamp.fromDate(new Date(form.limiteSeguimiento))
          : null,
        activa: false,
        createdAt: serverTimestamp(),
      });

      alert("✅ Semana creada correctamente");

      setForm({
        fechaInicio: "",
        fechaFin: "",
        limitePlanificacion: "",
        limiteSeguimiento: "",
      });

      cargarSemanas();
    } catch (error) {
      alert("❌ Error al crear la semana");
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  // Activar semana
  const handleActivarSemana = async (id: string) => {
    if (!confirm("¿Está seguro que desea activar esta semana?")) return;

    try {
      setProcesando(true);

      // Desactivar todas
      const snap = await getDocs(collection(db, "semanas"));
      for (const docSnap of snap.docs) {
        await updateDoc(doc(db, "semanas", docSnap.id), {
          activa: false,
        });
      }

      // Activar seleccionada
      await updateDoc(doc(db, "semanas", id), {
        activa: true,
      });

      alert("✅ Semana activada");
      cargarSemanas();
    } catch (error) {
      alert("❌ Error al activar la semana");
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  // Cerrar semana
  const handleCerrarSemana = async (id: string) => {
    if (!confirm("¿Está seguro que desea cerrar esta semana?")) return;

    try {
      setProcesando(true);

      await updateDoc(doc(db, "semanas", id), {
        activa: false,
      });

      alert("✅ Semana cerrada");
      cargarSemanas();
    } catch (error) {
      alert("❌ Error al cerrar la semana");
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  // Abrir modal de gestión
  const handleAbrirModal = async (semana: Semana) => {
    try {
      setProcesando(true);

      // Contar planificaciones
      const planQuery = query(
        collection(db, "planificaciones"),
        where("semanaId", "==", semana.id)
      );
      const planSnap = await getDocs(planQuery);

      const planificacionesEnviadas = planSnap.docs.filter(
        (d) => d.data().estado === "enviado"
      ).length;

      // Contar seguimientos
      const segQuery = query(
        collection(db, "seguimientos"),
        where("semanaId", "==", semana.id)
      );
      const segSnap = await getDocs(segQuery);

      const seguimientosEnviados = segSnap.docs.filter(
        (d) => d.data().estado === "enviado"
      ).length;

      setEstadisticasModal({
        totalPlanificaciones: planSnap.size,
        planificacionesEnviadas,
        totalSeguimientos: segSnap.size,
        seguimientosEnviados,
      });

      setSemanaSeleccionada(semana);
      setModalOpen(true);
    } catch (error) {
      alert("Error al cargar estadísticas");
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando semanas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            📅 Gestión de Semanas
          </h1>
          <p className="text-gray-600 mt-2">
            Crea, activa y gestiona semanas de trabajo
          </p>
        </div>

        {/* Formulario de Creación */}
        <div className="bg-white rounded-lg shadow-md p-8 space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">
            ➕ Crear Nueva Semana
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Fecha de Inicio"
              type="date"
              value={form.fechaInicio}
              onChange={(value) =>
                setForm({ ...form, fechaInicio: value })
              }
              error={
                erroresValidacion.find((e) => e.field === "fechaInicio")
                  ?.message
              }
              required
            />

            <Input
              label="Fecha de Fin"
              type="date"
              value={form.fechaFin}
              onChange={(value) => setForm({ ...form, fechaFin: value })}
              error={
                erroresValidacion.find((e) => e.field === "fechaFin")?.message
              }
              required
            />

            <Input
              label="Límite de Planificación"
              type="date"
              value={form.limitePlanificacion}
              onChange={(value) =>
                setForm({ ...form, limitePlanificacion: value })
              }
            />

            <Input
              label="Límite de Seguimiento"
              type="date"
              value={form.limiteSeguimiento}
              onChange={(value) =>
                setForm({ ...form, limiteSeguimiento: value })
              }
              error={
                erroresValidacion.find((e) => e.field === "limiteSeguimiento")
                  ?.message
              }
            />
          </div>

          <button
            onClick={handleCrearSemana}
            disabled={procesando || erroresValidacion.length > 0}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
          >
            {procesando ? "⏳ Creando..." : "✅ Crear Semana"}
          </button>
        </div>

        {/* Tabla de Semanas */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            📋 Semanas Registradas ({semanas.length})
          </h2>

          {semanas.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <p className="text-yellow-800 font-medium">
                No hay semanas creadas. Crea una nueva para comenzar.
              </p>
            </div>
          ) : (
            <TablaSemanans
              semanas={semanas}
              onActivar={handleActivarSemana}
              onCerrar={handleCerrarSemana}
              onGestionar={handleAbrirModal}
              procesando={procesando}
            />
          )}
        </div>

        {/* Modal de Gestión */}
        {modalOpen && semanaSeleccionada && (
          <ModalGestion
            semana={semanaSeleccionada}
            estadisticas={estadisticasModal}
            onClose={() => setModalOpen(false)}
            onActualizar={cargarSemanas}
            procesando={procesando}
          />
        )}
      </div>
    </div>
  );
}