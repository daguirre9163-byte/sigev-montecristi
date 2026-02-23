"use client";

import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";

export default function ComunidadesAdmin() {

  //--------------------------------------------------
  // STATES
  //--------------------------------------------------

  const [comunidades, setComunidades] =
    useState<any[]>([]);

  const [tecnicos, setTecnicos] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [editandoId, setEditandoId] =
    useState<string | null>(null);

  const [form, setForm] =
    useState({

      nombre: "",

      tecnicoId: "",

      tecnicoNombre: "",

      estado: "activo"

    });

  //--------------------------------------------------
  // LOAD
  //--------------------------------------------------

  useEffect(() => {

    cargarDatos();

  }, []);

  async function cargarDatos() {

    setLoading(true);

    // comunidades
    const snap =
      await getDocs(
        collection(db, "comunidades")
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

    setComunidades(lista);

    // tecnicos
    const usersSnap =
      await getDocs(
        collection(db, "usuarios")
      );

const listaTecnicos =
  usersSnap.docs
    .map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    .filter(
      (u: any) =>
        u.estado === "activo" &&
        (
          u.rol === "tecnico" ||
          u.rol === "admin"

        )
    );
    setTecnicos(listaTecnicos);

    setLoading(false);

  }

  //--------------------------------------------------
  // CREAR
  //--------------------------------------------------

  async function crearComunidad() {

    if (
      !form.nombre ||
      !form.tecnicoId
    ) {

      alert(
        "Complete los campos"
      );

      return;

    }

    await addDoc(
      collection(db, "comunidades"),
      {

        nombre:
          form.nombre,

        tecnicoId:
          form.tecnicoId,

        tecnicoNombre:
          form.tecnicoNombre,

        estado:
          "activo",

        createdAt:
          serverTimestamp()

      }
    );

    alert("Comunidad creada");

    limpiar();

    cargarDatos();

  }

  //--------------------------------------------------
  // ACTUALIZAR
  //--------------------------------------------------

  async function actualizarComunidad() {

    if (!editandoId)
      return;

    await updateDoc(
      doc(db, "comunidades", editandoId),
      {

        nombre:
          form.nombre,

        tecnicoId:
          form.tecnicoId,

        tecnicoNombre:
          form.tecnicoNombre,

        estado:
          form.estado

      }
    );

    alert("Comunidad actualizada");

    limpiar();

    cargarDatos();

  }

  //--------------------------------------------------
  // EDITAR
  //--------------------------------------------------

  function editar(c: any) {

    setEditandoId(c.id);

    setForm({

      nombre:
        c.nombre,

      tecnicoId:
        c.tecnicoId,

      tecnicoNombre:
        c.tecnicoNombre,

      estado:
        c.estado

    });

  }

  //--------------------------------------------------
  // ACTIVAR / DESACTIVAR
  //--------------------------------------------------

  async function toggleEstado(c: any) {

    await updateDoc(
      doc(db, "comunidades", c.id),
      {

        estado:
          c.estado === "activo"
            ? "inactivo"
            : "activo"

      }
    );

    cargarDatos();

  }

  //--------------------------------------------------
  // LIMPIAR
  //--------------------------------------------------

  function limpiar() {

    setEditandoId(null);

    setForm({

      nombre: "",

      tecnicoId: "",

      tecnicoNombre: "",

      estado: "activo"

    });

  }

  //--------------------------------------------------
  // SELECT TECNICO
  //--------------------------------------------------

  function seleccionarTecnico(id: string) {

    const tecnico =
      tecnicos.find(
        t => t.id === id
      );

    setForm({

      ...form,

      tecnicoId: id,

      tecnicoNombre:
        tecnico?.nombre || ""

    });

  }

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  if (loading)
    return (
      <div className="p-6">
        Cargando comunidades...
      </div>
    );

  return (

    <div className="p-6 space-y-6">

      <div className="flex justify-between">

        <h1 className="text-2xl font-bold">

          Gestión de Comunidades

        </h1>

        <button
          onClick={limpiar}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Nueva comunidad
        </button>

      </div>

      {/* FORM */}

      <div className="bg-white p-4 rounded shadow space-y-3">

        <input
          placeholder="Nombre comunidad"
          value={form.nombre}
          onChange={e =>
            setForm({
              ...form,
              nombre:
                e.target.value
            })
          }
          className="border p-2 w-full rounded"
        />

        <select
          value={form.tecnicoId}
          onChange={e =>
            seleccionarTecnico(
              e.target.value
            )
          }
          className="border p-2 w-full rounded"
        >

          <option value="">
            Seleccione técnico
          </option>

          {tecnicos.map(t => (

            <option
              key={t.id}
              value={t.id}
            >
              {t.nombre}
            </option>

          ))}

        </select>

        {editandoId && (

          <select
            value={form.estado}
            onChange={e =>
              setForm({
                ...form,
                estado:
                  e.target.value
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

        <button
          onClick={
            editandoId
              ? actualizarComunidad
              : crearComunidad
          }
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          {editandoId
            ? "Actualizar"
            : "Crear"}
        </button>

      </div>

      {/* TABLA */}

      <table className="w-full bg-white shadow rounded">

        <thead>

          <tr className="bg-gray-100">

            <th className="p-2">
              Comunidad
            </th>

            <th className="p-2">
              Técnico
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

          {comunidades.map(c => (

            <tr key={c.id}>

              <td className="p-2">
                {c.nombre}
              </td>

              <td className="p-2">
                {c.tecnicoNombre}
              </td>

              <td className="p-2">

                <span className={`px-2 py-1 rounded text-white ${
                  c.estado === "activo"
                    ? "bg-green-600"
                    : "bg-red-600"
                }`}>

                  {c.estado}

                </span>

              </td>

              <td className="p-2 flex gap-2">

                <button
                  onClick={() =>
                    editar(c)
                  }
                  className="bg-blue-600 text-white px-2 py-1 rounded"
                >
                  Editar
                </button>

                <button
                  onClick={() =>
                    toggleEstado(c)
                  }
                  className="bg-yellow-600 text-white px-2 py-1 rounded"
                >
                  Activar/Desactivar
                </button>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}