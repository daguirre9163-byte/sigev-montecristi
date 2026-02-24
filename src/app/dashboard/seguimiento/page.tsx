"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";

import { db, storage } from "@/lib/firebase";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  addDoc,
  updateDoc,
  doc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";


export default function SeguimientoPage() {

  const { user } = useAuth();

  const [semanaActiva, setSemanaActiva] = useState<any>(null);

  const [planificacion, setPlanificacion] = useState<any>(null);

  const [registros, setRegistros] = useState<any[]>([]);

  const [bloqueado, setBloqueado] = useState(false);

  const [estadoSeguimiento, setEstadoSeguimiento]
    = useState<"borrador" | "enviado">("borrador");

  const [participantesPorRegistro, setParticipantesPorRegistro]
    = useState<{ [key: number]: any[] }>({});

  const [seguimientoId, setSeguimientoId]
    = useState<string | null>(null);


  //---------------------------------------------------
  // LOAD DATA
  //---------------------------------------------------

  useEffect(() => {

    if (!user) return;

    loadData();

  }, [user]);


  async function loadData() {

    if (!user) return;

    const semana = await getSemanaActiva();

    if (!semana) return;

    setSemanaActiva(semana);

    //---------------------------------------
    // cargar planificación enviada
    //---------------------------------------

    const q = query(
      collection(db, "planificaciones"),
      where("semanaId", "==", semana.id),
      where("tecnicoId", "==", user.uid),
      where("estado", "==", "enviado")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const plan = snapshot.docs[0].data();

    setPlanificacion(plan);

    //---------------------------------------
    // buscar seguimiento existente
    //---------------------------------------

    const segQuery = query(
      collection(db, "seguimientos"),
      where("semanaId", "==", semana.id),
      where("tecnicoId", "==", user.uid)
    );

    const segSnap = await getDocs(segQuery);

    if (!segSnap.empty) {

      const segDoc = segSnap.docs[0];

      const segData = segDoc.data();

      setSeguimientoId(segDoc.id);

      setRegistros(segData.registros || []);

      setEstadoSeguimiento(segData.estado);

      if (segData.estado === "enviado") {

        setBloqueado(true);

      }

    }
    else {

      const registrosBase =
        plan.actividades.map((act: any) => ({

          comunidadId: act.comunidadId,

          comunidadNombre: act.comunidadNombre,

          actividadPlanificada: act.actividad,

          actividadRealizada: "",

          asistentesIds: [],

          porcentajeAsistencia: 0,

          evidenciasFotos: [],

          evidenciaListaPdf: ""

        }));

      setRegistros(registrosBase);

    }

  }


  //---------------------------------------------------
  // STORAGE
  //---------------------------------------------------

  async function subirArchivo(file: File, ruta: string) {

    const storageRef = ref(storage, ruta);

    await uploadBytes(storageRef, file);

    return await getDownloadURL(storageRef);

  }


  async function subirFoto(e: any, index: number) {

    if (!user || bloqueado) return;

    const file = e.target.files[0];

    if (!file) return;

    const ruta =
      `seguimientos/${user.uid}/fotos/${Date.now()}_${file.name}`;

    const url = await subirArchivo(file, ruta);

    const nuevos = [...registros];

    nuevos[index].evidenciasFotos.push(url);

    setRegistros(nuevos);

  }


  async function eliminarFoto(index: number, fotoIndex: number) {

    if (bloqueado) return;

    const nuevos = [...registros];

    const url = nuevos[index].evidenciasFotos[fotoIndex];

    try {

      const storageRef = ref(storage, url);

      await deleteObject(storageRef);

    } catch {}

    nuevos[index].evidenciasFotos.splice(fotoIndex, 1);

    setRegistros(nuevos);

  }


  async function subirPDF(e: any, index: number) {

    if (!user || bloqueado) return;

    const file = e.target.files[0];

    if (!file) return;

    const ruta =
      `seguimientos/${user.uid}/listas/${Date.now()}_${file.name}`;

    const url = await subirArchivo(file, ruta);

    const nuevos = [...registros];

    nuevos[index].evidenciaListaPdf = url;

    setRegistros(nuevos);

  }


  function eliminarPDF(index: number) {

    if (bloqueado) return;

    const nuevos = [...registros];

    nuevos[index].evidenciaListaPdf = "";

    setRegistros(nuevos);

  }


  //---------------------------------------------------
  // GUARDAR
  //---------------------------------------------------

  async function guardarSeguimiento(
    estado: "borrador" | "enviado"
  ) {

    if (!user || !semanaActiva) return;

    if (estado === "enviado") {

      const confirmar =
        confirm("¿Seguro que desea enviar el seguimiento?");

      if (!confirmar) return;

    }

    const data = {

      semanaId: semanaActiva.id,

      tecnicoId: user.uid,

      registros,

      estado,

      fechaActualizacion: new Date()

    };

    if (seguimientoId) {

      await updateDoc(
        doc(db, "seguimientos", seguimientoId),
        data
      );

    }
    else {

      const docRef =
        await addDoc(collection(db, "seguimientos"), data);

      setSeguimientoId(docRef.id);

    }

    setEstadoSeguimiento(estado);

    if (estado === "enviado") {

      setBloqueado(true);

    }

    alert(
      estado === "enviado"
        ? "Seguimiento enviado correctamente"
        : "Seguimiento guardado como borrador"
    );

  }


  //---------------------------------------------------
  // PARTICIPANTES
  //---------------------------------------------------

  async function cargarParticipantes(
    comunidadId: string,
    regIndex: number
  ) {

    const q = query(
      collection(db, "participantes"),
      where("comunidadId", "==", comunidadId),
      where("estado", "==", "activo")
    );

    const snapshot = await getDocs(q);

    const lista: any[] = [];

    snapshot.forEach(doc =>
      lista.push({
        id: doc.id,
        ...doc.data()
      })
    );

    setParticipantesPorRegistro(prev => ({
      ...prev,
      [regIndex]: lista
    }));

  }


  //---------------------------------------------------
  // ASISTENCIA
  //---------------------------------------------------

  function toggleAsistencia(
    regIndex: number,
    participanteId: string
  ) {

    if (bloqueado) return;

    const nuevos = [...registros];

    const asistentes =
      nuevos[regIndex].asistentesIds;

    if (asistentes.includes(participanteId)) {

      nuevos[regIndex].asistentesIds =
        asistentes.filter(
          (id: string) =>
            id !== participanteId
        );

    }
    else {

      nuevos[regIndex]
        .asistentesIds
        .push(participanteId);

    }

    const total =
      participantesPorRegistro[regIndex]?.length || 0;

    const count =
      nuevos[regIndex].asistentesIds.length;

    nuevos[regIndex].porcentajeAsistencia =
      total > 0
        ? Math.round((count / total) * 100)
        : 0;

    setRegistros(nuevos);

  }


  //---------------------------------------------------
  // PDF
  //---------------------------------------------------

  function generarPDFSeguimiento() {

    const docPDF = new jsPDF();

    docPDF.text("Seguimiento Semanal", 14, 20);

    const tableData =
      registros.map((reg, i) => [

        i + 1,

        reg.comunidadNombre,

        reg.actividadRealizada ||
        reg.actividadPlanificada,

        reg.porcentajeAsistencia + "%"

      ]);

    autoTable(docPDF, {

      head: [[
        "N°",
        "Comunidad",
        "Actividad",
        "% Asistencia"
      ]],

      body: tableData

    });

    docPDF.save(
      `Seguimiento_${semanaActiva.fechaInicio}.pdf`
    );

  }


  //---------------------------------------------------
  // UI COMPLETA
  //---------------------------------------------------

  if (!semanaActiva)
    return <p>No hay semana activa.</p>;

  if (!planificacion)
    return <p>No existe planificación enviada.</p>;


  return (

  <div className="space-y-6">

    <div className="flex justify-between items-center">

      <h1 className="text-2xl font-bold text-gray-800">
        Seguimiento Semanal
      </h1>

      <span className={`px-3 py-1 rounded text-white ${
        estadoSeguimiento === "enviado"
          ? "bg-green-600"
          : "bg-yellow-500"
      }`}>
        {estadoSeguimiento}
      </span>

    </div>


    {registros.map((reg, index) => (

      <div
        key={index}
        className="bg-white rounded-lg shadow p-6 space-y-4 border"
      >

        <h2 className="text-lg font-semibold text-green-700">
          📍 Comunidad: {reg.comunidadNombre}
        </h2>

        <p>
          <strong>Actividad planificada:</strong>{" "}
          {reg.actividadPlanificada}
        </p>


        <input
          disabled={bloqueado}
          type="text"
          value={reg.actividadRealizada}
          onChange={(e) => {

            const nuevos = [...registros];

            nuevos[index].actividadRealizada =
              e.target.value;

            setRegistros(nuevos);

          }}
          className="w-full border rounded px-3 py-2"
        />


        <button
          disabled={bloqueado}
          onClick={() =>
            cargarParticipantes(reg.comunidadId, index)
          }
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          👥 Cargar participantes
        </button>


        {participantesPorRegistro[index]?.length > 0 && (

          <>
            <table className="min-w-full border">

              <thead>

                <tr>

                  <th className="border p-2">Nombre</th>

                  <th className="border p-2">Edad</th>

                  <th className="border p-2">Sexo</th>

                  <th className="border p-2">Asistencia</th>

                </tr>

              </thead>

              <tbody>

                {participantesPorRegistro[index].map(p => (

                  <tr key={p.id}>

                    <td className="border p-2">
                      {p.nombres} {p.apellidos}
                    </td>

                    <td className="border p-2">
                      {p.edad}
                    </td>

                    <td className="border p-2">
                      {p.sexo}
                    </td>

                    <td className="border p-2">

                      <input
                        disabled={bloqueado}
                        type="checkbox"
                        checked={
                          reg.asistentesIds.includes(p.id)
                        }
                        onChange={() =>
                          toggleAsistencia(index, p.id)
                        }
                      />

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>


            <p className="font-bold">
              Asistencia: {reg.porcentajeAsistencia}%
            </p>


            {/* FOTOS */}

<div className="mt-4">

  <label className="block font-medium text-gray-700 mb-2">
    📷 Evidencias fotográficas
  </label>

  {!bloqueado && (

    <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded shadow cursor-pointer transition">

      📷 Subir foto

      <input
        type="file"
        accept="image/*"
        onChange={(e) => subirFoto(e, index)}
        className="hidden"
      />

    </label>

  )}

  <div className="flex gap-3 mt-3 flex-wrap">

    {reg.evidenciasFotos?.map((url: string, i: number) => (

      <div
        key={i}
        className="relative group"
      >

        <img
          src={url}
          className="w-24 h-24 object-cover rounded border shadow"
        />

        {!bloqueado && (

          <button
            onClick={() => eliminarFoto(index, i)}
            className="absolute top-1 right-1 bg-red-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
          >
            ✕
          </button>

        )}

      </div>

    ))}

  </div>

</div>


            {/* PDF */}

<div className="mt-4">

  <label className="block font-medium text-gray-700 mb-2">
    📄 Lista de asistencia PDF
  </label>

  {!bloqueado && (

    <label className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded shadow cursor-pointer transition">

      📄 Subir PDF

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => subirPDF(e, index)}
        className="hidden"
      />

    </label>

  )}

  {reg.evidenciaListaPdf && (

    <div className="flex items-center gap-3 mt-3">

      <a
        href={reg.evidenciaListaPdf}
        target="_blank"
        className="text-purple-700 font-medium hover:underline"
      >
        📄 Ver PDF
      </a>

      {!bloqueado && (

        <button
          onClick={() => eliminarPDF(index)}
          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded shadow text-sm"
        >
          Eliminar
        </button>

      )}

    </div>

  )}

</div>


            {/* BOTONES */}

            {!bloqueado && (

              <div className="flex gap-3">

                <button
                  onClick={() =>
                    guardarSeguimiento("borrador")
                  }
                  className="bg-gray-600 text-white px-4 py-2 rounded"
                >
                  Guardar borrador
                </button>

                <button
                  onClick={() =>
                    guardarSeguimiento("enviado")
                  }
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Enviar
                </button>

              </div>

            )}

            <button
              onClick={generarPDFSeguimiento}
              className="bg-blue-700 text-white px-4 py-2 rounded"
            >
              Descargar PDF
            </button>

          </>

        )}

      </div>

    ))}

  </div>

  );

}