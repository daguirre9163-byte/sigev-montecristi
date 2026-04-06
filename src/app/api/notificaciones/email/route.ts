import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/firebase";
import { getDocs, collection } from "firebase/firestore";

// ============ INICIALIZAR RESEND ============
const resend = new Resend(process.env.NEXT_PUBLIC_RESEND_API_KEY);

// ============ TIPOS ============
interface EventoGlobal {
  id?: string;
  titulo: string;
  tipoEvento: "tecnicos" | "clubes" | "promotores" | "liderazgo";
  lugar: string;
  fecha: string;
  horario: string;
  objetivo: string;
  producto: string;
  tecnicosIds: string[];
  comunidadesData?: Array<{
    comunidadId: string;
    comunidadNombre: string;
    participantesIds: string[];
  }>;
  createdAt?: any;
  createdBy?: string;
}

interface Tecnico {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

// ============ FUNCIONES AUXILIARES ============

/**
 * Obtener detalles de técnicos desde Firestore
 */
async function obtenerTecnicos(tecnicosIds: string[]): Promise<Tecnico[]> {
  try {
    const tecnicosSnap = await getDocs(collection(db, "usuarios"));
    return tecnicosSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Tecnico))
      .filter((t) => tecnicosIds.includes(t.id));
  } catch (error) {
    console.error("❌ Error al obtener técnicos:", error);
    return [];
  }
}

/**
 * Generar template HTML para email de reunión de técnicos
 */
function generarEmailReunion(evento: EventoGlobal, tecnico: Tecnico): string {
  const enlaceConfirmacion = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/alertas/${evento.id}?tecnico=${tecnico.id}`;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #f9fafb;
          border-radius: 12px;
          padding: 32px;
          border: 1px solid #e5e7eb;
        }
        .header {
          border-bottom: 3px solid #2563eb;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }
        .header h1 {
          margin: 0;
          color: #1f2937;
          font-size: 24px;
        }
        .badge {
          display: inline-block;
          background: #dbeafe;
          color: #1e40af;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 10px;
        }
        .evento-detalles {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .detalle-row {
          display: flex;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .detalle-row:last-child {
          border-bottom: none;
        }
        .detalle-label {
          font-weight: 600;
          color: #6b7280;
          width: 120px;
          min-width: 120px;
        }
        .detalle-valor {
          color: #1f2937;
        }
        .objetivo-section {
          background: #f0f9ff;
          border-left: 4px solid #0ea5e9;
          padding: 16px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .objetivo-section h3 {
          margin: 0 0 8px 0;
          color: #0369a1;
          font-size: 14px;
        }
        .objetivo-section p {
          margin: 0;
          color: #0c4a6e;
          font-size: 14px;
        }
        .btn-container {
          text-align: center;
          margin: 32px 0;
        }
        .btn {
          display: inline-block;
          background: #2563eb;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.3s;
        }
        .btn:hover {
          background: #1d4ed8;
        }
        .footer {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
        .footer p {
          margin: 8px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 Reunión de Técnicos</h1>
          <span class="badge">Acción requerida</span>
        </div>

        <p>Hola ${tecnico.nombre},</p>

        <p>Se ha programado una nueva reunión de técnicos. Por favor, confirma tu asistencia lo antes posible.</p>

        <div class="evento-detalles">
          <div class="detalle-row">
            <div class="detalle-label">📌 Evento:</div>
            <div class="detalle-valor"><strong>${evento.titulo}</strong></div>
          </div>
          <div class="detalle-row">
            <div class="detalle-label">📅 Fecha:</div>
            <div class="detalle-valor">${new Date(evento.fecha).toLocaleDateString(
              "es-ES",
              {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            )}</div>
          </div>
          <div class="detalle-row">
            <div class="detalle-label">🕐 Horario:</div>
            <div class="detalle-valor">${evento.horario}</div>
          </div>
          <div class="detalle-row">
            <div class="detalle-label">📍 Lugar:</div>
            <div class="detalle-valor">${evento.lugar || "Por confirmar"}</div>
          </div>
        </div>

        ${
          evento.objetivo
            ? `
          <div class="objetivo-section">
            <h3>🎯 Objetivo</h3>
            <p>${evento.objetivo}</p>
          </div>
        `
            : ""
        }

        <div class="btn-container">
          <a href="${enlaceConfirmacion}" class="btn">✓ Confirmar Asistencia</a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          O copia y pega este enlace en tu navegador:<br>
          <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; word-break: break-all;">${enlaceConfirmacion}</code>
        </p>

        <div class="footer">
          <p>Este es un mensaje automático del Sistema SIGEV</p>
          <p>Plan Internacional - Montecristi</p>
          <p>© ${new Date().getFullYear()} Todos los derechos reservados</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generar template HTML para email de actividad comunitaria
 */
function generarEmailActividad(evento: EventoGlobal, tecnico: Tecnico): string {
  const enlaceSeleccion = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/alertas/${evento.id}?tecnico=${tecnico.id}`;

  const comunidadesHtml = evento.comunidadesData
    ?.map(
      (c) => `
    <div style="padding: 8px 0; color: #1f2937;">
      • ${c.comunidadNombre}
    </div>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #f9fafb;
          border-radius: 12px;
          padding: 32px;
          border: 1px solid #e5e7eb;
        }
        .header {
          border-bottom: 3px solid #7c3aed;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }
        .header h1 {
          margin: 0;
          color: #1f2937;
          font-size: 24px;
        }
        .badge {
          display: inline-block;
          background: #ede9fe;
          color: #5b21b6;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 10px;
        }
        .evento-detalles {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .detalle-row {
          display: flex;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .detalle-row:last-child {
          border-bottom: none;
        }
        .detalle-label {
          font-weight: 600;
          color: #6b7280;
          width: 120px;
          min-width: 120px;
        }
        .detalle-valor {
          color: #1f2937;
        }
        .comunidades-list {
          background: #faf5ff;
          border-left: 4px solid #7c3aed;
          padding: 16px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .comunidades-list h3 {
          margin: 0 0 12px 0;
          color: #6d28d9;
          font-size: 14px;
        }
        .objetivo-section {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 16px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .objetivo-section h3 {
          margin: 0 0 8px 0;
          color: #b45309;
          font-size: 14px;
        }
        .objetivo-section p {
          margin: 0;
          color: #92400e;
          font-size: 14px;
        }
        .btn-container {
          text-align: center;
          margin: 32px 0;
        }
        .btn {
          display: inline-block;
          background: #7c3aed;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.3s;
        }
        .btn:hover {
          background: #6d28d9;
        }
        .footer {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
        .footer p {
          margin: 8px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏘️ Actividad Comunitaria</h1>
          <span class="badge">Requiere configuración</span>
        </div>

        <p>Hola ${tecnico.nombre},</p>

        <p>Se ha programado una actividad comunitaria. Por favor, selecciona las comunidades en las que participará tu equipo y los participantes específicos.</p>

        <div class="evento-detalles">
          <div class="detalle-row">
            <div class="detalle-label">📌 Evento:</div>
            <div class="detalle-valor"><strong>${evento.titulo}</strong></div>
          </div>
          <div class="detalle-row">
            <div class="detalle-label">📅 Fecha:</div>
            <div class="detalle-valor">${new Date(evento.fecha).toLocaleDateString(
              "es-ES",
              {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            )}</div>
          </div>
          <div class="detalle-row">
            <div class="detalle-label">🕐 Horario:</div>
            <div class="detalle-valor">${evento.horario}</div>
          </div>
          <div class="detalle-row">
            <div class="detalle-label">📍 Lugar:</div>
            <div class="detalle-valor">${evento.lugar || "Por confirmar"}</div>
          </div>
        </div>

        <div class="comunidades-list">
          <h3>🏘️ Comunidades Disponibles</h3>
          ${comunidadesHtml}
        </div>

        ${
          evento.objetivo
            ? `
          <div class="objetivo-section">
            <h3>🎯 Objetivo</h3>
            <p>${evento.objetivo}</p>
          </div>
        `
            : ""
        }

        <div class="btn-container">
          <a href="${enlaceSeleccion}" class="btn">⚙️ Configurar Participación</a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          O copia y pega este enlace en tu navegador:<br>
          <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; word-break: break-all;">${enlaceSeleccion}</code>
        </p>

        <div class="footer">
          <p>Este es un mensaje automático del Sistema SIGEV</p>
          <p>Plan Internacional - Montecristi</p>
          <p>© ${new Date().getFullYear()} Todos los derechos reservados</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ============ HANDLER POST ============
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { evento, tipo } = body as {
      evento: EventoGlobal;
      tipo: "reunion" | "actividad";
    };

    console.log(`📨 Procesando envío de emails para: ${evento.titulo}`);

    // Validar datos
    if (!evento || !tipo) {
      console.warn("⚠️ Datos incompletos");
      return NextResponse.json(
        { error: "Datos incompletos" },
        { status: 400 }
      );
    }

    if (!evento.tecnicosIds || evento.tecnicosIds.length === 0) {
      console.warn("⚠️ No hay técnicos especificados");
      return NextResponse.json(
        { error: "No hay técnicos especificados" },
        { status: 400 }
      );
    }

    // Obtener detalles de técnicos
    const tecnicos = await obtenerTecnicos(evento.tecnicosIds);

    if (tecnicos.length === 0) {
      console.warn("⚠️ No se encontraron técnicos");
      return NextResponse.json(
        { error: "No se encontraron técnicos" },
        { status: 404 }
      );
    }

    console.log(`📋 Técnicos encontrados: ${tecnicos.length}`);

    // Generar y enviar emails
    const resultados = await Promise.allSettled(
      tecnicos.map(async (tecnico) => {
        const html =
          tipo === "reunion"
            ? generarEmailReunion(evento, tecnico)
            : generarEmailActividad(evento, tecnico);

        console.log(`📧 Enviando email a: ${tecnico.email}`);

        return resend.emails.send({
          from: "SIGEV <noreply@sigev.vercel.app>",
          to: tecnico.email,
          subject:
            tipo === "reunion"
              ? `📋 ${evento.titulo} - Confirma tu asistencia`
              : `🏘️ ${evento.titulo} - Selecciona tu participación`,
          html,
          replyTo: "coordinador@sigev.vercel.app",
        });
      })
    );

    // Contar éxitos y errores
    const exitosos = resultados.filter(
      (r) => r.status === "fulfilled"
    ).length;
    const fallidos = resultados.filter((r) => r.status === "rejected").length;

    console.log(
      `✅ Proceso completado: ${exitosos} exitosos, ${fallidos} fallidos`
    );

    return NextResponse.json(
      {
        success: true,
        mensaje: `Se enviaron ${exitosos} notificaciones`,
        detalles: {
          total: tecnicos.length,
          exitosos,
          fallidos,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en endpoint de notificaciones:", error);

    return NextResponse.json(
      {
        error: "Error al procesar las notificaciones",
        detalles: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

// ============ HANDLER GET (info) ============
export async function GET() {
  return NextResponse.json(
    {
      mensaje: "✅ Endpoint de notificaciones de email funcionando",
      metodo: "POST",
      requiere: ["evento", "tipo"],
    },
    { status: 200 }
  );
}