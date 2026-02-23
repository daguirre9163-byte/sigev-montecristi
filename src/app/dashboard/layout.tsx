"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserRole } from "@/hooks/useUserRole";
import { Menu, X } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  const { user, loading } = useAuth();
  const router = useRouter();
  const role = useUserRole();

  // ✅ estado sidebar móvil
  const [sidebarOpen, setSidebarOpen] = useState(false);


  useEffect(() => {

    if (!loading && !user) {

      router.push("/login");

    }

  }, [user, loading, router]);


  const handleLogout = async () => {

    await signOut(auth);

    router.push("/login");

  };


  if (loading)
    return <div className="p-6">Cargando...</div>;


  return (

    <div className="flex min-h-screen bg-gray-100">


      {/* SIDEBAR */}

      <aside
        className={`
          fixed z-40 top-0 left-0 h-full w-64 bg-green-700 text-white flex flex-col
          transform transition-transform duration-300

          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}

          md:translate-x-0 md:static
        `}
      >


        {/* HEADER SIDEBAR */}

        <div className="p-6 text-xl font-bold border-b border-green-600 flex justify-between items-center">

          SIGEV

          {/* botón cerrar en móvil */}
          <button
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>

        </div>


        {/* MENÚ */}

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">


          {/* CONTROL GENERAL */}

          {(role === "admin" || role === "directora") && (

            <MenuSection title="CONTROL GENERAL">

              <MenuItem
                href={`/dashboard/${role}`}
                onClick={() => setSidebarOpen(false)}
              >
                Dashboard
              </MenuItem>

              {role === "admin" && (

                <MenuItem
                  href="/dashboard/semanas"
                  onClick={() => setSidebarOpen(false)}
                >
                  Gestión de Semanas
                </MenuItem>

              )}

              <MenuItem
                href="/dashboard/reportesinstitucionales"
                onClick={() => setSidebarOpen(false)}
              >
                Reportes Institucionales
              </MenuItem>

            </MenuSection>

          )}


          {/* GESTIÓN DE EQUIPO */}

          {role === "admin" && (

            <MenuSection title="GESTIÓN DE EQUIPO">

              <MenuItem
                href="/dashboard/usuarios"
                onClick={() => setSidebarOpen(false)}
              >
                Técnicos / Usuarios
              </MenuItem>

              <MenuItem
                href="/dashboard/admin/comunidades"
                onClick={() => setSidebarOpen(false)}
              >
                Comunidades
              </MenuItem>

            </MenuSection>

          )}


          {/* MI OPERACIÓN */}

          {(role === "admin" || role === "tecnico") && (

            <MenuSection title="MI OPERACIÓN">


                <MenuItem
                  href="/dashboard/tecnico"
                  onClick={() => setSidebarOpen(false)}
                >
                  Dashboard Técnico
                </MenuItem>

            

              <MenuItem
                href="/dashboard/participantes"
                onClick={() => setSidebarOpen(false)}
              >
                Participantes
              </MenuItem>

              <MenuItem
                href="/dashboard/planificacion"
                onClick={() => setSidebarOpen(false)}
              >
                Planificación
              </MenuItem>

              <MenuItem
                href="/dashboard/seguimiento"
                onClick={() => setSidebarOpen(false)}
              >
                Seguimiento
              </MenuItem>

              <MenuItem
                href="/dashboard/reportes"
                onClick={() => setSidebarOpen(false)}
              >
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

      <div className="flex-1 flex flex-col">


        {/* HEADER MÓVIL */}

        <header className="bg-white shadow p-4 md:hidden">

          <button
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={28} />
          </button>

        </header>


        {/* MAIN */}

        <main className="flex-1 p-6">

          {children}

        </main>


      </div>


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
  children,
  onClick
}: any) {

  return (

    <Link
      href={href}
      onClick={onClick}
      className="block p-2 rounded hover:bg-green-600 transition"
    >
      {children}
    </Link>

  );

}