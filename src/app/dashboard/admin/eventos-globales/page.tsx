"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";

// ============ TIPOS ============
interface Tecnico {
  id: string;
  nombre: string;
  email: string;
  rol: "tecnico" | "admin";
  estado: "activo" | "inactivo";
  [key: string]: any;
}

interface Comunidad {
  id: string;
  nombre: string;
  tecnicoId: string;
  estado: "activo" | "inactivo";
  [key: string]: any;
}

interface FormData {
  titulo: string;
  tipoEvento: "tecnicos" | "clubes" | "promotores" | "liderazgo" | "";
  lugar: string;
  fecha: string;
  horario: string;
  objetivo: string;
  producto: string;
}

interface EventoGlobal {
  id?: string;
  titulo: string;
  tipoEvento: string;
  lugar: string;
  fecha: string;
  horario: string;
  objetivo: string;
  producto: string;
  tecnicosIds: string[];
  comunidadesIds?: string[]; // Solo para registrar a qué comunidades aplica (informativo)
  createdAt?: any;
  createdBy?: string;
}

interface ValidationError {
  field: keyof FormData;
  message: string;
}

// ============ CONSTANTES ============
const TIPOS_EVENTO = [
  { value: "tecnicos", label: "Reunión de Técnicos" },
  { value: "clubes", label: "Encuentro de Clubes" },
  { value: "promotores", label: "Encuentro de Promotores" },
  { value: "liderazgo", label: "Escuela de Liderazgo" },
] as const;

const INITIAL_FORM: FormData = {
  titulo: "",
  tipoEvento: "",
  lugar: "",
  fecha: "",
  horario: "",
  objetivo: "",
  producto: "",
};

// ============ VALIDACIONES ============
const validarFormulario = (form: FormData): ValidationError[] => {
  const errores: ValidationError[] = [];

  if (!form.titulo.trim()) {
    errores.push({
      field: "titulo",
      message: "El título del evento es requerido",
    });
  }

  if (!form.tipoEvento) {
    errores.push({
      field: "tipoEvento",
      message: "Debe seleccionar un tipo de evento",
    });
  }

  if (!form.fecha) {
    errores.push({
      field: "fecha",
      message: "La fecha es requerida",
    });
  }

  const fechaEvento = new Date(form.fecha);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (fechaEvento < hoy) {
    errores.push({
      field: "fecha",
      message: "La fecha no puede ser anterior a hoy",
    });
  }

  if (!form.horario.trim()) {
    errores.push({
      field: "horario",
      message: "El horario es requerido",
    });
  }

  if (!form.objetivo.trim()) {
    errores.push({
      field: "objetivo",
      message: "El objetivo es requerido",
    });
  }

  return errores;
};

// ============ HOOK: Cargar datos ============
function useCargarDatos() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar técnicos activos
      const tecnicosSnap = await getDocs(collection(db, "usuarios"));
      const listaTecnicos = tecnicosSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Tecnico))
        .filter(
          (u) =>
            u.estado === "activo" && (u.rol === "tecnico" || u.rol === "admin")
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      setTecnicos(listaTecnicos);

      // Cargar comunidades activas
      const comunidadesSnap = await getDocs(collection(db, "comunidades"));
      const listaComunidades = comunidadesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Comunidad))
        .filter((c) => c.estado === "activo")
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      setComunidades(listaComunidades);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : "Error al cargar datos";
      setError(mensaje);
      console.error("Error al cargar datos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { tecnicos, comunidades, loading, error, recargar: cargar };
}

// ============ HOOK: Operaciones de eventos ============
function useOperacionesEventos() {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crearEvento = useCallback(
    async (evento: EventoGlobal, usuarioActualId: string): Promise<boolean> => {
      try {
        setProcesando(true);
        setError(null);

        // 1. Crear evento global
        const eventoRef = await addDoc(collection(db, "eventosGlobales"), {
          titulo: evento.titulo,
          tipoEvento: evento.tipoEvento,
          lugar: evento.lugar,
          fecha: evento.fecha,
          horario: evento.horario,
          objetivo: evento.objetivo,
          producto: evento.producto,
          tecnicosIds: evento.tecnicosIds,
          comunidadesIds: evento.comunidadesIds || [], // Informativo
          createdBy: usuarioActualId,
          createdAt: serverTimestamp(),
          activo: true,
        });

        console.log("✅ Evento creado:", eventoRef.id);

        // 2. Crear alertas para cada técnico según tipo de evento
        const esReunion = evento.tipoEvento === "tecnicos";

        for (const tecnicoId of evento.tecnicosIds) {
          if (esReunion) {
            // 🟢 REUNIÓN DE TÉCNICOS: Solo confirmación de asistencia
            await addDoc(collection(db, "alertas"), {
              tecnicoId,
              eventoId: eventoRef.id,
              tipo: "reunion",
              titulo: `Reunión: ${evento.titulo}`,
              descripcion: evento.objetivo,
              fecha: evento.fecha,
              horario: evento.horario,
              lugar: evento.lugar,
              confirmada: false,
              estado: "pendiente",
              createdAt: serverTimestamp(),
            });
          } else {
            // 🟠 ENCUENTROS: Los técnicos seleccionan comunidades en Planificación
            await addDoc(collection(db, "alertas"), {
              tecnicoId,
              eventoId: eventoRef.id,
              tipo: "actividad",
              titulo: `Evento: ${evento.titulo}`,
              descripcion: evento.objetivo,
              fecha: evento.fecha,
              horario: evento.horario,
              lugar: evento.lugar,
              tipoEvento: evento.tipoEvento,
              estado: "pendiente",
              createdAt: serverTimestamp(),
            });
          }
        }

        console.log(`✅ ${evento.tecnicosIds.length} alertas creadas`);

        // 3. Enviar notificaciones por email
        await enviarNotificacionesEmail(evento);

        return true;
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : "Error desconocido";
        setError(mensaje);
        console.error("❌ Error al crear evento:", err);
        return false;
      } finally {
        setProcesando(false);
      }
    },
    []
  );

  return {
    crearEvento,
    procesando,
    error,
    limpiarError: () => setError(null),
  };
}

// ============ FUNCIÓN: Enviar notificaciones por email ============
async function enviarNotificacionesEmail(evento: EventoGlobal) {
  try {
    const response = await fetch("/api/notificaciones/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento,
        tipo: evento.tipoEvento === "tecnicos" ? "reunion" : "evento",
      }),
    });

    const resultado = await response.json();

    if (!response.ok) {
      console.warn("⚠️ Error al enviar emails:", resultado.error);
    } else {
      console.log("✅ Emails enviados:", resultado.mensaje);
    }
  } catch (err) {
    console.warn("⚠️ Error en notificaciones:", err);
  }
}

// ============ COMPONENTE: Input con validación ============
interface InputProps {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  required = false,
}: InputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
    </div>
  );
}

// ============ COMPONENTE: Select con validación ============
interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
  required?: boolean;
}

function Select({
  label,
  value,
  onChange,
  options,
  error,
  required = false,
}: SelectProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      >
        <option value="">Seleccione una opción</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
    </div>
  );
}

// ============ COMPONENTE: Textarea con validación ============
interface TextareaProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

function Textarea({
  label,
  placeholder,
  value,
  onChange,
  error,
  required = false,
}: TextareaProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent transition resize-none ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
    </div>
  );
}

// ============ COMPONENTE: Selección de técnicos ============
interface SelectorTecnicosProps {
  tecnicos: Tecnico[];
  seleccionados: string[];
  onSeleccionChange: (ids: string[]) => void;
}

function SelectorTecnicos({
  tecnicos,
  seleccionados,
  onSeleccionChange,
}: SelectorTecnicosProps) {
  const [busqueda, setBusqueda] = useState("");

  const tecnicosFiltrados = useMemo(
    () =>
      tecnicos.filter((t) =>
        t.nombre.toLowerCase().includes(busqueda.toLowerCase())
      ),
    [tecnicos, busqueda]
  );

  const handleToggle = (id: string) => {
    if (seleccionados.includes(id)) {
      onSeleccionChange(seleccionados.filter((s) => s !== id));
    } else {
      onSeleccionChange([...seleccionados, id]);
    }
  };

  const handleSeleccionarTodos = () => {
    onSeleccionChange(tecnicos.map((t) => t.id));
  };

  const handleLimpiar = () => {
    onSeleccionChange([]);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          👨‍💼 Técnicos Participantes
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Selecciona los técnicos que participarán en este evento
        </p>
      </div>

      <input
        type="text"
        placeholder="Buscar técnico..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />

      <div className="flex gap-2">
        <button
          onClick={handleSeleccionarTodos}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition"
        >
          ✓ Seleccionar todos
        </button>
        <button
          onClick={handleLimpiar}
          className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-md transition"
        >
          ✕ Limpiar
        </button>
      </div>

      <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
        {tecnicosFiltrados.length === 0 ? (
          <p className="p-4 text-center text-gray-500">
            No hay técnicos disponibles
          </p>
        ) : (
          tecnicosFiltrados.map((tecnico) => (
            <label
              key={tecnico.id}
              className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={seleccionados.includes(tecnico.id)}
                onChange={() => handleToggle(tecnico.id)}
                className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
              />
              <span className="ml-3 font-medium text-gray-900">
                {tecnico.nombre}
              </span>
              <span className="ml-auto text-xs text-gray-500">
                {tecnico.email}
              </span>
            </label>
          ))
        )}
      </div>

      <p className="text-sm text-gray-600">
        {seleccionados.length} técnico(s) seleccionado(s)
      </p>
    </div>
  );
}

// ============ COMPONENTE: Info según tipo de evento ============
interface InfoEventoProps {
  tipoEvento: string;
}

function InfoEvento({ tipoEvento }: InfoEventoProps) {
  const mensajes = {
    tecnicos:
      "📌 Reunión de técnicos: Los técnicos recibirán una alerta para confirmar asistencia",
    clubes:
      "📌 Encuentro de Clubes: Los técnicos seleccionarán comunidades y participantes en Planificación",
    promotores:
      "📌 Encuentro de Promotores: Los técnicos seleccionarán comunidades y participantes en Planificación",
    liderazgo:
      "📌 Escuela de Liderazgo: Los técnicos seleccionarán comunidades y participantes en Planificación",
  };

  if (!tipoEvento) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-blue-800 font-medium">
        {mensajes[tipoEvento as keyof typeof mensajes]}
      </p>
    </div>
  );
}

// ============ COMPONENTE: Alertas ============
interface AlertProps {
  tipo: "success" | "error" | "info" | "warning";
  mensaje: string;
  onClose: () => void;
}

function Alert({ tipo, mensaje, onClose }: AlertProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colores = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  };

  const iconos = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
  };

  return (
    <div
      className={`border rounded-lg p-4 flex items-center justify-between ${colores[tipo]}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{iconos[tipo]}</span>
        <p className="font-medium">{mensaje}</p>
      </div>
      <button
        onClick={onClose}
        className="text-lg font-bold opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export default function EventosGlobalesPage() {
  const { tecnicos, comunidades, loading, error: errorCarga } =
    useCargarDatos();
  const { crearEvento, procesando, error: errorOperacion, limpiarError } =
    useOperacionesEventos();

  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [tecnicosSeleccionados, setTecnicosSeleccionados] = useState<string[]>(
    []
  );

  const [alerta, setAlerta] = useState<{
    activa: boolean;
    tipo: "success" | "error" | "info" | "warning";
    mensaje: string;
  }>({
    activa: false,
    tipo: "info",
    mensaje: "",
  });

  const erroresValidacion = useMemo(
    () => validarFormulario(form),
    [form]
  );

  // Manejadores
  const handleFormChange = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleLimpiar = useCallback(() => {
    setForm(INITIAL_FORM);
    setTecnicosSeleccionados([]);
    limpiarError();
  }, [limpiarError]);

  const handleCrearEvento = useCallback(async () => {
    if (erroresValidacion.length > 0) {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: "Por favor, corrija los errores en el formulario",
      });
      return;
    }

    if (tecnicosSeleccionados.length === 0) {
      setAlerta({
        activa: true,
        tipo: "warning",
        mensaje: "Debe seleccionar al menos un técnico",
      });
      return;
    }

    const evento: EventoGlobal = {
      titulo: form.titulo.trim(),
      tipoEvento: form.tipoEvento,
      lugar: form.lugar.trim(),
      fecha: form.fecha,
      horario: form.horario.trim(),
      objetivo: form.objetivo.trim(),
      producto: form.producto.trim(),
      tecnicosIds: tecnicosSeleccionados,
    };

    const exito = await crearEvento(evento, "admin_user");

    if (exito) {
      setAlerta({
        activa: true,
        tipo: "success",
        mensaje: `✨ Evento "${form.titulo}" creado exitosamente. Se han enviado notificaciones a los técnicos.`,
      });
      handleLimpiar();
    } else {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: errorOperacion || "Error al crear el evento",
      });
    }
  }, [
    form,
    erroresValidacion,
    tecnicosSeleccionados,
    crearEvento,
    errorOperacion,
    handleLimpiar,
  ]);

  // UI: Cargando
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">
            Cargando gestión de eventos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            📅 Eventos Globales
          </h1>
          <p className="text-gray-600 mt-1">
            Crea eventos para todo el equipo técnico. Los técnicos confirmarán su
            participación y seleccionarán comunidades/participantes en Planificación.
          </p>
        </div>

        {/* Alertas */}
        {alerta.activa && (
          <Alert
            tipo={alerta.tipo}
            mensaje={alerta.mensaje}
            onClose={() => setAlerta({ ...alerta, activa: false })}
          />
        )}

        {errorCarga && (
          <Alert
            tipo="error"
            mensaje={`Error al cargar datos: ${errorCarga}`}
            onClose={() => {}}
          />
        )}

        {/* Info importante */}
        <InfoEvento tipoEvento={form.tipoEvento} />

        {/* Formulario principal */}
        <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            📝 Detalles del Evento
          </h2>

          <Input
            label="Nombre del Evento"
            placeholder="ej: Reunión trimestral de técnicos"
            value={form.titulo}
            onChange={(value) => handleFormChange("titulo", value)}
            error={
              erroresValidacion.find((e) => e.field === "titulo")?.message
            }
            required
          />

          <Select
            label="Tipo de Evento"
            value={form.tipoEvento}
            onChange={(value) =>
              handleFormChange("tipoEvento", value as any)
            }
            options={TIPOS_EVENTO}
            error={
              erroresValidacion.find((e) => e.field === "tipoEvento")?.message
            }
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Lugar"
              placeholder="ej: Salón de reuniones"
              value={form.lugar}
              onChange={(value) => handleFormChange("lugar", value)}
            />

            <Input
              label="Fecha"
              type="date"
              placeholder=""
              value={form.fecha}
              onChange={(value) => handleFormChange("fecha", value)}
              error={
                erroresValidacion.find((e) => e.field === "fecha")?.message
              }
              required
            />
          </div>

          <Input
            label="Horario"
            placeholder="ej: 2:00 PM - 4:00 PM"
            value={form.horario}
            onChange={(value) => handleFormChange("horario", value)}
            error={
              erroresValidacion.find((e) => e.field === "horario")?.message
            }
            required
          />

          <Textarea
            label="Objetivo"
            placeholder="¿Cuál es el propósito principal del evento?"
            value={form.objetivo}
            onChange={(value) => handleFormChange("objetivo", value)}
            error={
              erroresValidacion.find((e) => e.field === "objetivo")?.message
            }
            required
          />

          <Textarea
            label="Producto Esperado"
            placeholder="¿Cuáles son los resultados esperados?"
            value={form.producto}
            onChange={(value) => handleFormChange("producto", value)}
          />
        </div>

        {/* Selección de técnicos */}
        <SelectorTecnicos
          tecnicos={tecnicos}
          seleccionados={tecnicosSeleccionados}
          onSeleccionChange={setTecnicosSeleccionados}
        />

        {/* Botón de creación */}
        <div className="bg-white p-6 rounded-lg shadow-md flex gap-3">
          <button
            onClick={handleCrearEvento}
            disabled={procesando}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition text-lg"
          >
            {procesando ? "⏳ Creando evento..." : "✨ Crear Evento Global"}
          </button>

          <button
            onClick={handleLimpiar}
            disabled={procesando}
            className="bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 text-white font-medium py-3 px-6 rounded-lg transition"
          >
            🔄 Limpiar
          </button>
        </div>

        {/* Resumen */}
        {tecnicosSeleccionados.length > 0 && (
          <div className="bg-gray-100 p-4 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-2">📊 Resumen</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>✓ Técnicos a notificar: {tecnicosSeleccionados.length}</li>
              <li>
                ✓ Tipo de evento:{" "}
                {TIPOS_EVENTO.find((t) => t.value === form.tipoEvento)?.label ||
                  "Seleccione tipo"}
              </li>
              {form.tipoEvento !== "tecnicos" && (
                <li className="text-blue-700 italic">
                  ℹ️ Los técnicos seleccionarán comunidades y participantes en
                  Planificación
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}