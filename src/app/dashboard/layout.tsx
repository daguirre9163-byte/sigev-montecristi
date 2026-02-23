"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserRole } from "@/hooks/useUserRole";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  const { user, loading } = useAuth();

  const router = useRouter();

  const role = useUserRole();

  useEffect(() => {

    if (!loading && !user) {

      router.push("/login");

    }

  }, [user, loading, router]);

  const handleLogout = async () => {

    await signOut(auth);

    router.push("/login");

  };

  if (loading) return <div className="p-6">Cargando...</div>;

  return (

    <div className="flex min-h-screen bg-gray-100">

      {/* SIDEBAR */}

      <aside className="hidden md:flex flex-col w-64 bg-green-700 text-white">

        <div className="p-6 text-xl font-bold border-b border-green-600">
          SIG 
          "Montecristi Crece en Valores"
        </div>

        <nav className="flex-1 p-4 space-y-6">

          {/* CONTROL GENERAL */}

          {(role === "admin" || role === "directora") && (

            <MenuSection title="CONTROL GENERAL">

              <MenuItem href={`/dashboard/${role}`}>
                Dashboard
              </MenuItem>

              {role === "admin" && (

                <MenuItem href="/dashboard/semanas">
                  Gestión de Semanas
                </MenuItem>

              )}

              <MenuItem href="/dashboard/reportesinstitucionales">
                Reportes Institucionales
              </MenuItem>

            </MenuSection>

          )}

          {/* GESTIÓN DE EQUIPO */}

          {role === "admin" && (

            <MenuSection title="GESTIÓN DE EQUIPO">

              <MenuItem href="/dashboard/usuarios">
                Técnicos / Usuarios
              </MenuItem>

              <MenuItem href="/dashboard/admin/comunidades">
                Comunidades
              </MenuItem>

            </MenuSection>

          )}

          {/* MI OPERACIÓN */}

          {(role === "admin" || role === "tecnico") && (

            <MenuSection title="MI OPERACIÓN">

              {role === "admin" && (

                <MenuItem href="/dashboard/tecnico">
                  Dashboard Técnico
                </MenuItem>

              )}

              <MenuItem href="/dashboard/participantes">
                Participantes
              </MenuItem>

              <MenuItem href="/dashboard/planificacion">
                Planificación
              </MenuItem>

              <MenuItem href="/dashboard/seguimiento">
                Seguimiento
              </MenuItem>

              <MenuItem href="/dashboard/reportes">
                Mis Reportes
              </MenuItem>

            </MenuSection>

          )}

        </nav>

        {/* LOGOUT */}

        <div className="p-4 border-t border-green-600">

          <button
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 p-2 rounded"
          >
            Cerrar Sesión
          </button>

        </div>

      </aside>

      {/* CONTENIDO */}

      <main className="flex-1 p-6">

        {children}

      </main>

    </div>

  );

}

/* COMPONENTES AUXILIARES */

function MenuSection({
  title,
  children
}: any) {

  return (

    <div>

      <p className="text-green-200 text-xs uppercase mb-2 tracking-wider">

        {title}

      </p>

      <div className="space-y-1">

        {children}

      </div>

    </div>

  );

}

function MenuItem({
  href,
  children
}: any) {

  return (

    <Link
      href={href}
      className="block p-2 rounded hover:bg-green-600 transition"
    >
      {children}
    </Link>

  );

}