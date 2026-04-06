"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { firebaseConfig } from "@/lib/firebase";
import {
  collection,
  getDocs,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";

// ============ TIPOS ============
interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: "tecnico" | "directora" | "admin";
  estado: "activo" | "inactivo";
  createdAt?: any;
  [key: string]: any;
}

interface FormData {
  nombre: string;
  email: string;
  password: string;
  rol: "tecnico" | "directora" | "admin";
  estado: "activo" | "inactivo";
}

interface ValidationError {
  field: keyof FormData;
  message: string;
}

// ============ CONSTANTES ============
const ROLES = [
  { value: "tecnico", label: "Técnico" },
  { value: "directora", label: "Directora" },
  { value: "admin", label: "Administrador" },
] as const;

const ESTADOS = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
] as const;

const INITIAL_FORM: FormData = {
  nombre: "",
  email: "",
  password: "",
  rol: "tecnico",
  estado: "activo",
};

// ============ VALIDACIONES ============
const validarFormulario = (
  form: FormData,
  esEdicion: boolean
): ValidationError[] => {
  const errores: ValidationError[] = [];

  // Validar nombre
  if (!form.nombre.trim()) {
    errores.push({
      field: "nombre",
      message: "El nombre es requerido",
    });
  } else if (form.nombre.trim().length < 2) {
    errores.push({
      field: "nombre",
      message: "El nombre debe tener al menos 2 caracteres",
    });
  }

  // Validar email
  if (!form.email.trim()) {
    errores.push({
      field: "email",
      message: "El email es requerido",
    });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errores.push({
      field: "email",
      message: "Email inválido",
    });
  }

  // Validar contraseña (solo en creación)
  if (!esEdicion) {
    if (!form.password) {
      errores.push({
        field: "password",
        message: "La contraseña es requerida",
      });
    } else if (form.password.length < 6) {
      errores.push({
        field: "password",
        message: "La contraseña debe tener al menos 6 caracteres",
      });
    }
  }

  return errores;
};

// ============ HOOK: Cargar usuarios ============
function useCargarUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const snap = await getDocs(collection(db, "usuarios"));
      const lista = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Usuario));

      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUsuarios(lista);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : "Error al cargar usuarios";
      setError(mensaje);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { usuarios, loading, error, recargar: cargar };
}

// ============ HOOK: Operaciones de usuario ============
function useOperacionesUsuario() {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crearUsuario = useCallback(
    async (form: FormData): Promise<boolean> => {
      try {
        setProcesando(true);
        setError(null);

        // Crear instancia secundaria de Firebase
        const secondaryApp = initializeApp(firebaseConfig, "Secondary");
        const secondaryAuth = getAuth(secondaryApp);

        try {
          // Crear usuario en Authentication
          const cred = await createUserWithEmailAndPassword(
            secondaryAuth,
            form.email,
            form.password
          );

          // Guardar en Firestore
          await setDoc(doc(db, "usuarios", cred.user.uid), {
            nombre: form.nombre.trim(),
            email: form.email.trim().toLowerCase(),
            rol: form.rol,
            estado: "activo",
            createdAt: serverTimestamp(),
          });

          return true;
        } finally {
          // Limpiar instancia secundaria
          await signOut(secondaryAuth);
          await deleteApp(secondaryApp);
        }
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

  const actualizarUsuario = useCallback(
    async (id: string, form: FormData): Promise<boolean> => {
      try {
        setProcesando(true);
        setError(null);

        await updateDoc(doc(db, "usuarios", id), {
          nombre: form.nombre.trim(),
          rol: form.rol,
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

  const toggleEstado = useCallback(async (id: string, estadoActual: string): Promise<boolean> => {
    try {
      setProcesando(true);
      setError(null);

      const nuevoEstado = estadoActual === "activo" ? "inactivo" : "activo";

      await updateDoc(doc(db, "usuarios", id), {
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
  }, []);

  const enviarResetPassword = useCallback(async (email: string): Promise<boolean> => {
    try {
      setProcesando(true);
      setError(null);

      const auth = getAuth();
      await sendPasswordResetEmail(auth, email);

      return true;
    } catch (err) {
      const mensaje = obtenerMensajeError(err);
      setError(mensaje);
      return false;
    } finally {
      setProcesando(false);
    }
  }, []);

  return {
    crearUsuario,
    actualizarUsuario,
    toggleEstado,
    enviarResetPassword,
    procesando,
    error,
    limpiarError: () => setError(null),
  };
}

// ============ UTILIDADES ============
const obtenerMensajeError = (error: any): string => {
  if (error instanceof Error) {
    // Errores específicos de Firebase Auth
    if (error.message.includes("email-already-in-use")) {
      return "Este email ya está registrado";
    }
    if (error.message.includes("weak-password")) {
      return "La contraseña es muy débil";
    }
    if (error.message.includes("invalid-email")) {
      return "Email inválido";
    }
    return error.message;
  }
  return "Error desconocido";
};

// ============ COMPONENTE: Input con validación ============
interface InputProps {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}

function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled = false,
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
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
          disabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"
        } ${error ? "border-red-500" : "border-gray-300"}`}
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
        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      >
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
}

function Formulario({
  editandoId,
  form,
  onFormChange,
  onSubmit,
  onCancel,
  procesando,
  erroresValidacion,
}: FormularioProps) {
  const esEdicion = editandoId !== null;

  const getError = (field: keyof FormData): string | undefined => {
    return erroresValidacion.find((e) => e.field === field)?.message;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <h2 className="text-xl font-bold text-gray-900">
        {esEdicion ? "✏️ Editar Usuario" : "➕ Crear Nuevo Usuario"}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre Completo"
          placeholder="ej: Juan Pérez"
          value={form.nombre}
          onChange={(nombre) => onFormChange({ ...form, nombre })}
          error={getError("nombre")}
          required
        />

        <Input
          label="Email"
          type="email"
          placeholder="ej: juan@example.com"
          value={form.email}
          onChange={(email) => onFormChange({ ...form, email })}
          disabled={esEdicion}
          error={getError("email")}
          required
        />
      </div>

      {!esEdicion && (
        <Input
          label="Contraseña Temporal"
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={form.password}
          onChange={(password) => onFormChange({ ...form, password })}
          error={getError("password")}
          required
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Rol"
          value={form.rol}
          onChange={(rol) => onFormChange({ ...form, rol: rol as any })}
          options={ROLES}
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
      </div>

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

// ============ COMPONENTE: Tabla de usuarios ============
interface TablaUsuariosProps {
  usuarios: Usuario[];
  onEditar: (usuario: Usuario) => void;
  onToggleEstado: (usuario: Usuario) => void;
  onResetPassword: (usuario: Usuario) => void;
  procesando: boolean;
}

function TablaUsuarios({
  usuarios,
  onEditar,
  onToggleEstado,
  onResetPassword,
  procesando,
}: TablaUsuariosProps) {
  const getRolBadge = (rol: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-100 text-red-800",
      directora: "bg-purple-100 text-purple-800",
      tecnico: "bg-blue-100 text-blue-800",
    };
    return colors[rol] || "bg-gray-100 text-gray-800";
  };

  const getEstadoBadge = (estado: string) => {
    return estado === "activo"
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
  };

  if (usuarios.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <p className="text-lg">No hay usuarios registrados</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-gray-100 to-gray-50 border-b">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
              Nombre
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
              Email
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
              Rol
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
          {usuarios.map((usuario) => (
            <tr key={usuario.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 font-medium text-gray-900">
                {usuario.nombre}
              </td>
              <td className="px-6 py-4 text-gray-600">{usuario.email}</td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getRolBadge(
                    usuario.rol
                  )}`}
                >
                  {ROLES.find((r) => r.value === usuario.rol)?.label}
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoBadge(
                    usuario.estado
                  )}`}
                >
                  {usuario.estado === "activo" ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                <button
                  onClick={() => onEditar(usuario)}
                  disabled={procesando}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                  title="Editar usuario"
                >
                  ✏️ Editar
                </button>

                <button
                  onClick={() => onToggleEstado(usuario)}
                  disabled={procesando}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                  title={`${usuario.estado === "activo" ? "Desactivar" : "Activar"} usuario`}
                >
                  {usuario.estado === "activo" ? "🔒 Desactivar" : "🔓 Activar"}
                </button>

                <button
                  onClick={() => onResetPassword(usuario)}
                  disabled={procesando}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition"
                  title="Enviar enlace para restablecer contraseña"
                >
                  🔑 Reset
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
export default function UsuariosAdmin() {
  const { usuarios, loading, error: errorCarga, recargar } = useCargarUsuarios();
  const {
    crearUsuario,
    actualizarUsuario,
    toggleEstado,
    enviarResetPassword,
    procesando,
    error: errorOperacion,
    limpiarError,
  } = useOperacionesUsuario();

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
    () => validarFormulario(form, editandoId !== null),
    [form, editandoId]
  );

  // Manejadores
  const handleNuevoUsuario = useCallback(() => {
    setEditandoId(null);
    setForm(INITIAL_FORM);
    limpiarError();
  }, [limpiarError]);

  const handleEditar = useCallback((usuario: Usuario) => {
    setEditandoId(usuario.id);
    setForm({
      nombre: usuario.nombre,
      email: usuario.email,
      password: "",
      rol: usuario.rol,
      estado: usuario.estado,
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
      exito = await actualizarUsuario(editandoId, form);
    } else {
      exito = await crearUsuario(form);
    }

    if (exito) {
      const accion = editandoId ? "actualizado" : "creado";
      setAlerta({
        activa: true,
        tipo: "success",
        mensaje: `Usuario ${accion} correctamente`,
      });
      handleNuevoUsuario();
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
    actualizarUsuario,
    crearUsuario,
    errorOperacion,
    handleNuevoUsuario,
    recargar,
  ]);

  const handleToggleEstado = useCallback(
    async (usuario: Usuario) => {
      const exito = await toggleEstado(usuario.id, usuario.estado);
      if (exito) {
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: `Usuario ${usuario.estado === "activo" ? "desactivado" : "activado"} correctamente`,
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

  const handleResetPassword = useCallback(
    async (usuario: Usuario) => {
      const exito = await enviarResetPassword(usuario.email);
      if (exito) {
        setAlerta({
          activa: true,
          tipo: "success",
          mensaje: `Enlace de recuperación enviado a ${usuario.email}`,
        });
      } else {
        setAlerta({
          activa: true,
          tipo: "error",
          mensaje: errorOperacion || "Error al enviar el enlace",
        });
      }
    },
    [enviarResetPassword, errorOperacion]
  );

  // UI
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-600 font-medium">
            Cargando gestión de usuarios...
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
            <h1 className="text-4xl font-bold text-gray-900">👥 Gestión de Usuarios</h1>
            <p className="text-gray-600 mt-1">
              Administra técnicos, directoras y administradores del sistema
            </p>
          </div>
          <button
            onClick={handleNuevoUsuario}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            ➕ Nuevo Usuario
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
            mensaje={`Error al cargar usuarios: ${errorCarga}`}
            onClose={() => {}}
          />
        )}

        {/* Formulario */}
        <Formulario
          editandoId={editandoId}
          form={form}
          onFormChange={setForm}
          onSubmit={handleSubmitForm}
          onCancel={handleNuevoUsuario}
          procesando={procesando}
          erroresValidacion={erroresValidacion}
        />

        {/* Tabla */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Usuarios Registrados ({usuarios.length})
          </h2>
          <TablaUsuarios
            usuarios={usuarios}
            onEditar={handleEditar}
            onToggleEstado={handleToggleEstado}
            onResetPassword={handleResetPassword}
            procesando={procesando}
          />
        </div>
      </div>
    </div>
  );
}