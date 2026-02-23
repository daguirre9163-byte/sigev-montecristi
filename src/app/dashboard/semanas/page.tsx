"use client";

import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  serverTimestamp
} from "firebase/firestore";

export default function SemanasAdmin() {

  const [semanas, setSemanas] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [nuevaSemana, setNuevaSemana] =
    useState({

      fechaInicio: "",

      fechaFin: "",

      limitePlanificacion: "",

      limiteSeguimiento: ""

    });

  //----------------------------------------------------
  // LOAD
  //----------------------------------------------------

  useEffect(() => {

    cargarSemanas();

  }, []);

  async function cargarSemanas() {

    setLoading(true);

    const snap =
      await getDocs(
        collection(db, "semanas")
      );

    const lista =
      snap.docs.map(doc => ({

        id: doc.id,

        ...doc.data()

      }));

    lista.sort(
      (a: any, b: any) =>
        b.fechaInicio.localeCompare(a.fechaInicio)
    );

    setSemanas(lista);

    setLoading(false);

  }

  //----------------------------------------------------
  // CREAR
  //----------------------------------------------------

  async function crearSemana() {

    if (
      !nuevaSemana.fechaInicio ||
      !nuevaSemana.fechaFin
    ) {

      alert(
        "Complete fechas"
      );

      return;

    }

    if (
      nuevaSemana.fechaFin <
      nuevaSemana.fechaInicio
    ) {

      alert(
        "Fecha fin incorrecta"
      );

      return;

    }

    const existe =
      semanas.find(
        s =>
          s.fechaInicio === nuevaSemana.fechaInicio
      );

    if (existe) {

      alert(
        "Semana ya existe"
      );

      return;

    }

    await addDoc(
      collection(db, "semanas"),
      {

        fechaInicio:
          nuevaSemana.fechaInicio,

        fechaFin:
          nuevaSemana.fechaFin,

        limitePlanificacion:
          nuevaSemana.limitePlanificacion
            ? Timestamp.fromDate(
                new Date(
                  nuevaSemana.limitePlanificacion
                )
              )
            : null,

        limiteSeguimiento:
          nuevaSemana.limiteSeguimiento
            ? Timestamp.fromDate(
                new Date(
                  nuevaSemana.limiteSeguimiento
                )
              )
            : null,

        activa: false,

        createdAt:
          serverTimestamp()

      }
    );

    alert(
      "Semana creada"
    );

    setNuevaSemana({

      fechaInicio: "",

      fechaFin: "",

      limitePlanificacion: "",

      limiteSeguimiento: ""

    });

    cargarSemanas();

  }

  //----------------------------------------------------
  // ACTIVAR
  //----------------------------------------------------

  async function activarSemana(id: string) {

    if (!confirm(
      "¿Activar esta semana?"
    )) return;

    const snap =
      await getDocs(
        collection(db, "semanas")
      );

    for (const docSnap of snap.docs) {

      await updateDoc(
        doc(db, "semanas", docSnap.id),
        {
          activa: false
        }
      );

    }

    await updateDoc(
      doc(db, "semanas", id),
      {
        activa: true
      }
    );

    cargarSemanas();

  }

  //----------------------------------------------------
  // CERRAR
  //----------------------------------------------------

  async function cerrarSemana(id: string) {

    if (!confirm(
      "¿Cerrar esta semana?"
    )) return;

    await updateDoc(
      doc(db, "semanas", id),
      {
        activa: false
      }
    );

    cargarSemanas();

  }

  //----------------------------------------------------
  // FORMAT DATE
  //----------------------------------------------------

  function formatDate(
    timestamp: any
  ) {

    if (!timestamp)
      return "-";

    try {

      return timestamp
        .toDate()
        .toLocaleDateString();

    }

    catch {

      return "-";

    }

  }

  //----------------------------------------------------
  // UI
  //----------------------------------------------------

  if (loading)
    return (
      <div className="p-6">
        Cargando semanas...
      </div>
    );

  return (

    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-bold">
        Gestión de Semanas
      </h1>

      {/* CREAR */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded shadow">

        <div>

          <label className="text-sm">
            Fecha inicio
          </label>

          <input
            type="date"
            value={nuevaSemana.fechaInicio}
            onChange={e =>
              setNuevaSemana({
                ...nuevaSemana,
                fechaInicio:
                  e.target.value
              })
            }
            className="border p-2 w-full rounded"
          />

        </div>

        <div>

          <label>
            Fecha fin
          </label>

          <input
            type="date"
            value={nuevaSemana.fechaFin}
            onChange={e =>
              setNuevaSemana({
                ...nuevaSemana,
                fechaFin:
                  e.target.value
              })
            }
            className="border p-2 w-full rounded"
          />

        </div>

        <div>

          <label>
            Limite planificación
          </label>

          <input
            type="date"
            value={nuevaSemana.limitePlanificacion}
            onChange={e =>
              setNuevaSemana({
                ...nuevaSemana,
                limitePlanificacion:
                  e.target.value
              })
            }
            className="border p-2 w-full rounded"
          />

        </div>

        <div>

          <label>
            Limite seguimiento
          </label>

          <input
            type="date"
            value={nuevaSemana.limiteSeguimiento}
            onChange={e =>
              setNuevaSemana({
                ...nuevaSemana,
                limiteSeguimiento:
                  e.target.value
              })
            }
            className="border p-2 w-full rounded"
          />

        </div>

        <button
          onClick={crearSemana}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Crear Semana
        </button>

      </div>

      {/* TABLA */}

      <div className="bg-white p-4 rounded shadow">

        <table className="w-full">

          <thead>

            <tr className="bg-gray-100">

              <th className="p-2">
                Inicio
              </th>

              <th className="p-2">
                Fin
              </th>

              <th className="p-2">
                Limite Planificación
              </th>

              <th className="p-2">
                Limite Seguimiento
              </th>

              <th className="p-2">
                Estado
              </th>

              <th className="p-2">
                Acción
              </th>

            </tr>

          </thead>

          <tbody>

            {semanas.map(sem => (

              <tr key={sem.id}>

                <td className="p-2">
                  {sem.fechaInicio}
                </td>

                <td className="p-2">
                  {sem.fechaFin}
                </td>

                <td className="p-2">
                  {formatDate(
                    sem.limitePlanificacion
                  )}
                </td>

                <td className="p-2">
                  {formatDate(
                    sem.limiteSeguimiento
                  )}
                </td>

                <td className="p-2">

                  <span className={`px-2 py-1 rounded text-white text-sm ${
                    sem.activa
                      ? "bg-green-600"
                      : "bg-gray-500"
                  }`}>

                    {sem.activa
                      ? "Activa"
                      : "Cerrada"}

                  </span>

                </td>

                <td className="p-2">

                  {!sem.activa && (

                    <button
                      onClick={() =>
                        activarSemana(
                          sem.id
                        )
                      }
                      className="bg-green-600 text-white px-2 py-1 rounded"
                    >
                      Activar
                    </button>

                  )}

                  {sem.activa && (

                    <button
                      onClick={() =>
                        cerrarSemana(
                          sem.id
                        )
                      }
                      className="bg-red-600 text-white px-2 py-1 rounded"
                    >
                      Cerrar
                    </button>

                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}