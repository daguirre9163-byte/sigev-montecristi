"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import { useRouter } from "next/navigation";


// ✅ TIPOS
type Semana = {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  limitePlanificacion: string;
  limiteSeguimiento: string;
  activa: boolean;
};

type Comunidad = {
  id: string;
  nombre: string;
};


// ✅ FUNCION validar fecha
function isPastDeadline(fecha: string) {

  const hoy = new Date();
  const limite = new Date(fecha);

  hoy.setHours(0,0,0,0);
  limite.setHours(0,0,0,0);

  return hoy > limite;

}


export default function DashboardTecnico() {

  const { user } = useAuth();
  const router = useRouter();

  const [semana, setSemana] = useState<Semana | null>(null);
  const [comunidades, setComunidades] = useState<Comunidad[]>([]);

  const [planEnviada, setPlanEnviada] = useState(false);
  const [segEnviado, setSegEnviado] = useState(false);

  const [loading, setLoading] = useState(true);


  //---------------------------------------------------
  // CARGAR DATOS
  //---------------------------------------------------

  useEffect(() => {

    if (!user) return;

    cargarDatos();

  }, [user]);


  async function cargarDatos() {

    try {

      if (!user) return;

      setLoading(true);

      //---------------------------------------
      // semana activa
      //---------------------------------------

      const semanaActiva = await getSemanaActiva();

      setSemana(semanaActiva as Semana);


      //---------------------------------------
      // comunidades del tecnico
      //---------------------------------------

      const comunidadesSnap = await getDocs(
        query(
          collection(db, "comunidades"),
          where("tecnicoId", "==", user.uid)
        )
      );

      const listaComunidades: Comunidad[] = [];

      comunidadesSnap.forEach(doc => {

        listaComunidades.push({
          id: doc.id,
          ...(doc.data() as any)
        });

      });

      setComunidades(listaComunidades);


      //---------------------------------------
      // verificar planificacion
      //---------------------------------------

      if (semanaActiva) {

        const planSnap = await getDocs(
          query(
            collection(db, "planificaciones"),
            where("tecnicoId", "==", user.uid),
            where("semanaId", "==", semanaActiva.id),
            where("estado", "==", "enviado")
          )
        );

        setPlanEnviada(!planSnap.empty);


        //---------------------------------------
        // verificar seguimiento
        //---------------------------------------

        const segSnap = await getDocs(
          query(
            collection(db, "seguimientos"),
            where("tecnicoId", "==", user.uid),
            where("semanaId", "==", semanaActiva.id),
            where("estado", "==", "enviado")
          )
        );

        setSegEnviado(!segSnap.empty);

      }

    }
    catch(error) {

      console.error(error);

    }

    setLoading(false);

  }


  //---------------------------------------------------
  // ESTADOS
  //---------------------------------------------------

  const planVencido =
    !planEnviada &&
    semana?.limitePlanificacion &&
    isPastDeadline(semana.limitePlanificacion);

  const segVencido =
    !segEnviado &&
    semana?.limiteSeguimiento &&
    isPastDeadline(semana.limiteSeguimiento);


  //---------------------------------------------------
  // UI
  //---------------------------------------------------

  if (loading)
    return (
      <div className="p-6">
        Cargando dashboard técnico...
      </div>
    );


  return (

    <div className="p-6 space-y-6">


      <h1 className="text-2xl font-bold">
        Dashboard Técnico
      </h1>


      {/* SEMANA */}

      {semana ? (

        <div className="bg-white p-4 rounded shadow">

          <p>
            <strong>Semana activa:</strong>
            {" "}
            {semana.fechaInicio}
            {" "}
            al
            {" "}
            {semana.fechaFin}
          </p>

        </div>

      ) : (

        <div className="bg-red-100 p-4 rounded">

          No hay semana activa

        </div>

      )}


      {/* KPI */}

      <div className="grid grid-cols-3 gap-4">

        <KPI
          titulo="Comunidades"
          valor={comunidades.length}
        />

        <KPI
          titulo="Planificación"
          valor={
            planEnviada
              ? "Enviado"
              : planVencido
              ? "Vencido"
              : "Pendiente"
          }
        />

        <KPI
          titulo="Seguimiento"
          valor={
            segEnviado
              ? "Enviado"
              : segVencido
              ? "Vencido"
              : "Pendiente"
          }
        />

      </div>


      {/* ACCIONES */}

      <div className="flex gap-4">

        <button
          onClick={() =>
            router.push("/dashboard/planificacion")
          }
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Planificación
        </button>


        <button
          onClick={() =>
            router.push("/dashboard/seguimiento")
          }
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Seguimiento
        </button>

      </div>


    </div>

  );

}


//---------------------------------------------------
// COMPONENTE KPI
//---------------------------------------------------

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