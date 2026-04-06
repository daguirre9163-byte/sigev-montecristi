"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

// ============ TIPOS ============
interface Evento {
  id: string;
  titulo: string;
  fecha: string;
  horario: string;
  lugar: string;
  objetivo: string;
  tipoEvento: string;
  [key: string]: any;
}

interface Alerta {
  id: string;
  tecnicoId: string;
  eventoId: string;
  tipo: "reunion" | "actividad";
  [key: string]: any;
}

// ============ ESTADOS ============
type EstadoPage = "cargando" | "confirmando" | "confirmado" | "error";

// ============ COMPONENTE ============
export default function ConfirmarAsistenciaPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const eventoId = params.id as string;
  const tecnicoId = searchParams.get("tecnico");

  // ESTADOS
  const [evento, setEvento] = useState<Evento | null>(null);
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [estado, setEstado] = useState<EstadoPage>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string>("");

  // ============ CARGAR DATOS ============
  useEffect(() => {
    cargarDatos();
  }, [eventoId, tecnicoId]);

  async function cargarDatos() {
    try {
      setEstado("cargando");
      setError(null);

      // Validar parámetros
      if (!eventoId || !tecnicoId) {
        throw new Error("Parámetros faltantes en la URL");
      }

      // 1. Cargar evento
      const eventoDoc = await getDoc(doc(db, "eventosGlobales", eventoId));

      if (!eventoDoc.exists()) {
        throw new Error("Evento no encontrado");
      }

      const eventoData = {
        id: eventoDoc.id,
        ...eventoDoc.data(),
      } as Evento;

      setEvento(eventoData);

      // 2. Cargar alerta del técnico para este evento
      const alertasRef = collection(db, "alertas");
      const q = query(
        alertasRef,
        where("eventoId", "==", eventoId),
        where("tecnicoId", "==", tecnicoId)
      );

      const alertasSnap = await getDocs(q);

      if (alertasSnap.empty) {
        throw new Error("Alerta no encontrada");
      }

      const alertaData = {
        id: alertasSnap.docs[0].id,
        ...alertasSnap.docs[0].data(),
      } as Alerta;

      setAlerta(alertaData);

      // Verificar si ya fue confirmada
      if (alertaData.confirmada === true) {
        setEstado("confirmado");
        setMensajeExito("Tu asistencia ya había sido confirmada anteriormente");
      } else {
        setEstado("cargando");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar los datos"
      );
      setEstado("error");
    }
  }

  // ============ CONFIRMAR ASISTENCIA ============
  async function confirmarAsistencia() {
    if (!alerta) return;

    try {
      setEstado("confirmando");
      setError(null);

      // Actualizar alerta en Firestore
      await updateDoc(doc(db, "alertas", alerta.id), {
        confirmada: true,
        estado: "confirmado",
        confirmedAt: new Date(),
      });

      setEstado("confirmado");
      setMensajeExito("✅ Tu asistencia ha sido confirmada correctamente");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al confirmar asistencia"
      );
      setEstado("error");
    }
  }

  // ============ RENDER: Cargando ============
  if (estado === "cargando") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="animate-spin text-5xl">⏳</div>
          <p className="text-gray-600 font-medium">Cargando evento...</p>
        </div>
      </div>
    );
  }

  // ============ RENDER: Error ============
  if (estado === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-5xl">❌</div>
          <h1 className="text-2xl font-bold text-red-800">Error</h1>
          <p className="text-red-600 text-lg">{error}</p>
          <a
            href="/dashboard"
            className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition"
          >
            ← Volver al Dashboard
          </a>
        </div>
      </div>
    );
  }

  // ============ RENDER: Confirmado ============
  if (estado === "confirmado") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="text-center space-y-6 max-w-md bg-white rounded-lg shadow-xl p-8">
          <div className="text-6xl animate-bounce">✅</div>
          <h1 className="text-3xl font-bold text-green-700">¡Confirmado!</h1>
          <p className="text-green-600 text-lg">{mensajeExito}</p>

          {evento && (
            <div className="bg-green-50 rounded-lg p-4 text-left space-y-2">
              <p className="font-semibold text-gray-900">{evento.titulo}</p>
              <p className="text-sm text-gray-600">
                📅 {new Date(evento.fecha).toLocaleDateString("es-ES", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="text-sm text-gray-600">🕐 {evento.horario}</p>
            </div>
          )}

          <a
            href="/dashboard"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            ← Volver al Dashboard
          </a>
        </div>
      </div>
    );
  }

  // ============ RENDER: Confirmando ============
  if (estado === "confirmando") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="animate-spin text-5xl">⏳</div>
          <p className="text-gray-600 font-medium">Confirmando asistencia...</p>
        </div>
      </div>
    );
  }

  // ============ RENDER: Formulario de confirmación ============
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl">📋</div>
          <h1 className="text-2xl font-bold text-gray-900">
            Confirmar Asistencia
          </h1>
          <p className="text-gray-600">
            Por favor, confirma tu asistencia al evento
          </p>
        </div>

        {/* Detalles del evento */}
        {evento && (
          <div className="bg-blue-50 rounded-lg p-4 space-y-3 border-l-4 border-blue-500">
            <div>
              <p className="text-gray-600 text-sm font-semibold">Evento</p>
              <p className="text-gray-900 font-bold text-lg">{evento.titulo}</p>
            </div>

            <div>
              <p className="text-gray-600 text-sm font-semibold">📅 Fecha</p>
              <p className="text-gray-900">
                {new Date(evento.fecha).toLocaleDateString("es-ES", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            <div>
              <p className="text-gray-600 text-sm font-semibold">🕐 Horario</p>
              <p className="text-gray-900">{evento.horario}</p>
            </div>

            {evento.lugar && (
              <div>
                <p className="text-gray-600 text-sm font-semibold">📍 Lugar</p>
                <p className="text-gray-900">{evento.lugar}</p>
              </div>
            )}

            {evento.objetivo && (
              <div>
                <p className="text-gray-600 text-sm font-semibold">🎯 Objetivo</p>
                <p className="text-gray-900 text-sm">{evento.objetivo}</p>
              </div>
            )}
          </div>
        )}

        {/* Botones */}
        <div className="space-y-3">
          <button
            onClick={confirmarAsistencia}
            disabled={estado === "confirmando"}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition text-lg"
          >
            {estado === "confirmando"
              ? "⏳ Confirmando..."
              : "✓ Confirmar Asistencia"}
          </button>

          <a
            href="/dashboard"
            className="block w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition text-center"
          >
            ← Volver al Dashboard
          </a>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-500 text-center">
          Esta es una confirmación automática. Si tienes dudas, contacta al
          coordinador.
        </p>
      </div>
    </div>
  );
}