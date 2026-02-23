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

import { useRouter } from "next/navigation";

export default function DashboardAdmin() {

  const router = useRouter();

  const [loading, setLoading] =
    useState(true);

  const [semana, setSemana] =
    useState<any>(null);

  const [tecnicos, setTecnicos] =
    useState<any[]>([]);

  const [kpi, setKpi] =
    useState({

      tecnicos: 0,

      comunidades: 0,

      participantes: 0,

      planificaciones: 0,

      seguimientos: 0,

      cumplimiento: 0

    });

  const [alertas, setAlertas] =
    useState<string[]>([]);

  //-------------------------------------------------
  // LOAD
  //-------------------------------------------------

  useEffect(() => {

    cargarDashboard();

  }, []);

  async function cargarDashboard() {

    setLoading(true);

    const semanaActiva =
      await getSemanaActiva();

    setSemana(semanaActiva);

    const usersSnap =
      await getDocs(
        collection(db, "usuarios")
      );

    const lista = [];

    let totalComunidades = 0;
    let totalParticipantes = 0;
    let totalPlan = 0;
    let totalSeg = 0;

    const alertasTemp = [];

    //-------------------------------------------------
    // RECORRER TECNICOS
    //-------------------------------------------------

    for (const userDoc of usersSnap.docs) {

      const user =
        userDoc.data();

     const esTecnicoOperativo =
  user.estado === "activo" &&
  (
    user.rol === "tecnico" ||
    user.rol === "admin"
  );

if (!esTecnicoOperativo)
  continue;
      const tecnicoId =
        userDoc.id;

      //-------------------------------------------------
      // comunidades
      //-------------------------------------------------

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

      //-------------------------------------------------
      // participantes
      //-------------------------------------------------

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

      const participantesCount =
        partSnap.size;

      totalParticipantes +=
        participantesCount;

      //-------------------------------------------------
      // planificacion
      //-------------------------------------------------

      let planEnviado = false;

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
        else
          alertasTemp.push(
            `${user.nombre || user.email} sin planificación`
          );

      }

      //-------------------------------------------------
      // seguimiento
      //-------------------------------------------------

      let segEnviado = false;

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
        else
          alertasTemp.push(
            `${user.nombre || user.email} sin seguimiento`
          );

      }

      //-------------------------------------------------
      // cumplimiento
      //-------------------------------------------------

      let cumplimiento = 0;

      if (planEnviado)
        cumplimiento += 50;

      if (segEnviado)
        cumplimiento += 50;

      lista.push({

        id: tecnicoId,

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

    //-------------------------------------------------
    // KPI
    //-------------------------------------------------

    const cumplimientoGlobal =
      lista.length > 0
        ? Math.round(
            lista.reduce(
              (acc, t) =>
                acc + t.cumplimiento,
              0
            ) / lista.length
          )
        : 0;

    setTecnicos(lista);

    setKpi({

      tecnicos:
        lista.length,

      comunidades:
        totalComunidades,

      participantes:
        totalParticipantes,

      planificaciones:
        totalPlan,

      seguimientos:
        totalSeg,

      cumplimiento:
        cumplimientoGlobal

    });

    setAlertas(alertasTemp);

    setLoading(false);

  }

  //-------------------------------------------------
  // EXPORTAR
  //-------------------------------------------------

  function exportarExcel() {

    const datos =
      tecnicos.map(t => ({

        Tecnico: t.nombre,

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
      "SIGEV"
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
      "SIGEV_Admin.xlsx"
    );

  }

  //-------------------------------------------------
  // UI
  //-------------------------------------------------

  if (loading)
    return (
      <div className="p-6">
        Cargando panel admin...
      </div>
    );

  return (

    <div className="p-6 space-y-6">

      <div className="flex justify-between">

        <h1 className="text-2xl font-bold">
          Dashboard Admin SIGEV
        </h1>

        <button
          onClick={exportarExcel}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Exportar Excel
        </button>

      </div>

      {/* KPI */}

      <div className="grid grid-cols-6 gap-4">

        <KPI titulo="Técnicos" valor={kpi.tecnicos} />

        <KPI titulo="Comunidades" valor={kpi.comunidades} />

        <KPI titulo="Participantes" valor={kpi.participantes} />

        <KPI titulo="Planificaciones" valor={kpi.planificaciones} />

        <KPI titulo="Seguimientos" valor={kpi.seguimientos} />

        <KPI titulo="% Cumplimiento" valor={`${kpi.cumplimiento}%`} />

      </div>

      {/* ALERTAS */}

      {alertas.length > 0 && (

        <div className="bg-red-100 p-4 rounded">

          <h2 className="font-bold text-red-700">
            Alertas
          </h2>

          {alertas.map((a, i) => (

            <p key={i}>
              ⚠ {a}
            </p>

          ))}

        </div>

      )}

      {/* TABLA */}

      <table className="w-full bg-white shadow rounded">

        <thead className="bg-gray-100">

          <tr>

            <th className="p-2">
              Técnico
            </th>

            <th className="p-2">
              Comunidades
            </th>

            <th className="p-2">
              Participantes
            </th>

            <th className="p-2">
              Planificación
            </th>

            <th className="p-2">
              Seguimiento
            </th>

            <th className="p-2">
              Cumplimiento
            </th>

          </tr>

        </thead>

        <tbody>

          {tecnicos.map(t => (

            <tr
              key={t.id}
              className="border-t cursor-pointer hover:bg-gray-50"
              onClick={() =>
                router.push(
                  `/dashboard/admin/tecnico/${t.id}`
                )
              }
            >

              <td className="p-2 text-blue-600">

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

      <h2 className="text-2xl font-bold text-blue-600">
        {valor}
      </h2>

    </div>

  );

}