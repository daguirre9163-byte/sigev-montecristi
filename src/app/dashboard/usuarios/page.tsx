"use client";

import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

//import { firebaseConfig } from "@/lib/firebase.ts";
import { firebaseConfig } from "@/lib/firebase";

import {
  collection,
  getDocs,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";

import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";

import {
  initializeApp,
  deleteApp
} from "firebase/app";

export default function UsuariosAdmin() {

  //--------------------------------------------------
  // STATES
  //--------------------------------------------------

  const [usuarios, setUsuarios] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [editandoId, setEditandoId] =
    useState<string | null>(null);

  const [form, setForm] =
    useState({

      nombre: "",

      email: "",

      password: "",

      rol: "tecnico",

      estado: "activo"

    });

  //--------------------------------------------------
  // LOAD
  //--------------------------------------------------

  useEffect(() => {

    cargarUsuarios();

  }, []);

  async function cargarUsuarios() {

    setLoading(true);

    const snap =
      await getDocs(
        collection(db, "usuarios")
      );

    const lista =
      snap.docs.map(doc => ({

        id: doc.id,

        ...doc.data()

      }));

    lista.sort(
      (a: any, b: any) =>
        a.nombre?.localeCompare(b.nombre)
    );

    setUsuarios(lista);

    setLoading(false);

  }

  //--------------------------------------------------
  // CREAR USUARIO SIN CAMBIAR SESIÓN ADMIN
  //--------------------------------------------------

  async function crearUsuario() {

    try {

      if (
        !form.nombre ||
        !form.email ||
        !form.password
      ) {

        alert("Complete todos los campos");

        return;

      }

      // crear instancia secundaria
      const secondaryApp =
        initializeApp(
          firebaseConfig,
          "Secondary"
        );

      const secondaryAuth =
        getAuth(secondaryApp);

      // crear usuario
      const cred =
        await createUserWithEmailAndPassword(
          secondaryAuth,
          form.email,
          form.password
        );

      // guardar en Firestore
      await setDoc(
        doc(db, "usuarios", cred.user.uid),
        {

          nombre: form.nombre,

          email: form.email,

          rol: form.rol,

          estado: "activo",

          createdAt:
            serverTimestamp()

        }
      );

      // cerrar instancia secundaria
      await signOut(secondaryAuth);

      await deleteApp(secondaryApp);

      alert("Usuario creado correctamente");

      limpiar();

      cargarUsuarios();

    }
    catch (error: any) {

      alert(error.message);

    }

  }

  //--------------------------------------------------
  // ACTUALIZAR USUARIO
  //--------------------------------------------------

  async function actualizarUsuario() {

    if (!editandoId)
      return;

    await updateDoc(
      doc(db, "usuarios", editandoId),
      {

        nombre: form.nombre,

        rol: form.rol,

        estado: form.estado

      }
    );

    alert("Usuario actualizado");

    limpiar();

    cargarUsuarios();

  }

  //--------------------------------------------------
  // EDITAR
  //--------------------------------------------------

  function editarUsuario(u: any) {

    setEditandoId(u.id);

    setForm({

      nombre: u.nombre,

      email: u.email,

      password: "",

      rol: u.rol,

      estado: u.estado

    });

  }

  //--------------------------------------------------
  // ACTIVAR / DESACTIVAR
  //--------------------------------------------------

  async function toggleEstado(u: any) {

    await updateDoc(
      doc(db, "usuarios", u.id),
      {

        estado:
          u.estado === "activo"
            ? "inactivo"
            : "activo"

      }
    );

    cargarUsuarios();

  }

  //--------------------------------------------------
  // RESET PASSWORD
  //--------------------------------------------------

  async function resetPassword(email: string) {

    try {

      const auth =
        getAuth();

      await sendPasswordResetEmail(
        auth,
        email
      );

      alert(
        "Correo enviado correctamente"
      );

    }
    catch {

      alert(
        "Error al enviar correo"
      );

    }

  }

  //--------------------------------------------------
  // LIMPIAR
  //--------------------------------------------------

  function limpiar() {

    setEditandoId(null);

    setForm({

      nombre: "",

      email: "",

      password: "",

      rol: "tecnico",

      estado: "activo"

    });

  }

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  if (loading)
    return (
      <div className="p-6">
        Cargando usuarios...
      </div>
    );

  return (

    <div className="p-6 space-y-6">

      <div className="flex justify-between">

        <h1 className="text-2xl font-bold">
          Gestión de Usuarios
        </h1>

        <button
          onClick={limpiar}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Nuevo usuario
        </button>

      </div>

      {/* FORM */}

      <div className="bg-white p-4 rounded shadow space-y-3">

        <h2 className="font-semibold">

          {editandoId
            ? "Editar usuario"
            : "Crear usuario"}

        </h2>

        <input
          placeholder="Nombre"
          value={form.nombre}
          onChange={e =>
            setForm({
              ...form,
              nombre: e.target.value
            })
          }
          className="border p-2 w-full rounded"
        />

        <input
          placeholder="Email"
          value={form.email}
          disabled={editandoId !== null}
          onChange={e =>
            setForm({
              ...form,
              email: e.target.value
            })
          }
          className={`border p-2 w-full rounded ${
            editandoId !== null
              ? "bg-gray-200"
              : ""
          }`}
        />

        {!editandoId && (

          <input
            type="password"
            placeholder="Contraseña temporal"
            value={form.password}
            onChange={e =>
              setForm({
                ...form,
                password: e.target.value
              })
            }
            className="border p-2 w-full rounded"
          />

        )}

        <select
          value={form.rol}
          onChange={e =>
            setForm({
              ...form,
              rol: e.target.value
            })
          }
          className="border p-2 w-full rounded"
        >

          <option value="tecnico">
            Técnico
          </option>

          <option value="directora">
            Directora
          </option>

          <option value="admin">
            Admin
          </option>

        </select>

        {editandoId && (

          <select
            value={form.estado}
            onChange={e =>
              setForm({
                ...form,
                estado: e.target.value
              })
            }
            className="border p-2 w-full rounded"
          >

            <option value="activo">
              Activo
            </option>

            <option value="inactivo">
              Inactivo
            </option>

          </select>

        )}

        <div className="flex gap-2">

          <button
            onClick={
              editandoId
                ? actualizarUsuario
                : crearUsuario
            }
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            {editandoId
              ? "Actualizar"
              : "Crear"}
          </button>

          {editandoId && (

            <button
              onClick={limpiar}
              className="bg-gray-600 text-white px-4 py-2 rounded"
            >
              Cancelar
            </button>

          )}

        </div>

      </div>

      {/* TABLA */}

      <table className="w-full bg-white shadow rounded">

        <thead>

          <tr className="bg-gray-100">

            <th className="p-2">
              Nombre
            </th>

            <th className="p-2">
              Email
            </th>

            <th className="p-2">
              Rol
            </th>

            <th className="p-2">
              Estado
            </th>

            <th className="p-2">
              Acciones
            </th>

          </tr>

        </thead>

        <tbody>

          {usuarios.map(u => (

            <tr key={u.id}>

              <td className="p-2">
                {u.nombre}
              </td>

              <td className="p-2">
                {u.email}
              </td>

              <td className="p-2">
                {u.rol}
              </td>

              <td className="p-2">

                <span className={`px-2 py-1 rounded text-white ${
                  u.estado === "activo"
                    ? "bg-green-600"
                    : "bg-red-600"
                }`}>

                  {u.estado}

                </span>

              </td>

              <td className="p-2 flex gap-2">

                <button
                  onClick={() =>
                    editarUsuario(u)
                  }
                  className="bg-blue-600 text-white px-2 py-1 rounded"
                >
                  Editar
                </button>

                <button
                  onClick={() =>
                    toggleEstado(u)
                  }
                  className="bg-yellow-600 text-white px-2 py-1 rounded"
                >
                  Activar/Desactivar
                </button>

                <button
                  onClick={() =>
                    resetPassword(u.email)
                  }
                  className="bg-purple-600 text-white px-2 py-1 rounded"
                >
                  Reset Password
                </button>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}