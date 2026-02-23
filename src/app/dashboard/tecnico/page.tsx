"use client";

import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useEffect, useState } from "react";

import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";
import { getParticipantesByTecnico } from "@/lib/getParticipantesByTecnico";
import { getSemanaActiva } from "@/lib/getSemanaActiva";
import { checkPlanificacionEnviada } from "@/lib/checkPlanificacionEnviada";
import { checkSeguimientoEnviado } from "@/lib/checkSeguimientoEnviado";

export default function TecnicoDashboard() {

  const { user } = useAuth();
  const role = useUserRole();

  const [loading, setLoading] = useState(true);

  const [comunidades, setComunidades] = useState<any[]>([]);
  const [totalParticipantes, setTotalParticipantes] = useState(0);

  const [semanaActiva, setSemanaActiva] = useState<any>(null);

  const [planificacionEnviada, setPlanificacionEnviada] = useState(false);
  const [seguimientoEnviado, setSeguimientoEnviado] = useState(false);

  const [planificacionVencida, setPlanificacionVencida] = useState(false);
  const [seguimientoVencido, setSeguimientoVencido] = useState(false);

  //---------------------------------------------------
  // Verificar si fecha venció
  //---------------------------------------------------

  function isPastDeadline(deadline: any) {

    if (!deadline) return false;

    try {

      const limitDate =
        typeof deadline.toDate === "function"
          ? deadline.toDate()
          : new Date(deadline);

      const now = new Date();

      return now > limitDate;

    } catch {

      return false;

    }

  }

  //---------------------------------------------------
  // Cargar datos
  //---------------------------------------------------

  useEffect(() => {

    if (!user) return;

    async function cargarDatos() {

      try {

        setLoading(true);

        //---------------------------------------------------
        // Comunidades
        //---------------------------------------------------
        if (!user)return;

        const comunidadesData =
          await getComunidadesByTecnico(user.uid);

        setComunidades(comunidadesData || []);

        //---------------------------------------------------
        // Participantes
        //---------------------------------------------------

        const total =
          await getParticipantesByTecnico(user.uid);

        setTotalParticipantes(total || 0);

        //---------------------------------------------------
        // Semana activa
        //---------------------------------------------------

        const semana =
          await getSemanaActiva();

        setSemanaActiva(semana);

        if (semana) {

          //---------------------------------------------------
          // Planificación enviada
          //---------------------------------------------------

          const planEnviada =
            await checkPlanificacionEnviada(
              semana.id,
              user.uid
            );

          setPlanificacionEnviada(planEnviada);

          //---------------------------------------------------
          // Seguimiento enviado
          //---------------------------------------------------

          const segEnviado =
            await checkSeguimientoEnviado(
              semana.id,
              user.uid
            );

          setSeguimientoEnviado(segEnviado);

          //---------------------------------------------------
          // Verificar vencimientos
          //---------------------------------------------------

          const planVencido =
            !planEnviada &&
            isPastDeadline(
              semana.limitePlanificacion
            );

          const segVencido =
            !segEnviado &&
            isPastDeadline(
              semana.limiteSeguimiento
            );

          setPlanificacionVencida(planVencido);

          setSeguimientoVencido(segVencido);

        }

      } catch (error) {

        console.error("Error cargando dashboard:", error);

      } finally {

        setLoading(false);

      }

    }

    cargarDatos();

  }, [user]);

  //---------------------------------------------------
  // UI estados
  //---------------------------------------------------

  function getEstadoCard(enviado: boolean, vencido: boolean) {

    if (enviado)
      return {
        texto: "✔ Enviado",
        color: "text-green-600",
        fondo: "bg-green-50 border-green-200"
      };

    if (vencido)
      return {
        texto: "⚠ Fuera de plazo",
        color: "text-red-700",
        fondo: "bg-red-100 border-red-300"
      };

    return {
      texto: "Pendiente",
      color: "text-yellow-600",
      fondo: "bg-yellow-50 border-yellow-200"
    };

  }

  const estadoPlan =
    getEstadoCard(
      planificacionEnviada,
      planificacionVencida
    );

  const estadoSeg =
    getEstadoCard(
      seguimientoEnviado,
      seguimientoVencido
    );

  //---------------------------------------------------
  // Loading
  //---------------------------------------------------

  if (loading) {

    return (
      <div className="p-6">
        <p className="text-gray-600">
          Cargando dashboard...
        </p>
      </div>
    );

  }

  //---------------------------------------------------
  // UI principal
  //---------------------------------------------------

  return (

    <div className="space-y-6">

      {/* TITULO */}

      <div>

        <h1 className="text-2xl font-bold text-gray-800">
          Dashboard Técnico
        </h1>

        <p className="text-gray-500 text-sm">
          Bienvenido {user?.email}
        </p>

      </div>

      {/* SEMANA ACTIVA */}

      {semanaActiva && (

        <div className="bg-green-50 border border-green-200 p-4 rounded-xl shadow">

          <p className="text-sm text-green-700 font-medium">
            Semana Activa
          </p>

          <p className="font-semibold text-green-900">

            {semanaActiva.fechaInicio}
            {" "}al{" "}
            {semanaActiva.fechaFin}

          </p>

        </div>

      )}

      {/* KPI CARDS */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Participantes */}

        <div className="bg-white p-6 rounded-xl shadow">

          <p className="text-sm text-gray-500">
            Participantes Activos
          </p>

          <h2 className="text-3xl font-bold text-green-600 mt-2">
            {totalParticipantes}
          </h2>

        </div>

        {/* Comunidades */}

        <div className="bg-white p-6 rounded-xl shadow">

          <p className="text-sm text-gray-500">
            Comunidades Asignadas
          </p>

          <h2 className="text-3xl font-bold text-blue-600 mt-2">
            {comunidades.length}
          </h2>

        </div>

        {/* Planificación */}

        <div className={`p-6 rounded-xl shadow border ${estadoPlan.fondo}`}>

          <p className="text-sm text-gray-600">
            Planificación
          </p>

          <h2 className={`text-2xl font-bold mt-2 ${estadoPlan.color}`}>
            {estadoPlan.texto}
          </h2>

        </div>

        {/* Seguimiento */}

        <div className={`p-6 rounded-xl shadow border ${estadoSeg.fondo}`}>

          <p className="text-sm text-gray-600">
            Seguimiento
          </p>

          <h2 className={`text-2xl font-bold mt-2 ${estadoSeg.color}`}>
            {estadoSeg.texto}
          </h2>

        </div>

      </div>

      {/* SECCIÓN INFERIOR */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white p-6 rounded-xl shadow">

          <h3 className="text-lg font-semibold mb-4">
            Resumen Semanal
          </h3>

          <p className="text-gray-600 text-sm">
            Aquí se mostrará el resumen automático
            basado en planificación y seguimiento.
          </p>

        </div>

        <div className="bg-white p-6 rounded-xl shadow">

          <h3 className="text-lg font-semibold mb-4">
            Alertas
          </h3>

          {!planificacionEnviada && (

            <p className="text-yellow-700 text-sm">
              ⚠ Planificación pendiente
            </p>

          )}

          {!seguimientoEnviado && (

            <p className="text-yellow-700 text-sm">
              ⚠ Seguimiento pendiente
            </p>

          )}

        </div>

      </div>

    </div>

  );

}