"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
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
  tecnicoNombre: string;
  estado: "activo" | "inactivo";
  createdAt?: any;
  [key: string]: any;
}

interface FormData {
  nombre: string;
  tecnicoId: string;
  tecnicoNombre: string;
  estado: "activo" | "inactivo";
}

interface ValidationError {
  field: keyof FormData;
  message: string;
}

// ============ CONSTANTES ============
const ESTADOS = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
] as const;

const INITIAL_FORM: FormData = {
  nombre: "",
  tecnicoId: "",
  tecnicoNombre: "",
  estado: "activo",
};

// ============ VALIDACIONES ============
const validarFormulario = (form: FormData): ValidationError[] => {
  const errores: ValidationError[] = [];

  // Validar nombre
  if (!form.nombre.trim()) {
    errores.push({
      field: "nombre",
      message: "El nombre de la comunidad es requerido",
    });
  } else if (form.nombre.trim().length < 2) {
    errores.push({
      field: "nombre",
      message: "El nombre debe tener al menos 2 caracteres",
    });
  }

  // Validar técnico
  if (!form.tecnicoId.trim()) {
    errores.push({
      field: "tecnicoId",
      message: "Debe seleccionar un técnico asignado",
    });
  }

  return errores;
};

// ============ HOOK: Cargar datos ============
function useCargarDatos() {
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar comunidades
      const comunidadesSnap = await getDocs(collection(db, "comunidades"));
      const listaC = comunidadesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Comunidad));

      listaC.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setComunidades(listaC);

      // Cargar técnicos activos
      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      const listaT = usuariosSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Tecnico))
        .filter(
          (u) => u.estado === "activo" && (u.rol === "tecnico" || u.rol === "admin")
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      setTecnicos(listaT);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : "Error al cargar datos";
      setError(mensaje);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { comunidades, tecnicos, loading, error, recargar: cargar };
}

// ============ HOOK: Operaciones ============
function useOperacionesComunidades() {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crearComunidad = useCallback(async (form: FormData): Promise<boolean> => {
    try {
      setProcesando(true);
      setError(null);

      await addDoc(collection(db, "comunidades"), {
        nombre: form.nombre.trim(),
        tecnicoId: form.tecnicoId,
        tecnicoNombre: form.tecnicoNombre.trim(),
        estado: "activo",
        createdAt: serverTimestamp(),
      });

      return true;
    } catch (err) {
      const mensaje = obtenerMensajeError(err);
      setError(mensaje);
      return false;
    } finally {
      setProcesando(false);
    }
  }, []);

  const actualizarComunidad = useCallback(
    async (id: string, form: FormData): Promise<boolean> => {
      try {
        setProcesando(true);
        setError(null);

        await updateDoc(doc(db, "comunidades", id), {
          nombre: form.nombre.trim(),
          tecnicoId: form.tecnicoId,
          tecnicoNombre: form.tecnicoNombre.trim(),
          estado: form.estado,
        });

        return true;
      } catch (err) {
        const mensaje = obtenerMensajeError(err);
        setError(mensaje);
        return false;
      } finally {
        setProcesando(false);
      }
    },
    []
  );

  const toggleEstado = useCallback(
    async (id: string, estadoActual: string): Promise<boolean> => {
      try {
        setProcesando(true);
        setError(null);

        const nuevoEstado = estadoActual === "activo" ? "inactivo" : "activo";

        await updateDoc(doc(db, "comunidades", id), {
          estado: nuevoEstado,
        });

        return true;
      } catch (err) {
        const mensaje = obtenerMensajeError(err);
        setError(mensaje);
        return false;
      } finally {
        setProcesando(false);
      }
    },
    []
  );

  return {
    crearComunidad,
    actualizarComunidad,
    toggleEstado,
    procesando,
    error,
    limpiarError: () => setError(null),
  };
}

// ============ UTILIDADES ============
const obtenerMensajeError = (error: any): string => {
  if (error instanceof Error) {
    if (error.message.includes("permission-denied")) {
      return "No tienes permisos para realizar esta acción";
    }
    return error.message;
  }
  return "Error desconocido";
};

// ============ COMPONENTE: Input con validación ============
interface InputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

function Input({
  label,
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
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
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
  placeholder?: string;
}

function Select({
  label,
  value,
  onChange,
  options,
  error,
  required = false,
  placeholder = "Seleccione una opción",
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
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      >
        <option value="">{placeholder}</option>
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

// ============ COMPONENTE: Formulario ============
interface FormularioProps {
  editandoId: string | null;
  form: FormData;
  onFormChange: (form: FormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  procesando: boolean;
  erroresValidacion: ValidationError[];
  tecnicos: Tecnico[];
}

function Formulario({
  editandoId,
  form,
  onFormChange,
  onSubmit,
  onCancel,
  procesando,
  erroresValidacion,
  tecnicos,
}: FormularioProps) {
  const esEdicion = editandoId !== null;

  const getError = (field: keyof FormData): string | undefined => {
    return erroresValidacion.find((e) => e.field === field)?.message;
  };

  const handleSeleccionarTecnico = (tecnicoId: string) => {
    const tecnico = tecnicos.find((t) => t.id === tecnicoId);
    onFormChange({
      ...form,
      tecnicoId,
      tecnicoNombre: tecnico?.nombre || "",
    });
  };

  const opcionesTecnicos = tecnicos.map((t) => ({
    value: t.id,
    label: t.nombre,
  }));

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <h2 className="text-xl font-bold text-gray-900">
        {esEdicion ? "✏️ Editar Comunidad" : "➕ Crear Nueva Comunidad"}
      </h2>

      <Input
        label="Nombre de la Comunidad"
        placeholder="ej: Barrio El Centro"
        value={form.nombre}
        onChange={(nombre) => onFormChange({ ...form, nombre })}
        error={getError("nombre")}
        required
      />

      <Select
        label="Técnico Asignado"
        value={form.tecnicoId}
        onChange={handleSeleccionarTecnico}
        options={opcionesTecnicos}
        error={getError("tecnicoId")}
        placeholder="Seleccione un técnico"
        required
      />

      {esEdicion && (
        <Select
          label="Estado"
          value={form.estado}
          onChange={(estado) =>
            onFormChange({ ...form, estado: estado as any })
          }
          options={ESTADOS}
          required
        />
      )}

      <div className="flex gap-3 pt-4">
        <button
          onClick={onSubmit}
          disabled={procesando}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition"
        >
          {procesando ? "Procesando..." : esEdicion ? "Actualizar" : "Crear"}
        </button>

        {esEdicion && (
          <button
            onClick={onCancel}
            disabled={procesando}
            className="flex-1 bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-md transition"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// ============ COMPONENTE: Tabla de comunidades ============
interface TablaComunidadesProps {
  comunidades: Comunidad[];
  onEditar: (comunidad: Comunidad) => void;
  onToggleEstado: (comunidad: Comunidad) => void;
  procesando: boolean;
}

function TablaComunidades({
  comunidades,
  onEditar,
  onToggleEstado,
  procesando,
}: TablaComunidadesProps) {
  const getEstadoBadge = (estado: string) => {
    return estado === "activo"
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
  };

  if (comunidades.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <p className="text-lg">No hay comunidades registradas</p>
        <p className="text-sm text-gray-400 mt-2">
          Crea una nueva comunidad para comenzar
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-gray-100 to-gray-50 border-b">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
              Comunidad
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
              Técnico Asignado
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
              Estado
            </th>
            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {comunidades.map((comunidad) => (
            <tr key={comunidad.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 font-medium text-gray-900">
                {comunidad.nombre}
              </td>
              <td className="px-6 py-4 text-gray-700">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {comunidad.tecnicoNombre}
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoBadge(
                    comunidad.estado
                  )}`}
                >
                  {comunidad.estado === "activo" ? "Activa" : "Inactiva"}
                </span>
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                <button
                  onClick={() => onEditar(comunidad)}
                  disabled={procesando}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                  title="Editar comunidad"
                >
                  ✏️ Editar
                </button>

                <button
                  onClick={() => onToggleEstado(comunidad)}
                  disabled={procesando}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                  title={`${
                    comunidad.estado === "activo" ? "Desactivar" : "Activar"
                  } comunidad`}
                >
                  {comunidad.estado === "activo" ? "🔒 Desactivar" : "🔓 Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ COMPONENTE: Alertas ============
interface AlertProps {
  tipo: "success" | "error" | "info";
  mensaje: string;
  onClose: () => void;
}

function Alert({ tipo, mensaje, onClose }: AlertProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colores = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };

  const iconos = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
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
export default function ComunidadesAdmin() {
  const { comunidades, tecnicos, loading, error: errorCarga, recargar } =
    useCargarDatos();
  const {
    crearComunidad,
    actualizarComunidad,
    toggleEstado,
    procesando,
    error: errorOperacion,
    limpiarError,
  } = useOperacionesComunidades();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [alerta, setAlerta] = useState<{
    activa: boolean;
    tipo: "success" | "error" | "info";
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
  const handleNuevaComunidad = useCallback(() => {
    setEditandoId(null);
    setForm(INITIAL_FORM);
    limpiarError();
  }, [limpiarError]);

  const handleEditar = useCallback((comunidad: Comunidad) => {
    setEditandoId(comunidad.id);
    setForm({
      nombre: comunidad.nombre,
      tecnicoId: comunidad.tecnicoId,
      tecnicoNombre: comunidad.tecnicoNombre,
      estado: comunidad.estado,
    });
    limpiarError();
  }, [limpiarError]);

  const handleSubmitForm = useCallback(async () => {
    if (erroresValidacion.length > 0) {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: "Por favor, corrija los errores en el formulario",
      });
      return;
    }

    let exito = false;

    if (editandoId) {
      exito = await actualizarComunidad(editandoId, form);
    } else {
      exito = await crearComunidad(form);
    }

    if (exito) {
      const accion = editandoId ? "actualizada" : "creada";
      setAlerta({
        activa: true,
        tipo: "success",
        mensaje: `Comunidad ${accion} correctamente`,
      });
      handleNuevaComunidad();
      recargar();
    } else {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: errorOperacion || "Error al procesar la operación",
      });
    }
  }, [
    editandoId,
    form,
    erroresValidacion,
    actualizarComunidad,
    crearComunidad,
    errorOperacion,
    handleNuevaComunidad,
    recargar,
  ]);

  const handleToggleEstado = useCallback(
    async (comunidad: Comunidad) => {
      const exito = await toggleEstado(comunidad.id, comunidad.estado);
      if (exito) {
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: `Comunidad ${
            comunidad.estado === "activo" ? "desactivada" : "activada"
          } correctamente`,
        });
        recargar();
      } else {
        setAlerta({
          activa: true,
          tipo: "error",
          mensaje: errorOperacion || "Error al cambiar el estado",
        });
      }
    },
    [toggleEstado, errorOperacion, recargar]
  );

  // UI
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">
            Cargando gestión de comunidades...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              🏘️ Gestión de Comunidades
            </h1>
            <p className="text-gray-600 mt-1">
              Administra las comunidades y asigna técnicos responsables
            </p>
          </div>
          <button
            onClick={handleNuevaComunidad}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            ➕ Nueva Comunidad
          </button>
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
            mensaje={`Error al cargar comunidades: ${errorCarga}`}
            onClose={() => {}}
          />
        )}

        {/* Formulario */}
        <Formulario
          editandoId={editandoId}
          form={form}
          onFormChange={setForm}
          onSubmit={handleSubmitForm}
          onCancel={handleNuevaComunidad}
          procesando={procesando}
          erroresValidacion={erroresValidacion}
          tecnicos={tecnicos}
        />

        {/* Tabla */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Comunidades Registradas ({comunidades.length})
          </h2>
          <TablaComunidades
            comunidades={comunidades}
            onEditar={handleEditar}
            onToggleEstado={handleToggleEstado}
            procesando={procesando}
          />
        </div>

        {/* Info útil */}
        {tecnicos.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 font-medium">
              ⚠️ No hay técnicos disponibles. Activa técnicos en la gestión de
              usuarios antes de crear comunidades.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}