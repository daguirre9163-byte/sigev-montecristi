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

export default function DashboardDirectora() {

  const [semana, setSemana] = useState<any>(null);

  const [tecnicos, setTecnicos] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [totales, setTotales] = useState({
    tecnicos: 0,
    comunidades: 0,
    participantes: 0,
    planificaciones: 0,
    seguimientos: 0
  });

  useEffect(() => {

    cargarDashboard();

  }, []);

  async function cargarDashboard() {

    try {

      setLoading(true);

      const semanaActiva =
        await getSemanaActiva();

      setSemana(semanaActiva);

      const usersSnap =
        await getDocs(
          collection(db, "usuarios")
        );

      const listaTecnicos: any[] = [];

      let totalComunidades = 0;
      let totalParticipantes = 0;
      let totalPlanificaciones = 0;
      let totalSeguimientos = 0;

      for (const userDoc of usersSnap.docs) {

        const user = userDoc.data();

        if (!user.rol ||
            user.rol.toLowerCase() !== "tecnico")
          continue;

        const tecnicoId = userDoc.id;

        // COMUNIDADES
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

        // PARTICIPANTES
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

        // PLANIFICACION
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
            totalPlanificaciones++;

        }

        // SEGUIMIENTO
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
            totalSeguimientos++;

        }

        listaTecnicos.push({

          id: tecnicoId,

          nombre:
            user.nombre ||
            user.nombres ||
            user.email ||
            "Sin nombre",

          comunidades:
            comunidadesCount,

          participantes:
            participantesCount,

          planificacion:
            planEnviado,

          seguimiento:
            segEnviado

        });

      }

      setTecnicos(listaTecnicos);

      setTotales({

        tecnicos:
          listaTecnicos.length,

        comunidades:
          totalComunidades,

        participantes:
          totalParticipantes,

        planificaciones:
          totalPlanificaciones,

        seguimientos:
          totalSeguimientos

      });

    }
    catch (error) {

      console.error(
        "Error cargando dashboard:",
        error
      );

    }

    setLoading(false);

  }

  // EXPORTAR EXCEL INSTITUCIONAL
  function exportarExcelInstitucional() {

    const datos = tecnicos.map(t => ({

      Tecnico: t.nombre,

      Comunidades: t.comunidades,

      Participantes: t.participantes,

      Planificacion:
        t.planificacion
          ? "Enviado"
          : "Pendiente",

      Seguimiento:
        t.seguimiento
          ? "Enviado"
          : "Pendiente"

    }));

    const ws =
      XLSX.utils.json_to_sheet(datos);

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Reporte"
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
      "Reporte_Institucional.xlsx"
    );

  }

  function verDetalleTecnico(id: string) {

    window.location.href =
      `/dashboard/directora/tecnico/${id}`;

  }

  if (loading)
    return (
      <div className="p-6">
        Cargando dashboard...
      </div>
    );

  return (

    <div className="space-y-6">

      <div className="flex justify-between items-center">

        <h1 className="text-2xl font-bold">
          Dashboard Institucional
        </h1>

        <button
          onClick={exportarExcelInstitucional}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Exportar Excel
        </button>

      </div>

      {/* KPIs */}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

        <KPI titulo="Técnicos" valor={totales.tecnicos} color="blue" />

        <KPI titulo="Comunidades" valor={totales.comunidades} color="green" />

        <KPI titulo="Participantes" valor={totales.participantes} color="purple" />

        <KPI titulo="Planificaciones" valor={totales.planificaciones} color="orange" />

        <KPI titulo="Seguimientos" valor={totales.seguimientos} color="red" />

      </div>

      {/* TABLA */}

      <div className="bg-white p-6 rounded shadow">

        <h2 className="font-semibold mb-4">
          Estado por técnico
        </h2>

        <table className="w-full border">

          <thead className="bg-gray-100">

            <tr>

              <th className="p-2 border">
                Técnico
              </th>

              <th className="p-2 border">
                Comunidades
              </th>

              <th className="p-2 border">
                Participantes
              </th>

              <th className="p-2 border">
                Planificación
              </th>

              <th className="p-2 border">
                Seguimiento
              </th>

            </tr>

          </thead>

          <tbody>

            {tecnicos.map((t, i) => (

              <tr key={i}>

                <td className="border p-2">

                  <button
                    onClick={() =>
                      verDetalleTecnico(t.id)
                    }
                    className="text-blue-600 hover:underline"
                  >
                    {t.nombre}
                  </button>

                </td>

                <td className="border p-2 text-center">
                  {t.comunidades}
                </td>

                <td className="border p-2 text-center">
                  {t.participantes}
                </td>

                <td className="border p-2 text-center">

                  {t.planificacion
                    ? "✔"
                    : "Pendiente"}

                </td>

                <td className="border p-2 text-center">

                  {t.seguimiento
                    ? "✔"
                    : "Pendiente"}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}

function KPI({ titulo, valor, color }: any) {

  const colores: any = {

    blue: "text-blue-600",

    green: "text-green-600",

    purple: "text-purple-600",

    orange: "text-orange-600",

    red: "text-red-600"

  };

  return (

    <div className="bg-white p-4 rounded shadow">

      <p className="text-gray-500">
        {titulo}
      </p>

      <h2 className={`text-2xl font-bold ${colores[color]}`}>
        {valor}
      </h2>

    </div>

  );

}
