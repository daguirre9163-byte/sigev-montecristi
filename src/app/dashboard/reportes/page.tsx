"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

import {
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function ReportesPage() {

  const { user } = useAuth();

  const [semana, setSemana] = useState<any>(null);

  const [totalActividades, setTotalActividades] = useState(0);
  const [totalAsistentes, setTotalAsistentes] = useState(0);
  const [promedioAsistencia, setPromedioAsistencia] = useState(0);

  const [reporteComunidades, setReporteComunidades] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  //---------------------------------------------------
  // LOAD DATA
  //---------------------------------------------------

  useEffect(() => {

    if (!user) return;

    cargarReporte();

  }, [user]);

  async function cargarReporte() {

    setLoading(true);

    const semanaActiva =
      await getSemanaActiva();

    if (!semanaActiva) {

      setLoading(false);
      return;

    }

    setSemana(semanaActiva);

    //------------------------------------------------
    // SEGUIMIENTOS
    //------------------------------------------------
        if (!user) return;


    const segQuery = query(
      collection(db, "seguimientos"),
      where("tecnicoId", "==", user.uid),
      where("semanaId", "==", semanaActiva.id),
      where("estado", "==", "enviado")
    );

    const segSnap =
      await getDocs(segQuery);

    let actividades = 0;
    let asistentes = 0;
    let porcentajeTotal = 0;
    let porcentajeCount = 0;

    segSnap.forEach(doc => {

      const data = doc.data();

      if (!data.registros) return;

      data.registros.forEach((r: any) => {

        actividades++;

        asistentes +=
          r.asistentesIds?.length || 0;

        porcentajeTotal +=
          r.porcentajeAsistencia || 0;

        porcentajeCount++;

      });

    });

    setTotalActividades(actividades);
    setTotalAsistentes(asistentes);

    setPromedioAsistencia(
      porcentajeCount > 0
        ? Math.round(
            porcentajeTotal /
            porcentajeCount
          )
        : 0
    );

    //------------------------------------------------
    // REPORTE COMUNIDADES
    //------------------------------------------------
        if (!user) return;


    const comunidadesData =
      await getComunidadesByTecnico(user.uid);

    comunidadesData.sort(
      (a, b) =>
        a.nombre.localeCompare(b.nombre)
    );

    const reporte = [];

    for (const comunidad of comunidadesData) {

      const partQuery = query(
        collection(db, "participantes"),
        where(
          "comunidadId",
          "==",
          comunidad.id
        ),
        where(
          "estado",
          "==",
          "activo"
        )
      );

      const partSnap =
        await getDocs(partQuery);

      reporte.push({

        comunidad:
          comunidad.nombre,

        participantes:
          partSnap.size

      });

    }

    setReporteComunidades(reporte);

    setLoading(false);

  }

  //---------------------------------------------------
  // EXPORTAR RESUMEN
  //---------------------------------------------------

  function exportarExcel() {

    if (reporteComunidades.length === 0) {

      alert("No hay datos");

      return;

    }

    const datos =
      reporteComunidades.map(r => ({

        Comunidad: r.comunidad,

        Participantes:
          r.participantes

      }));

    const worksheet =
      XLSX.utils.json_to_sheet(datos);

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Resumen"
    );

    const buffer =
      XLSX.write(workbook, {

        bookType: "xlsx",

        type: "array"

      });

    const file =
      new Blob(
        [buffer],
        {

          type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        }
      );

    saveAs(
      file,
      `Resumen_${semana.fechaInicio}_${semana.fechaFin}.xlsx`
    );

  }

  //---------------------------------------------------
  // UI
  //---------------------------------------------------

  if (loading)
    return <p>Cargando reportes...</p>;

  return (

    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex justify-between items-center">

        <div>

          <h1 className="text-2xl font-bold">

            Reportes Semanales

          </h1>

          <p className="text-gray-600">

            Semana:
            {" "}
            {semana?.fechaInicio}
            {" "}
            al
            {" "}
            {semana?.fechaFin}

          </p>

        </div>

        <button
          onClick={exportarExcel}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
        >
          Exportar Excel
        </button>

      </div>

      {/* KPI */}

      <div className="grid grid-cols-3 gap-4">

        <div className="bg-white p-4 rounded-xl shadow border">

          <p className="text-gray-500">
            Actividades
          </p>

          <h2 className="text-3xl font-bold text-blue-600">

            {totalActividades}

          </h2>

        </div>

        <div className="bg-white p-4 rounded-xl shadow border">

          <p className="text-gray-500">
            Total asistentes
          </p>

          <h2 className="text-3xl font-bold text-green-600">

            {totalAsistentes}

          </h2>

        </div>

        <div className="bg-white p-4 rounded-xl shadow border">

          <p className="text-gray-500">
            Promedio asistencia
          </p>

          <h2 className="text-3xl font-bold text-purple-600">

            {promedioAsistencia}%

          </h2>

        </div>

      </div>

      {/* TABLA */}

      <div className="bg-white p-6 rounded-xl shadow border">

        <h2 className="font-semibold mb-4">

          Participantes por comunidad

        </h2>

        <table className="w-full">

          <thead>

            <tr className="bg-gray-100">

              <th className="p-2 text-left">

                Comunidad

              </th>

              <th className="p-2 text-center">

                Participantes

              </th>

            </tr>

          </thead>

          <tbody>

            {reporteComunidades.map((r, i) => (

              <tr
                key={i}
                className="border-t"
              >

                <td className="p-2">

                  {r.comunidad}

                </td>

                <td className="p-2 text-center font-semibold">

                  {r.participantes}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}