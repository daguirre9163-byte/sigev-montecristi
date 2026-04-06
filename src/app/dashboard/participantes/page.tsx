"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";

// ============ TIPOS ============
interface Comunidad {
  id: string;
  nombre: string;
  tecnicoId: string;
  estado: string;
  [key: string]: any;
}

interface Participante {
  id: string;
  nombres: string;
  apellidos: string;
  edad: number;
  genero: "M" | "F" | "O" | "";
  familiaPlan: "SI" | "NO" | "";
  inclusion: "Mz" | "I" | "A" | "Mn" | "O" | "";
  comunidadId: string;
  tecnicoId: string;
  estado: "activo" | "inactivo";
  fechaRegistro?: any;
  [key: string]: any;
}

interface FormData {
  nombres: string;
  apellidos: string;
  edad: string;
  genero: "M" | "F" | "O" | "";
  familiaPlan: "SI" | "NO" | "";
  inclusion: "Mz" | "I" | "A" | "Mn" | "O" | "";
}

interface ValidationError {
  field: keyof FormData;
  message: string;
}

// ============ CONSTANTES ============
const OPCIONES_GENERO = [
  { value: "M", label: "👨 Masculino" },
  { value: "F", label: "👩 Femenino" },
  { value: "O", label: "⚪ Otro" },
];

const OPCIONES_INCLUSION = [
  { value: "Mz", label: "Mestizo/a" },
  { value: "I", label: "Indígena" },
  { value: "A", label: "Afro" },
  { value: "Mn", label: "Montubio/a" },
  { value: "O", label: "Otro" },
];

const INITIAL_FORM: FormData = {
  nombres: "",
  apellidos: "",
  edad: "",
  genero: "",
  familiaPlan: "",
  inclusion: "",
};

// ============ VALIDACIONES ============
const validarFormulario = (form: FormData): ValidationError[] => {
  const errores: ValidationError[] = [];

  if (!form.nombres.trim()) {
    errores.push({
      field: "nombres",
      message: "El nombre es requerido",
    });
  }

  if (!form.apellidos.trim()) {
    errores.push({
      field: "apellidos",
      message: "El apellido es requerido",
    });
  }

  if (!form.edad) {
    errores.push({
      field: "edad",
      message: "La edad es requerida",
    });
  } else {
    const edadNum = Number(form.edad);
    if (edadNum < 0 || edadNum > 120) {
      errores.push({
        field: "edad",
        message: "La edad debe estar entre 0 y 120 años",
      });
    }
  }

  if (!form.genero) {
    errores.push({
      field: "genero",
      message: "El género es requerido",
    });
  }

  if (!form.familiaPlan) {
    errores.push({
      field: "familiaPlan",
      message: "Debe especificar si está afiliado a PLAN",
    });
  }

  if (!form.inclusion) {
    errores.push({
      field: "inclusion",
      message: "La inclusión es requerida",
    });
  }

  return errores;
};

// ============ HOOK: Cargar datos ============
function useCargarDatos(userId: string | undefined) {
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getComunidadesByTecnico(userId);
      setComunidades(data);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar";
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

// ============ HOOK: Cargar participantes ============
function useCargarParticipantes(userId: string | undefined, comunidadId: string) {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId || !comunidadId) return;

    try {
      setLoading(true);
      setError(null);

      const q = query(
        collection(db, "participantes"),
        where("tecnicoId", "==", userId),
        where("comunidadId", "==", comunidadId)
      );

      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Participante));

      setParticipantes(lista);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al cargar";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId, comunidadId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { participantes, setParticipantes, loading, error, recargar: cargar };
}

// ============ COMPONENTE: Input ============
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
        className={`w-full border rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
    </div>
  );
}

// ============ COMPONENTE: Select ============
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
        className={`w-full border rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
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

// ============ COMPONENTE: Card de indicadores ============
interface IndicadorProps {
  titulo: string;
  valor: number;
  icono: string;
  color: string;
}

function Indicador({ titulo, valor, icono, color }: IndicadorProps) {
  return (
    <div
      className={`${color} rounded-lg p-6 space-y-2 shadow-md border border-opacity-20`}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-700">{titulo}</p>
        <span className="text-2xl">{icono}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{valor}</p>
    </div>
  );
}

// ============ COMPONENTE: Tabla de participantes ============
interface TablaParticipantesProps {
  participantes: Participante[];
  onEditar: (participante: Participante) => void;
  onToggleEstado: (id: string, estado: string) => void;
  onEliminar: (id: string) => void;
  procesando: boolean;
  mostrarInactivos: boolean;
}

function TablaParticipantes({
  participantes,
  onEditar,
  onToggleEstado,
  onEliminar,
  procesando,
  mostrarInactivos,
}: TablaParticipantesProps) {
  const getGeneroLabel = (genero: string) => {
    return OPCIONES_GENERO.find((o) => o.value === genero)?.label || genero;
  };

  const getInclusionLabel = (inclusion: string) => {
    return OPCIONES_INCLUSION.find((o) => o.value === inclusion)?.label || inclusion;
  };

  const participantesFiltrados = participantes.filter((p) => {
    if (mostrarInactivos) return p.estado === "inactivo";
    return p.estado === "activo";
  });

  if (participantesFiltrados.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <p className="text-lg">
          {mostrarInactivos
            ? "No hay participantes inactivos"
            : "No hay participantes activos"}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          {mostrarInactivos
            ? "Todos los participantes están activos"
            : "Crea un nuevo participante para comenzar"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-green-600 to-green-700 text-white">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold">
              Nombre
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold">
              Edad
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold">
              Género
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold">
              PLAN
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold">
              Inclusión
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold">
              Estado
            </th>
            <th className="px-6 py-3 text-right text-sm font-semibold">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {participantesFiltrados.map((participante) => (
            <tr
              key={participante.id}
              className={`hover:bg-gray-50 transition-colors ${
                participante.estado === "inactivo" ? "bg-gray-100" : ""
              }`}
            >
              <td className="px-6 py-4 font-medium text-gray-900">
                {participante.nombres} {participante.apellidos}
              </td>
              <td className="px-6 py-4 text-center text-gray-600">
                {participante.edad} años
              </td>
              <td className="px-6 py-4 text-center">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {getGeneroLabel(participante.genero)}
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    participante.familiaPlan === "SI"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {participante.familiaPlan}
                </span>
              </td>
              <td className="px-6 py-4 text-center text-gray-600 text-sm">
                {getInclusionLabel(participante.inclusion)}
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    participante.estado === "activo"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {participante.estado === "activo" ? "✅ Activo" : "❌ Inactivo"}
                </span>
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                {participante.estado === "activo" && (
                  <>
                    <button
                      onClick={() => onEditar(participante)}
                      disabled={procesando}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                      title="Editar participante"
                    >
                      ✏️ Editar
                    </button>

                    <button
                      onClick={() =>
                        onToggleEstado(participante.id, participante.estado)
                      }
                      disabled={procesando}
                      className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                      title="Desactivar participante"
                    >
                      🔒 Desactivar
                    </button>
                  </>
                )}

                {participante.estado === "inactivo" && (
                  <>
                    <button
                      onClick={() =>
                        onToggleEstado(participante.id, participante.estado)
                      }
                      disabled={procesando}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                      title="Activar participante"
                    >
                      🔓 Activar
                    </button>

                    <button
                      onClick={() => onEliminar(participante.id)}
                      disabled={procesando}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                      title="Eliminar permanentemente"
                    >
                      🗑️ Eliminar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ COMPONENTE: Alerta ============
interface AlertaProps {
  tipo: "success" | "error" | "info" | "warning";
  mensaje: string;
  onClose: () => void;
}

function Alerta({ tipo, mensaje, onClose }: AlertaProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
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
export default function ParticipantesPage() {
  const { user } = useAuth();

  const { comunidades, loading: loadingComunidades, error: errorComunidades } =
    useCargarDatos(user?.uid);

  const [filtroComunidad, setFiltroComunidad] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const { participantes, setParticipantes, loading: loadingParticipantes, recargar } =
    useCargarParticipantes(user?.uid, filtroComunidad);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [procesando, setProcesando] = useState(false);

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

  // Filtrar participantes
  const participantesFiltrados = useMemo(() => {
    return participantes.filter((p) => {
      const filtroEstado = mostrarInactivos
        ? p.estado === "inactivo"
        : p.estado === "activo";

      const filtroBusqueda = `${p.nombres} ${p.apellidos}`
        .toLowerCase()
        .includes(busqueda.toLowerCase());

      return filtroEstado && filtroBusqueda;
    });
  }, [participantes, busqueda, mostrarInactivos]);

  // Indicadores
  const indicadores = useMemo(() => {
    const activos = participantes.filter((p) => p.estado === "activo");
    return {
      total: activos.length,
      hombres: activos.filter((p) => p.genero === "M").length,
      mujeres: activos.filter((p) => p.genero === "F").length,
      conPlan: activos.filter((p) => p.familiaPlan === "SI").length,
      inactivos: participantes.filter((p) => p.estado === "inactivo").length,
    };
  }, [participantes]);

  // Manejadores
  const handleLimpiarFormulario = useCallback(() => {
    setEditandoId(null);
    setForm(INITIAL_FORM);
  }, []);

  const handleEditar = useCallback((participante: Participante) => {
    setEditandoId(participante.id);
    setForm({
      nombres: participante.nombres,
      apellidos: participante.apellidos,
      edad: String(participante.edad),
      genero: participante.genero,
      familiaPlan: participante.familiaPlan,
      inclusion: participante.inclusion,
    });
  }, []);

  const handleGuardar = useCallback(async () => {
    if (erroresValidacion.length > 0) {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: "Por favor, corrija los errores en el formulario",
      });
      return;
    }

    if (!user || !filtroComunidad) {
      setAlerta({
        activa: true,
        tipo: "warning",
        mensaje: "Debe seleccionar una comunidad",
      });
      return;
    }

    try {
      setProcesando(true);

      const data = {
        ...form,
        edad: Number(form.edad),
        comunidadId: filtroComunidad,
        tecnicoId: user.uid,
        estado: "activo",
        fechaRegistro: serverTimestamp(),
      };

      if (editandoId) {
        await updateDoc(doc(db, "participantes", editandoId), data);
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: "Participante actualizado correctamente",
        });
      } else {
        await addDoc(collection(db, "participantes"), data);
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: "Participante creado correctamente",
        });
      }

      handleLimpiarFormulario();
      recargar();
    } catch (error) {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: "Error al guardar el participante",
      });
      console.error(error);
    } finally {
      setProcesando(false);
    }
  }, [
    form,
    erroresValidacion,
    user,
    filtroComunidad,
    editandoId,
    handleLimpiarFormulario,
    recargar,
  ]);

  const handleToggleEstado = useCallback(
    async (id: string, estadoActual: string) => {
      const nuevoEstado = estadoActual === "activo" ? "inactivo" : "activo";
      const accion =
        nuevoEstado === "activo"
          ? "¿Activar este participante?"
          : "¿Desactivar este participante?";

      if (!confirm(accion)) {
        return;
      }

      try {
        setProcesando(true);
        await updateDoc(doc(db, "participantes", id), {
          estado: nuevoEstado,
        });

        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: `Participante ${
            nuevoEstado === "activo" ? "activado" : "desactivado"
          } correctamente`,
        });

        recargar();
      } catch (error) {
        setAlerta({
          activa: true,
          tipo: "error",
          mensaje: "Error al cambiar el estado",
        });
        console.error(error);
      } finally {
        setProcesando(false);
      }
    },
    [recargar]
  );

  const handleEliminar = useCallback(
    async (id: string) => {
      if (!confirm("¿Eliminar permanentemente este participante?")) {
        return;
      }

      try {
        setProcesando(true);
        // Eliminar de verdad (no solo marcar como inactivo)
        await updateDoc(doc(db, "participantes", id), {
          estado: "eliminado",
          eliminadoEn: serverTimestamp(),
        });

        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: "Participante eliminado permanentemente",
        });

        recargar();
      } catch (error) {
        setAlerta({
          activa: true,
          tipo: "error",
          mensaje: "Error al eliminar el participante",
        });
        console.error(error);
      } finally {
        setProcesando(false);
      }
    },
    [recargar]
  );

  // UI: Cargando comunidades
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

  // UI: Error cargando comunidades
  if (errorComunidades) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 font-medium">❌ {errorComunidades}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            👥 Gestión de Participantes
          </h1>
          <p className="text-gray-600 mt-1">
            Administra los participantes de tus comunidades
          </p>
        </div>

        {/* Alertas */}
        {alerta.activa && (
          <Alerta
            tipo={alerta.tipo}
            mensaje={alerta.mensaje}
            onClose={() => setAlerta({ ...alerta, activa: false })}
          />
        )}

        {/* Selección de comunidad */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            🏘️ Selecciona una Comunidad
          </label>

          <select
            value={filtroComunidad}
            onChange={(e) => {
              setFiltroComunidad(e.target.value);
              setBusqueda("");
              setMostrarInactivos(false);
              handleLimpiarFormulario();
            }}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">Seleccione una comunidad...</option>
            {comunidades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Indicadores */}
        {filtroComunidad && !loadingParticipantes && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Indicador
              titulo="Total Activos"
              valor={indicadores.total}
              icono="👥"
              color="bg-green-100"
            />
            <Indicador
              titulo="Hombres"
              valor={indicadores.hombres}
              icono="👨"
              color="bg-blue-100"
            />
            <Indicador
              titulo="Mujeres"
              valor={indicadores.mujeres}
              icono="👩"
              color="bg-pink-100"
            />
            <Indicador
              titulo="Con PLAN"
              valor={indicadores.conPlan}
              icono="✓"
              color="bg-purple-100"
            />
            <Indicador
              titulo="Inactivos"
              valor={indicadores.inactivos}
              icono="🔒"
              color="bg-red-100"
            />
          </div>
        )}

        {/* Formulario */}
        {filtroComunidad && (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">
              {editandoId ? "✏️ Editar Participante" : "➕ Nuevo Participante"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombres"
                placeholder="ej: Juan Carlos"
                value={form.nombres}
                onChange={(value) => setForm({ ...form, nombres: value })}
                error={
                  erroresValidacion.find((e) => e.field === "nombres")?.message
                }
                required
              />

              <Input
                label="Apellidos"
                placeholder="ej: García López"
                value={form.apellidos}
                onChange={(value) => setForm({ ...form, apellidos: value })}
                error={
                  erroresValidacion.find((e) => e.field === "apellidos")
                    ?.message
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Edad"
                type="number"
                placeholder="ej: 25"
                value={form.edad}
                onChange={(value) => setForm({ ...form, edad: value })}
                error={
                  erroresValidacion.find((e) => e.field === "edad")?.message
                }
                required
              />

              <Select
                label="Género"
                value={form.genero}
                onChange={(value) => setForm({ ...form, genero: value as any })}
                options={OPCIONES_GENERO}
                error={
                  erroresValidacion.find((e) => e.field === "genero")?.message
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="¿Familia afiliada a PLAN?"
                value={form.familiaPlan}
                onChange={(value) =>
                  setForm({ ...form, familiaPlan: value as any })
                }
                options={[
                  { value: "SI", label: "✓ Sí" },
                  { value: "NO", label: "✕ No" },
                ]}
                error={
                  erroresValidacion.find((e) => e.field === "familiaPlan")
                    ?.message
                }
                required
              />

              <Select
                label="Inclusión/Etnia"
                value={form.inclusion}
                onChange={(value) => setForm({ ...form, inclusion: value as any })}
                options={OPCIONES_INCLUSION}
                error={
                  erroresValidacion.find((e) => e.field === "inclusion")
                    ?.message
                }
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleGuardar}
                disabled={procesando}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
              >
                {procesando
                  ? "⏳ Procesando..."
                  : editandoId
                  ? "✓ Actualizar"
                  : "➕ Crear"}
              </button>

              {editandoId && (
                <button
                  onClick={handleLimpiarFormulario}
                  disabled={procesando}
                  className="flex-1 bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Búsqueda y filtros */}
        {filtroComunidad && (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="🔍 Buscar participante por nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <button
                  onClick={() => setMostrarInactivos(!mostrarInactivos)}
                  className={`px-4 py-3 rounded-lg font-semibold transition w-full md:w-auto ${
                    mostrarInactivos
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                  }`}
                >
                  {mostrarInactivos ? "🔒 Mostrando Inactivos" : "✅ Mostrando Activos"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabla */}
        {filtroComunidad && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {mostrarInactivos ? "Participantes Inactivos" : "Participantes Activos"} (
              {participantesFiltrados.length})
            </h2>

            {loadingParticipantes ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <div className="animate-spin text-3xl mb-4">⏳</div>
                <p className="text-gray-600 font-medium">
                  Cargando participantes...
                </p>
              </div>
            ) : (
              <TablaParticipantes
                participantes={participantes}
                onEditar={handleEditar}
                onToggleEstado={handleToggleEstado}
                onEliminar={handleEliminar}
                procesando={procesando}
                mostrarInactivos={mostrarInactivos}
              />
            )}
          </div>
        )}

        {/* Mensaje cuando no hay comunidad seleccionada */}
        {!filtroComunidad && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <p className="text-blue-800 text-lg font-medium">
              👆 Selecciona una comunidad para comenzar a gestionar participantes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}