"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
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

// ============ TIPOS ============
interface Comunidad {
  id: string;
  nombre: string;
  tecnicoId?: string;
  tecnicoNombre?: string;
  estado?: string;
  [key: string]: any;
}

interface Tecnico {
  id: string;
  nombre: string;
  email: string;
  rol: "tecnico" | "admin";
  estado: "activo" | "inactivo";
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
  tecnicoId?: string;
  creadoPor?: string;
  estado: "activo" | "inactivo" | "eliminado";
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
  comunidadId: string;
  estado: "activo" | "inactivo";
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
  comunidadId: "",
  estado: "activo",
};

// ============ VALIDACIONES ============
const validarFormulario = (form: FormData): ValidationError[] => {
  const errores: ValidationError[] = [];

  if (!form.nombres.trim()) {
    errores.push({ field: "nombres", message: "El nombre es requerido" });
  }

  if (!form.apellidos.trim()) {
    errores.push({ field: "apellidos", message: "El apellido es requerido" });
  }

  if (!form.edad) {
    errores.push({ field: "edad", message: "La edad es requerida" });
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
    errores.push({ field: "genero", message: "El género es requerido" });
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

  if (!form.comunidadId) {
    errores.push({
      field: "comunidadId",
      message: "Debe seleccionar una comunidad",
    });
  }

  return errores;
};

// ============ HOOK: Cargar datos globales ============
function useCargarDatos() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [participantesSnap, comunidadesSnap, usuariosSnap] =
        await Promise.all([
          getDocs(collection(db, "participantes")),
          getDocs(collection(db, "comunidades")),
          getDocs(collection(db, "usuarios")),
        ]);

      const listaParticipantes = participantesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Participante[];

      const listaComunidades = comunidadesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Comunidad[];

      const listaTecnicos = usuariosSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Tecnico))
        .filter(
          (u) => u.estado === "activo" && (u.rol === "tecnico" || u.rol === "admin")
        );

      listaParticipantes.sort((a, b) =>
        `${a.nombres} ${a.apellidos}`.localeCompare(
          `${b.nombres} ${b.apellidos}`
        )
      );

      listaComunidades.sort((a, b) => a.nombre.localeCompare(b.nombre));
      listaTecnicos.sort((a, b) => a.nombre.localeCompare(b.nombre));

      setParticipantes(listaParticipantes);
      setComunidades(listaComunidades);
      setTecnicos(listaTecnicos);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : "Error al cargar datos";
      setError(mensaje);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    participantes,
    setParticipantes,
    comunidades,
    tecnicos,
    loading,
    error,
    recargar: cargar,
  };
}

// ============ COMPONENTES UI ============
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
        className={`w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
    </div>
  );
}

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
        className={`w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
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

function Indicador({
  titulo,
  valor,
  icono,
  color,
}: {
  titulo: string;
  valor: number;
  icono: string;
  color: string;
}) {
  return (
    <div className={`${color} rounded-lg p-5 shadow-md`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-700">{titulo}</p>
        <span className="text-2xl">{icono}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-2">{valor}</p>
    </div>
  );
}

function Alerta({
  tipo,
  mensaje,
  onClose,
}: {
  tipo: "success" | "error" | "info" | "warning";
  mensaje: string;
  onClose: () => void;
}) {
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
export default function ParticipantesGlobalPage() {
  const {
    participantes,
    comunidades,
    tecnicos,
    loading,
    error,
    recargar,
  } = useCargarDatos();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [procesando, setProcesando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroComunidad, setFiltroComunidad] = useState("todos");
  const [filtroTecnico, setFiltroTecnico] = useState("todos");

  const [alerta, setAlerta] = useState<{
    activa: boolean;
    tipo: "success" | "error" | "info" | "warning";
    mensaje: string;
  }>({
    activa: false,
    tipo: "info",
    mensaje: "",
  });

  const erroresValidacion = useMemo(() => validarFormulario(form), [form]);

  const participantesFiltrados = useMemo(() => {
    return participantes.filter((p) => {
      const comunidad = comunidades.find((c) => c.id === p.comunidadId);
      const tecnicoActualId = comunidad?.tecnicoId || "";

      const cumpleBusqueda =
        `${p.nombres} ${p.apellidos}`
          .toLowerCase()
          .includes(busqueda.toLowerCase());

      const cumpleEstado =
        filtroEstado === "todos" || p.estado === filtroEstado;

      const cumpleComunidad =
        filtroComunidad === "todos" || p.comunidadId === filtroComunidad;

      const cumpleTecnico =
        filtroTecnico === "todos" || tecnicoActualId === filtroTecnico;

      return cumpleBusqueda && cumpleEstado && cumpleComunidad && cumpleTecnico;
    });
  }, [
    participantes,
    comunidades,
    busqueda,
    filtroEstado,
    filtroComunidad,
    filtroTecnico,
  ]);

  const indicadores = useMemo(() => {
    const activos = participantes.filter((p) => p.estado === "activo");
    return {
      total: participantes.length,
      activos: activos.length,
      inactivos: participantes.filter((p) => p.estado === "inactivo").length,
      eliminados: participantes.filter((p) => p.estado === "eliminado").length,
      comunidades: new Set(
        participantes.filter((p) => p.estado === "activo").map((p) => p.comunidadId)
      ).size,
    };
  }, [participantes]);

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
      comunidadId: participante.comunidadId,
      estado:
        participante.estado === "activo" ? "activo" : "inactivo",
    });
  }, []);

  const handleGuardar = useCallback(async () => {
    if (erroresValidacion.length > 0) {
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: "Por favor, corrige los errores del formulario",
      });
      return;
    }

    try {
      setProcesando(true);

      const comunidad = comunidades.find((c) => c.id === form.comunidadId);

      const data = {
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        edad: Number(form.edad),
        genero: form.genero,
        familiaPlan: form.familiaPlan,
        inclusion: form.inclusion,
        comunidadId: form.comunidadId,
        tecnicoId: comunidad?.tecnicoId || "",
        estado: form.estado,
      };

      if (editandoId) {
        await updateDoc(doc(db, "participantes", editandoId), data);
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: "Participante actualizado correctamente",
        });
      } else {
        await addDoc(collection(db, "participantes"), {
          ...data,
          fechaRegistro: serverTimestamp(),
        });
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: "Participante creado correctamente",
        });
      }

      handleLimpiarFormulario();
      recargar();
    } catch (err) {
      console.error(err);
      setAlerta({
        activa: true,
        tipo: "error",
        mensaje: "Error al guardar participante",
      });
    } finally {
      setProcesando(false);
    }
  }, [form, erroresValidacion, editandoId, comunidades, handleLimpiarFormulario, recargar]);

  const handleToggleEstado = useCallback(
    async (participante: Participante) => {
      const nuevoEstado =
        participante.estado === "activo" ? "inactivo" : "activo";

      try {
        setProcesando(true);
        await updateDoc(doc(db, "participantes", participante.id), {
          estado: nuevoEstado,
        });

        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: `Participante ${
            nuevoEstado === "activo" ? "activado" : "inactivado"
          } correctamente`,
        });

        recargar();
      } catch (err) {
        console.error(err);
        setAlerta({
          activa: true,
          tipo: "error",
          mensaje: "Error al cambiar el estado",
        });
      } finally {
        setProcesando(false);
      }
    },
    [recargar]
  );

  const handleEliminarLogico = useCallback(
    async (participante: Participante) => {
      const confirmar = confirm(
        `¿Deseas marcar como eliminado a ${participante.nombres} ${participante.apellidos}?`
      );
      if (!confirmar) return;

      try {
        setProcesando(true);
        await updateDoc(doc(db, "participantes", participante.id), {
          estado: "eliminado",
          eliminadoEn: serverTimestamp(),
        });

        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: "Participante marcado como eliminado",
        });

        recargar();
      } catch (err) {
        console.error(err);
        setAlerta({
          activa: true,
          tipo: "error",
          mensaje: "Error al eliminar participante",
        });
      } finally {
        setProcesando(false);
      }
    },
    [recargar]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">
            Cargando administración global de participantes...
          </p>
        </div>
      </div>
    );
  }

  const opcionesComunidades = comunidades.map((c) => ({
    value: c.id,
    label: c.nombre,
  }));

  const opcionesTecnicos = tecnicos.map((t) => ({
    value: t.id,
    label: t.nombre,
  }));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Encabezado */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            👥 Administración Global de Participantes
          </h1>
          <p className="text-gray-600 mt-1">
            Gestiona todos los participantes del sistema
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

        {error && (
          <Alerta
            tipo="error"
            mensaje={error}
            onClose={() => {}}
          />
        )}

        {/* Indicadores */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Indicador titulo="Total" valor={indicadores.total} icono="👥" color="bg-blue-100" />
          <Indicador titulo="Activos" valor={indicadores.activos} icono="✅" color="bg-green-100" />
          <Indicador titulo="Inactivos" valor={indicadores.inactivos} icono="🔒" color="bg-yellow-100" />
          <Indicador titulo="Eliminados" valor={indicadores.eliminados} icono="🗑️" color="bg-red-100" />
          <Indicador titulo="Comunidades" valor={indicadores.comunidades} icono="🏘️" color="bg-purple-100" />
        </div>

        {/* Formulario */}
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
              error={erroresValidacion.find((e) => e.field === "nombres")?.message}
              required
            />

            <Input
              label="Apellidos"
              placeholder="ej: García López"
              value={form.apellidos}
              onChange={(value) => setForm({ ...form, apellidos: value })}
              error={erroresValidacion.find((e) => e.field === "apellidos")?.message}
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
              error={erroresValidacion.find((e) => e.field === "edad")?.message}
              required
            />

            <Select
              label="Género"
              value={form.genero}
              onChange={(value) => setForm({ ...form, genero: value as any })}
              options={OPCIONES_GENERO}
              error={erroresValidacion.find((e) => e.field === "genero")?.message}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="¿Familia afiliada a PLAN?"
              value={form.familiaPlan}
              onChange={(value) => setForm({ ...form, familiaPlan: value as any })}
              options={[
                { value: "SI", label: "✓ Sí" },
                { value: "NO", label: "✕ No" },
              ]}
              error={erroresValidacion.find((e) => e.field === "familiaPlan")?.message}
              required
            />

            <Select
              label="Inclusión / Etnia"
              value={form.inclusion}
              onChange={(value) => setForm({ ...form, inclusion: value as any })}
              options={OPCIONES_INCLUSION}
              error={erroresValidacion.find((e) => e.field === "inclusion")?.message}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Comunidad"
              value={form.comunidadId}
              onChange={(value) => setForm({ ...form, comunidadId: value })}
              options={opcionesComunidades}
              error={erroresValidacion.find((e) => e.field === "comunidadId")?.message}
              required
            />

            <Select
              label="Estado"
              value={form.estado}
              onChange={(value) => setForm({ ...form, estado: value as any })}
              options={[
                { value: "activo", label: "Activo" },
                { value: "inactivo", label: "Inactivo" },
              ]}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleGuardar}
              disabled={procesando}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
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

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">🔎 Filtros</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="todos">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
              <option value="eliminado">Eliminados</option>
            </select>

            <select
              value={filtroComunidad}
              onChange={(e) => setFiltroComunidad(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="todos">Todas las comunidades</option>
              {opcionesComunidades.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={filtroTecnico}
              onChange={(e) => setFiltroTecnico(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="todos">Todos los técnicos</option>
              {opcionesTecnicos.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla global */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Participantes ({participantesFiltrados.length})
          </h2>

          {participantesFiltrados.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              No hay participantes que coincidan con los filtros
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Nombre</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold">Edad</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold">Género</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Comunidad</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Técnico Actual</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold">Estado</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {participantesFiltrados.map((p) => {
                    const comunidad = comunidades.find((c) => c.id === p.comunidadId);
                    const tecnico = tecnicos.find((t) => t.id === comunidad?.tecnicoId);

                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {p.nombres} {p.apellidos}
                        </td>
                        <td className="px-6 py-4 text-center text-gray-600">
                          {p.edad}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {p.genero === "M" ? "👨" : p.genero === "F" ? "👩" : "⚪"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {comunidad?.nombre || "Sin comunidad"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {tecnico?.nombre || comunidad?.tecnicoNombre || "No asignado"}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              p.estado === "activo"
                                ? "bg-green-100 text-green-800"
                                : p.estado === "inactivo"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {p.estado}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {p.estado !== "eliminado" && (
                            <>
                              <button
                                onClick={() => handleEditar(p)}
                                disabled={procesando}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                              >
                                ✏️ Editar
                              </button>

                              <button
                                onClick={() => handleToggleEstado(p)}
                                disabled={procesando}
                                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                              >
                                {p.estado === "activo" ? "🔒 Inactivar" : "🔓 Activar"}
                              </button>

                              <button
                                onClick={() => handleEliminarLogico(p)}
                                disabled={procesando}
                                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                              >
                                🗑️ Eliminar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}