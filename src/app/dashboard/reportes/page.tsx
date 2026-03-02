"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
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

  const [reporteComunidades, setReporteComunidades] = useState<any[]>([]);

  // 👉 NUEVO: asistencia semanal por actividad
  const [asistenciaSemanal, setAsistenciaSemanal] = useState<any[]>([]);

  // 👉 NUEVO: tabla tipo Excel por comunidad
  const [comunidades, setComunidades] = useState<any[]>([]);
  const [comunidadSeleccionada, setComunidadSeleccionada] = useState("");
  const [tablaAsistencia, setTablaAsistencia] = useState<any[]>([]);
  const [fechas, setFechas] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  //---------------------------------------------------
  // LOAD DATA
  //---------------------------------------------------

  useEffect(() => {
    if (!user) return;
    cargarReporte();
  }, [user]);

  async function cargarReporte() {
    setLoading(true);

    const semanaActiva = await getSemanaActiva();

    if (!semanaActiva) {
      setLoading(false);
      return;
    }

    setSemana(semanaActiva);

    //------------------------------------------------
    // SEGUIMIENTOS
    //------------------------------------------------

    const segQuery = query(
      collection(db, "seguimientos"),
      where("tecnicoId", "==", user.uid),
      where("semanaId", "==", semanaActiva.id),
      where("estado", "==", "enviado")
    );

    const segSnap = await getDocs(segQuery);

    let actividades = 0;
    let asistentes = 0;
    let porcentajeTotal = 0;
    let porcentajeCount = 0;

    const asistenciaTemp: any[] = [];

    for (const docSeg of segSnap.docs) {
      const data = docSeg.data();

      if (!data.registros) continue;

      for (const r of data.registros) {
        actividades++;

        const asistentesIds = r.asistentesIds || [];
        asistentes += asistentesIds.length;

        porcentajeTotal += r.porcentajeAsistencia || 0;
        porcentajeCount++;

        // 👉 OBTENER NOMBRES DESDE PARTICIPANTES
        const nombres: string[] = [];

        for (const id of asistentesIds) {
          const partRef = doc(db, "participantes", id);
          const partSnap = await getDoc(partRef);

          if (partSnap.exists()) {
            const p = partSnap.data();
            nombres.push(p.nombres || p.nombre || "Sin nombre");
          }
        }

        asistenciaTemp.push({
          comunidad: r.comunidadNombre || "Sin comunidad",
          fecha: r.fecha || "—",
          asistentes: nombres
        });
      }
    }

    setAsistenciaSemanal(asistenciaTemp);

    setTotalActividades(actividades);
    setTotalAsistentes(asistentes);

    setPromedioAsistencia(
      porcentajeCount > 0
        ? Math.round(porcentajeTotal / porcentajeCount)
        : 0
    );

    //------------------------------------------------
    // REPORTE COMUNIDADES (EXISTENTE)
    //------------------------------------------------

    const comunidadesData = await getComunidadesByTecnico(user.uid);

    comunidadesData.sort((a, b) => a.nombre.localeCompare(b.nombre));

    setComunidades(comunidadesData);

    const reporte = [];

    for (const comunidad of comunidadesData) {
      const partQuery = query(
        collection(db, "participantes"),
        where("comunidadId", "==", comunidad.id),
        where("estado", "==", "activo")
      );

      const partSnap = await getDocs(partQuery);

      reporte.push({
        comunidad: comunidad.nombre,
        participantes: partSnap.size
      });
    }

    setReporteComunidades(reporte);

    setLoading(false);
  }

  //---------------------------------------------------
  // 👉 GENERAR TABLA ASISTENCIA POR COMUNIDAD
  //---------------------------------------------------

  async function generarTablaAsistencia(comunidadId: string) {
    if (!semana) return;

    // PARTICIPANTES DE LA COMUNIDAD
    const partQuery = query(
      collection(db, "participantes"),
      where("comunidadId", "==", comunidadId),
      where("estado", "==", "activo")
    );

    const partSnap = await getDocs(partQuery);

    const participantes = partSnap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));

    // SEGUIMIENTOS DE LA SEMANA (FILTRADO POR COMUNIDAD)
    const segQuery = query(
      collection(db, "seguimientos"),
      where("semanaId", "==", semana.id),
      where("estado", "==", "enviado")
    );

    const segSnap = await getDocs(segQuery);

    const registros: any[] = [];

    segSnap.forEach((d) => {
      const data = d.data();

      if (data.registros) {
        const filtrados = data.registros.filter(
          (r: any) =>
            r.comunidadId === comunidadId ||
            r.comunidadNombre ===
              comunidades.find((c) => c.id === comunidadId)?.nombre
        );

        registros.push(...filtrados);
      }
    });

    // FECHAS ÚNICAS SOLO DE ESA COMUNIDAD
    const fechasUnicas = [
      ...new Set(
        registros
          .map((r) => r.fecha)
          .filter((f) => f) // evita undefined
      )
    ].sort();

    setFechas(fechasUnicas as string[]);

    // CONSTRUIR TABLA
    const tabla = participantes.map((p: any, index: number) => {
      const fila: any = {
        numero: index + 1,
        nombres: p.nombres,
        apellidos: p.apellidos,
        edad: p.edad,
        genero: p.genero
      };

      fechasUnicas.forEach((fecha: any) => {
        const registroFecha = registros.find((r) => r.fecha === fecha);

        if (
          registroFecha &&
          registroFecha.asistentesIds?.includes(p.id)
        ) {
          fila[fecha] = 1;
        } else {
          fila[fecha] = "";
        }
      });

      return fila;
    });

    setTablaAsistencia(tabla);
  }

  //---------------------------------------------------
  // EXPORTAR RESUMEN (EXISTENTE)
  //---------------------------------------------------

  function exportarExcel() {
    if (reporteComunidades.length === 0) {
      alert("No hay datos");
      return;
    }

    const datos = reporteComunidades.map((r) => ({
      Comunidad: r.comunidad,
      Participantes: r.participantes
    }));

    const worksheet = XLSX.utils.json_to_sheet(datos);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array"
    });

    const file = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    saveAs(
      file,
      `Resumen_${semana.fechaInicio}_${semana.fechaFin}.xlsx`
    );
  }

  //---------------------------------------------------
  // UI
  //---------------------------------------------------

  if (loading) return <p>Cargando reportes...</p>;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Reportes Semanales</h1>
          <p className="text-gray-600">
            Semana: {semana?.fechaInicio} al {semana?.fechaFin}
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
          <p className="text-gray-500">Actividades</p>
          <h2 className="text-3xl font-bold text-blue-600">
            {totalActividades}
          </h2>
        </div>

        <div className="bg-white p-4 rounded-xl shadow border">
          <p className="text-gray-500">Total asistentes</p>
          <h2 className="text-3xl font-bold text-green-600">
            {totalAsistentes}
          </h2>
        </div>

        <div className="bg-white p-4 rounded-xl shadow border">
          <p className="text-gray-500">Promedio asistencia</p>
          <h2 className="text-3xl font-bold text-purple-600">
            {promedioAsistencia}%
          </h2>
        </div>
      </div>

      {/* TABLA EXISTENTE */}
      <div className="bg-white p-6 rounded-xl shadow border">
        <h2 className="font-semibold mb-4">Participantes por comunidad</h2>

        <table className="w-full">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Comunidad</th>
              <th className="p-2 text-center">Participantes</th>
            </tr>
          </thead>

          <tbody>
            {reporteComunidades.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.comunidad}</td>
                <td className="p-2 text-center font-semibold">
                  {r.participantes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 👉 NUEVO: SELECTOR DE COMUNIDAD */}
      <div className="bg-white p-6 rounded-xl shadow border">
        <h2 className="font-semibold mb-4">Lista de asistencia por comunidad</h2>

        <select
          value={comunidadSeleccionada}
          onChange={(e) => {
            const id = e.target.value;
            setComunidadSeleccionada(id);
            if (id) generarTablaAsistencia(id);
          }}
          className="border p-2 rounded"
        >
          <option value="">Seleccionar comunidad</option>

          {comunidades.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        {/* TABLA TIPO EXCEL */}
        {tablaAsistencia.length > 0 && (
          <div className="mt-6 overflow-auto">
            <table className="min-w-full border">
              <thead className="bg-gray-100">
                <tr>
                  <th>N°</th>
                  <th>Nombres</th>
                  <th>Apellidos</th>
                  <th>Edad</th>
                  <th>Género</th>

                  {fechas.map((f) => (
                    <th key={f}>{f}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {tablaAsistencia.map((fila, i) => (
                  <tr key={i} className="border-t">
                    <td>{fila.numero}</td>
                    <td>{fila.nombres}</td>
                    <td>{fila.apellidos}</td>
                    <td>{fila.edad}</td>
                    <td>{fila.genero}</td>

                    {fechas.map((f) => (
                      <td key={f} className="text-center font-bold">
                        {fila[f]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
