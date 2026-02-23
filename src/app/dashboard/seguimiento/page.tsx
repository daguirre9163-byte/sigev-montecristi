"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";

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
  getDocs
} from "firebase/firestore";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

export default function SeguimientoPage() {

  const { user } = useAuth();

  const [semanaActiva, setSemanaActiva] = useState<any>(null);
  const [planificacion, setPlanificacion] = useState<any>(null);
  const [registros, setRegistros] = useState<any[]>([]);
  const [participantesPorRegistro, setParticipantesPorRegistro] = useState<{ [key: number]: any[] }>({});
  const [seguimientoId, setSeguimientoId] = useState<string | null>(null);
  const [estadoSeguimiento, setEstadoSeguimiento] = useState("borrador");
  const [comunidades, setComunidades] = useState<any[]>([]);

  //----------------------------------------------------
  // LOAD DATA
  //----------------------------------------------------

  useEffect(() => {

    if (!user) return;

    async function loadData() {

      const semana = await getSemanaActiva();
      if (!semana) return;

      setSemanaActiva(semana);

        if (!user) return;


      const comunidadesData =
        await getComunidadesByTecnico(user.uid);

      setComunidades(comunidadesData);
        if (!user) return;


      const q = query(
        collection(db, "planificaciones"),
        where("semanaId", "==", semana.id),
        where("tecnicoId", "==", user.uid),
        where("estado", "==", "enviado")
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {

        const plan = snapshot.docs[0].data();

        setPlanificacion(plan);

        const registrosBase =
          plan.actividades.map((act: any, index: number) => ({

            planificada: true,
            planIndex: index,

            comunidadId: act.comunidadId,

            comunidadNombre:
              act.comunidadNombre ||
              comunidadesData.find(
                c => c.id === act.comunidadId
              )?.nombre ||
              "",

            componente: act.componente,
            actividadPlanificada: act.actividad,

            actividadRealizada: "",
            fecha: "",

            horario: act.horario || "",

            asistentesIds: [],
            porcentajeAsistencia: 0,

            resultadoObtenido: "",

            evidenciasFotos: [],
            evidenciaListaPdf: ""

          }));

        setRegistros(registrosBase);

      }

    }

    loadData();

  }, [user]);

  //----------------------------------------------------
  // SUBIR ARCHIVO
  //----------------------------------------------------

  async function subirArchivo(file: File, ruta: string) {

    const storageRef = ref(storage, ruta);

    await uploadBytes(storageRef, file);

    return await getDownloadURL(storageRef);

  }

  //----------------------------------------------------
  // FOTO
  //----------------------------------------------------

  async function subirFoto(e: any, index: number) {

    if (estadoSeguimiento === "enviado") return;

    const file = e.target.files[0];

    if (!file) return;
        if (!user) return;


    const url =
      await subirArchivo(
        file,
        `seguimientos/${user.uid}/fotos/${Date.now()}_${file.name}`
      );

    const nuevos = [...registros];

    nuevos[index].evidenciasFotos.push(url);

    setRegistros(nuevos);

  }

  //----------------------------------------------------
  // PDF
  //----------------------------------------------------

  async function subirPDF(e: any, index: number) {

    if (estadoSeguimiento === "enviado") return;

    const file = e.target.files[0];

    if (!file) return;
        if (!user) return;


    const url =
      await subirArchivo(
        file,
        `seguimientos/${user.uid}/listas/${Date.now()}_${file.name}`
      );

    const nuevos = [...registros];

    nuevos[index].evidenciaListaPdf = url;

    setRegistros(nuevos);

  }

  //----------------------------------------------------
  // GUARDAR
  //----------------------------------------------------

  async function guardarSeguimiento(estado: "borrador" | "enviado") {

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

    } else {

      const docRef =
        await addDoc(
          collection(db, "seguimientos"),
          data
        );

      setSeguimientoId(docRef.id);

    }

    setEstadoSeguimiento(estado);

    alert(
      estado === "enviado"
        ? "Seguimiento enviado correctamente"
        : "Seguimiento guardado"
    );

  }

  //----------------------------------------------------
  // PARTICIPANTES
  //----------------------------------------------------

  async function cargarParticipantes(comunidadId: string, index: number) {

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
      [index]: lista
    }));

  }

  //----------------------------------------------------
  // ASISTENCIA
  //----------------------------------------------------

  function toggleAsistencia(index: number, participanteId: string) {

    if (estadoSeguimiento === "enviado") return;

    const nuevos = [...registros];

    const asistentes =
      nuevos[index].asistentesIds;

    if (asistentes.includes(participanteId)) {

      nuevos[index].asistentesIds =
        asistentes.filter((id: string) => id !== participanteId);

    } else {

      nuevos[index].asistentesIds.push(participanteId);

    }

    const total =
      participantesPorRegistro[index]?.length || 0;

    const count =
      nuevos[index].asistentesIds.length;

    nuevos[index].porcentajeAsistencia =
      total > 0
        ? Math.round((count / total) * 100)
        : 0;

    setRegistros(nuevos);

  }

  //----------------------------------------------------
  // UI
  //----------------------------------------------------

  if (!semanaActiva)
    return <p>No hay semana activa</p>;

  if (!planificacion)
    return <p>No existe planificación enviada</p>;

  return (

    <div className="space-y-6">

      {/* ESTADO */}

      <div className={`p-4 rounded-lg border ${
        estadoSeguimiento === "enviado"
          ? "bg-green-100 border-green-400"
          : "bg-yellow-100 border-yellow-400"
      }`}>

        Estado:
        <strong className="ml-2">
          {estadoSeguimiento === "enviado"
            ? "Enviado"
            : "Borrador"}
        </strong>

      </div>

      {/* REGISTROS */}

      {registros.map((reg, index) => (

        <div
          key={index}
          className="bg-white p-6 rounded-xl shadow-md border space-y-4"
        >

          <div className="bg-blue-50 p-3 rounded-lg">

            <h2 className="font-semibold text-blue-900">

              📍 {
                reg.comunidadNombre ||
                comunidades.find(
                  c => c.id === reg.comunidadId
                )?.nombre ||
                reg.comunidadId
              }

            </h2>

          </div>

          <p>
            Actividad planificada:
            <strong>
              {" "}
              {reg.actividadPlanificada}
            </strong>
          </p>

          <input
            disabled={estadoSeguimiento === "enviado"}
            type="text"
            placeholder="Actividad realizada"
            className="w-full border p-2 rounded"
            value={reg.actividadRealizada}
            onChange={(e) => {

              const nuevos = [...registros];

              nuevos[index].actividadRealizada =
                e.target.value;

              setRegistros(nuevos);

            }}
          />

          <input
            disabled={estadoSeguimiento === "enviado"}
            type="date"
            className="border p-2 rounded"
            value={reg.fecha}
            onChange={(e) => {

              const nuevos = [...registros];

              nuevos[index].fecha =
                e.target.value;

              setRegistros(nuevos);

            }}
          />

          {/* barra asistencia */}

          <div>

            <div className="w-full bg-gray-200 rounded-full h-4">

              <div
                className="bg-green-600 h-4 rounded-full"
                style={{
                  width:
                    `${reg.porcentajeAsistencia}%`
                }}
              />

            </div>

            <p className="text-sm mt-1">
              {reg.porcentajeAsistencia}% asistencia
            </p>

          </div>

        </div>

      ))}

    </div>

  );

}