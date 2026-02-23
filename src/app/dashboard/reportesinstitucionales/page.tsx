"use client";

import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import { getSemanaActiva } from "@/lib/getSemanaActiva";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function ReportesInstitucionalesAdmin() {

  const [loading, setLoading] =
    useState(true);

  const [semana, setSemana] =
    useState<any>(null);

  const [tecnicos, setTecnicos] =
    useState<any[]>([]);

  const [kpi, setKpi] =
    useState({

      totalTecnicos: 0,

      totalComunidades: 0,

      totalParticipantes: 0,

      planificacionesEnviadas: 0,

      seguimientosEnviados: 0

    });

  //--------------------------------------------------
  // LOAD
  //--------------------------------------------------

  useEffect(() => {

    cargarReporte();

  }, []);

  async function cargarReporte() {

    setLoading(true);

    const semanaActiva =
      await getSemanaActiva();

    setSemana(semanaActiva);

    const usersSnap =
      await getDocs(
        collection(db, "usuarios")
      );

    const listaTecnicos = [];

    let totalComunidades = 0;
    let totalParticipantes = 0;
    let totalPlan = 0;
    let totalSeg = 0;

    //--------------------------------------------------
    // RECORRER TECNICOS
    //--------------------------------------------------

    for (const userDoc of usersSnap.docs) {

      const user =
        userDoc.data();

      if (user.rol !== "tecnico")
        continue;

      const tecnicoId =
        userDoc.id;

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

      const comunidadesCount =
        comunidadesSnap.size;

      totalComunidades +=
        comunidadesCount;

      //--------------------------------------------------
      // participantes
      //--------------------------------------------------

      const participantesSnap =
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

      const participantesCount =
        participantesSnap.size;

      totalParticipantes +=
        participantesCount;

      //--------------------------------------------------
      // planificacion
      //--------------------------------------------------

      let planEnviado =
        false;

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

        planEnviado =
          !planSnap.empty;

        if (planEnviado)
          totalPlan++;

      }

      //--------------------------------------------------
      // seguimiento
      //--------------------------------------------------

      let segEnviado =
        false;

      if (semanaActiva) {

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

        segEnviado =
          !segSnap.empty;

        if (segEnviado)
          totalSeg++;

      }

      //--------------------------------------------------
      // cumplimiento %
      //--------------------------------------------------

      let cumplimiento = 0;

      if (planEnviado)
        cumplimiento += 50;

      if (segEnviado)
        cumplimiento += 50;

      listaTecnicos.push({

        nombre:
          user.nombre ||
          user.email,

        comunidades:
          comunidadesCount,

        participantes:
          participantesCount,

        planificacion:
          planEnviado,

        seguimiento:
          segEnviado,

        cumplimiento

      });

    }

    //--------------------------------------------------
    // KPI
    //--------------------------------------------------

    setTecnicos(listaTecnicos);

    setKpi({

      totalTecnicos:
        listaTecnicos.length,

      totalComunidades,

      totalParticipantes,

      planificacionesEnviadas:
        totalPlan,

      seguimientosEnviados:
        totalSeg

    });

    setLoading(false);

  }

  //--------------------------------------------------
  // EXPORTAR
  //--------------------------------------------------

  function exportarExcel() {

    const datos =
      tecnicos.map(t => ({

        Tecnico:
          t.nombre,

        Comunidades:
          t.comunidades,

        Participantes:
          t.participantes,

        Planificacion:
          t.planificacion
            ? "Enviado"
            : "Pendiente",

        Seguimiento:
          t.seguimiento
            ? "Enviado"
            : "Pendiente",

        Cumplimiento:
          `${t.cumplimiento}%`

      }));

    const ws =
      XLSX.utils.json_to_sheet(datos);

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Reporte Institucional"
    );

    const buffer =
      XLSX.write(wb, {
        bookType: "xlsx",
        type: "array"
      });

    const file =
      new Blob([buffer]);

    saveAs(
      file,
      "Reporte_SIGEV_Institucional.xlsx"
    );

  }

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  if (loading)
    return <div className="p-6">Cargando reporte institucional...</div>;

  return (

    <div className="p-6 space-y-6">

      <div className="flex justify-between">

        <h1 className="text-2xl font-bold">

          Reporte Institucional

        </h1>

        <button
          onClick={exportarExcel}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Exportar Excel
        </button>

      </div>

      {/* KPI */}

      <div className="grid grid-cols-5 gap-4">

        <KPI titulo="Técnicos" valor={kpi.totalTecnicos} />

        <KPI titulo="Comunidades" valor={kpi.totalComunidades} />

        <KPI titulo="Participantes" valor={kpi.totalParticipantes} />

        <KPI titulo="Planificaciones enviadas" valor={kpi.planificacionesEnviadas} />

        <KPI titulo="Seguimientos enviados" valor={kpi.seguimientosEnviados} />

      </div>

      {/* TABLA */}

      <table className="w-full bg-white rounded shadow">

        <thead className="bg-gray-100">

          <tr>

            <th className="p-2">Técnico</th>

            <th className="p-2">Comunidades</th>

            <th className="p-2">Participantes</th>

            <th className="p-2">Planificación</th>

            <th className="p-2">Seguimiento</th>

            <th className="p-2">Cumplimiento</th>

          </tr>

        </thead>

        <tbody>

          {tecnicos.map((t, i) => (

            <tr key={i} className="border-t">

              <td className="p-2">
                {t.nombre}
              </td>

              <td className="p-2 text-center">
                {t.comunidades}
              </td>

              <td className="p-2 text-center">
                {t.participantes}
              </td>

              <td className="p-2 text-center">
                {t.planificacion ? "🟢" : "🔴"}
              </td>

              <td className="p-2 text-center">
                {t.seguimiento ? "🟢" : "🔴"}
              </td>

              <td className="p-2 text-center font-bold">
                {t.cumplimiento}%
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}

function KPI({ titulo, valor }: any) {

  return (

    <div className="bg-white p-4 rounded shadow">

      <p className="text-gray-500">
        {titulo}
      </p>

      <h2 className="text-2xl font-bold text-green-600">
        {valor}
      </h2>

    </div>

  );

}