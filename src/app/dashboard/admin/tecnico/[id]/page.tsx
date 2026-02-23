"use client";

import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where
} from "firebase/firestore";

import { useParams } from "next/navigation";

import { getSemanaActiva } from "@/lib/getSemanaActiva";

export default function DetalleTecnicoAdmin() {

  const params =
    useParams();

  const tecnicoId =
    params.id as string;

  const [loading, setLoading] =
    useState(true);

  const [tecnico, setTecnico] =
    useState<any>(null);

  const [comunidades, setComunidades] =
    useState<any[]>([]);

  const [participantes, setParticipantes] =
    useState(0);

  const [planificacion, setPlanificacion] =
    useState(false);

  const [seguimiento, setSeguimiento] =
    useState(false);

  const [registros, setRegistros] =
    useState<any[]>([]);

  const [semana, setSemana] =
    useState<any>(null);

  //--------------------------------------------------
  // LOAD
  //--------------------------------------------------

  useEffect(() => {

    if (!tecnicoId)
      return;

    cargar();

  }, [tecnicoId]);

  async function cargar() {

    setLoading(true);

    const semanaActiva =
      await getSemanaActiva();

    setSemana(semanaActiva);

    //--------------------------------------------------
    // tecnico
    //--------------------------------------------------

    const tecnicoDoc =
      await getDoc(
        doc(
          db,
          "usuarios",
          tecnicoId
        )
      );

    if (tecnicoDoc.exists())
      setTecnico(
        tecnicoDoc.data()
      );

    //--------------------------------------------------
    // comunidades
    //--------------------------------------------------

    const comunidadesSnap =
      await getDocs(
        query(
          collection(db, "comunidades"),
          where(
            "tecnicoId",
            "==",
            tecnicoId
          )
        )
      );

    const listaComunidades =
      comunidadesSnap.docs.map(d => ({

        id: d.id,

        ...d.data()

      }));

    setComunidades(
      listaComunidades
    );

    //--------------------------------------------------
    // participantes
    //--------------------------------------------------

    const partSnap =
      await getDocs(
        query(
          collection(db, "participantes"),
          where(
            "tecnicoId",
            "==",
            tecnicoId
          ),
          where(
            "estado",
            "==",
            "activo"
          )
        )
      );

    setParticipantes(
      partSnap.size
    );

    //--------------------------------------------------
    // planificacion
    //--------------------------------------------------

    if (semanaActiva) {

      const planSnap =
        await getDocs(
          query(
            collection(db, "planificaciones"),
            where(
              "tecnicoId",
              "==",
              tecnicoId
            ),
            where(
              "semanaId",
              "==",
              semanaActiva.id
            ),
            where(
              "estado",
              "==",
              "enviado"
            )
          )
        );

      setPlanificacion(
        !planSnap.empty
      );

      //--------------------------------------------------
      // seguimiento
      //--------------------------------------------------

      const segSnap =
        await getDocs(
          query(
            collection(db, "seguimientos"),
            where(
              "tecnicoId",
              "==",
              tecnicoId
            ),
            where(
              "semanaId",
              "==",
              semanaActiva.id
            ),
            where(
              "estado",
              "==",
              "enviado"
            )
          )
        );

      if (!segSnap.empty) {

        setSeguimiento(true);

        const data =
          segSnap.docs[0].data();

        setRegistros(
          data.registros || []
        );

      }

    }

    setLoading(false);

  }

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  if (loading)
    return <div className="p-6">Cargando técnico...</div>;

  return (

    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-bold">

        Detalle Técnico

      </h1>

      {/* INFO */}

      <div className="bg-white p-4 rounded shadow">

        <p>
          <strong>Nombre:</strong>
          {" "}
          {tecnico?.nombre || tecnico?.email}
        </p>

        <p>
          <strong>Email:</strong>
          {" "}
          {tecnico?.email}
        </p>

        <p>
          <strong>Comunidades:</strong>
          {" "}
          {comunidades.length}
        </p>

        <p>
          <strong>Participantes:</strong>
          {" "}
          {participantes}
        </p>

        <p>
          <strong>Planificación:</strong>
          {" "}
          {planificacion
            ? "🟢 Enviado"
            : "🔴 Pendiente"}
        </p>

        <p>
          <strong>Seguimiento:</strong>
          {" "}
          {seguimiento
            ? "🟢 Enviado"
            : "🔴 Pendiente"}
        </p>

      </div>

      {/* COMUNIDADES */}

      <div className="bg-white p-4 rounded shadow">

        <h2 className="font-bold mb-2">

          Comunidades asignadas

        </h2>

        <ul>

          {comunidades.map(c => (

            <li key={c.id}>

              • {c.nombre}

            </li>

          ))}

        </ul>

      </div>

      {/* REGISTROS */}

      {seguimiento && (

        <div className="bg-white p-4 rounded shadow">

          <h2 className="font-bold mb-2">

            Seguimiento semanal

          </h2>

          <table className="w-full">

            <thead>

              <tr className="bg-gray-100">

                <th className="p-2">
                  Comunidad
                </th>

                <th className="p-2">
                  Actividad
                </th>

                <th className="p-2">
                  Asistencia
                </th>

              </tr>

            </thead>

            <tbody>

              {registros.map(
                (r, i) => (

                  <tr key={i}>

                    <td className="p-2">

                      {r.comunidadNombre ||
                        r.comunidadId}

                    </td>

                    <td className="p-2">

                      {r.actividadRealizada ||
                        r.actividadPlanificada}

                    </td>

                    <td className="p-2">

                      {r.porcentajeAsistencia}%

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      )}

    </div>

  );

}