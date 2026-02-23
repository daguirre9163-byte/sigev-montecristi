"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";

import { db } from "@/lib/firebase";

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function PlanificacionPage() {

  const { user } = useAuth();

  const [loading, setLoading] = useState(true);

  const [semanaActiva, setSemanaActiva] = useState<any>(null);

  const [comunidades, setComunidades] = useState<any[]>([]);

  const [objetivoSemana, setObjetivoSemana] = useState("");

  const [actividades, setActividades] = useState<any[]>([]);

  const [planId, setPlanId] = useState<string | null>(null);

  const [estado, setEstado] = useState("borrador");

  //---------------------------------------------------
  // CARGAR DATOS INICIALES
  //---------------------------------------------------

  useEffect(() => {

    if (!user) return;

    async function cargarDatos() {

      try {

        setLoading(true);

        const semana = await getSemanaActiva();

        if (!semana) {

          setLoading(false);
          return;

        }

        setSemanaActiva(semana);

        if (!user) return;

        const comunidadesData =
          await getComunidadesByTecnico(user.uid);

        setComunidades(comunidadesData);

        // Buscar planificación existente

        const q = query(
          collection(db, "planificaciones"),
          where("semanaId", "==", semana.id),
          where("tecnicoId", "==", user.uid)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {

          const docSnap = snapshot.docs[0];

          setPlanId(docSnap.id);

          const data = docSnap.data();

          setObjetivoSemana(data.objetivoSemana || "");

          setActividades(data.actividades || []);

          setEstado(data.estado || "borrador");

        }

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }

    }

    cargarDatos();

  }, [user]);

  //---------------------------------------------------
  // AGREGAR ACTIVIDAD
  //---------------------------------------------------

  function agregarActividad() {

    if (estado === "enviado") {

      alert("La planificación ya fue enviada");

      return;

    }

    setActividades([
      ...actividades,
      {
        comunidadId: "",
        comunidadNombre: "",
        componente: "",
        actividad: "",
        dia: "",
        horario: "",
        objetivoEspecifico: "",
        productoEsperado: "",
      }
    ]);

  }

  //---------------------------------------------------
  // ACTUALIZAR ACTIVIDAD
  //---------------------------------------------------

  function actualizarActividad(
    index: number,
    campo: string,
    valor: string
  ) {

    if (estado === "enviado") return;

    const nuevas = [...actividades];

    nuevas[index][campo] = valor;

    // si cambia comunidadId guardar también nombre
    if (campo === "comunidadId") {

      const comunidad =
        comunidades.find(c => c.id === valor);

      nuevas[index].comunidadNombre =
        comunidad?.nombre || "";

    }

    setActividades(nuevas);

  }

  //---------------------------------------------------
  // VALIDAR
  //---------------------------------------------------

  function validar() {

    if (!objetivoSemana) {

      alert("Ingrese el objetivo semanal");

      return false;

    }

    if (actividades.length === 0) {

      alert("Debe agregar al menos una actividad");

      return false;

    }

    return true;

  }

  //---------------------------------------------------
  // GUARDAR PLANIFICACION
  //---------------------------------------------------

  async function guardarPlanificacion(
    nuevoEstado: "borrador" | "enviado"
  ) {

    if (!user || !semanaActiva) return;

    if (!validar()) return;

    if (estado === "enviado") {

      alert("La planificación ya fue enviada");

      return;

    }

    const data = {

      semanaId: semanaActiva.id,

      tecnicoId: user.uid,

      tecnicoEmail: user.email,

      objetivoSemana,

      actividades,

      estado: nuevoEstado,

      fechaActualizacion: serverTimestamp(),

    };

    try {

      if (planId) {

        await updateDoc(
          doc(db, "planificaciones", planId),
          data
        );

      } else {

        const docRef =
          await addDoc(
            collection(db, "planificaciones"),
            data
          );

        setPlanId(docRef.id);

      }

      setEstado(nuevoEstado);

      alert(
        nuevoEstado === "enviado"
          ? "Planificación enviada correctamente"
          : "Borrador guardado"
      );

    } catch (error) {

      console.error(error);

      alert("Error al guardar");

    }

  }

  //---------------------------------------------------
  // GENERAR PDF
  //---------------------------------------------------

  function generarPDF() {

    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text(
      "PROYECTO MONTECRISTI CRECE EN VALORES",
      14,
      15
    );

    doc.setFontSize(11);

    doc.text(
      `Semana: ${semanaActiva.fechaInicio} al ${semanaActiva.fechaFin}`,
      14,
      25
    );

    doc.text(
      `Objetivo: ${objetivoSemana}`,
      14,
      35
    );

    const tableData = actividades.map((act, index) => [

      index + 1,

      act.comunidadNombre,

      act.componente,

      act.actividad,

      act.dia,

      act.horario,

      act.objetivoEspecifico,

      act.productoEsperado

    ]);

    autoTable(doc, {

      startY: 45,

      head: [[
        "N°",
        "Comunidad",
        "Componente",
        "Actividad",
        "Día",
        "Horario",
        "Objetivo específico",
        "Producto esperado"
      ]],

      body: tableData,

      styles: { fontSize: 8 }

    });

    doc.save(
      `Planificacion_${semanaActiva.fechaInicio}_${semanaActiva.fechaFin}.pdf`
    );

  }

  //---------------------------------------------------
  // UI
  //---------------------------------------------------

  if (loading)
    return <p>Cargando...</p>;

  if (!semanaActiva)
    return <p>No hay semana activa</p>;

  return (

    <div className="space-y-6">

      <h1 className="text-2xl font-bold">
        Planificación Semanal
      </h1>

      {/* ESTADO */}

      <div className={`p-4 rounded border ${
        estado === "enviado"
          ? "bg-green-100 border-green-400"
          : "bg-yellow-100 border-yellow-400"
      }`}>

        Estado:
        <strong>
          {" "}
          {estado === "enviado"
            ? "Enviado"
            : "Borrador"}
        </strong>

      </div>

      {/* OBJETIVO */}

      <div>

        <label className="font-semibold">
          Objetivo semanal
        </label>

        <textarea
          disabled={estado === "enviado"}
          className="w-full border p-3 rounded mt-1"
          value={objetivoSemana}
          onChange={(e) =>
            setObjetivoSemana(e.target.value)
          }
        />

      </div>

      {/* ACTIVIDADES */}

      <div className="space-y-4">

        <h2 className="font-semibold">
          Actividades
        </h2>

        {actividades.map((act, index) => (

          <div
            key={index}
            className="border p-4 rounded bg-gray-50 space-y-2"
          >

            <select
              disabled={estado === "enviado"}
              className="w-full border p-2 rounded"
              value={act.comunidadId}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "comunidadId",
                  e.target.value
                )
              }
            >

              <option value="">
                Seleccione comunidad
              </option>

              {comunidades.map(c => (

                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>

              ))}

            </select>

            <input
              disabled={estado === "enviado"}
              placeholder="Componente"
              className="w-full border p-2 rounded"
              value={act.componente}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "componente",
                  e.target.value
                )
              }
            />

            <input
              disabled={estado === "enviado"}
              placeholder="Actividad"
              className="w-full border p-2 rounded"
              value={act.actividad}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "actividad",
                  e.target.value
                )
              }
            />

            <input
              disabled={estado === "enviado"}
              placeholder="Día"
              className="w-full border p-2 rounded"
              value={act.dia}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "dia",
                  e.target.value
                )
              }
            />

            <input
              disabled={estado === "enviado"}
              placeholder="Horario"
              className="w-full border p-2 rounded"
              value={act.horario}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "horario",
                  e.target.value
                )
              }
            />

            <textarea
              disabled={estado === "enviado"}
              placeholder="Objetivo específico"
              className="w-full border p-2 rounded"
              value={act.objetivoEspecifico}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "objetivoEspecifico",
                  e.target.value
                )
              }
            />

            <textarea
              disabled={estado === "enviado"}
              placeholder="Producto esperado"
              className="w-full border p-2 rounded"
              value={act.productoEsperado}
              onChange={(e) =>
                actualizarActividad(
                  index,
                  "productoEsperado",
                  e.target.value
                )
              }
            />

          </div>

        ))}

      </div>

      {/* BOTONES */}

      <div className="flex gap-3">

        <button
          onClick={agregarActividad}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Agregar actividad
        </button>

        <button
          onClick={() =>
            guardarPlanificacion("borrador")
          }
          className="bg-gray-600 text-white px-4 py-2 rounded"
        >
          Guardar borrador
        </button>

        <button
          onClick={() =>
            guardarPlanificacion("enviado")
          }
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Enviar planificación
        </button>

        <button
          onClick={generarPDF}
          className="bg-purple-600 text-white px-4 py-2 rounded"
        >
          Descargar PDF
        </button>

      </div>

    </div>

  );

}