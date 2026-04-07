"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserRole } from "@/hooks/useUserRole";
import { Menu, X, LogOut, Home, Users, BarChart3, Calendar, FileText, Globe } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const role = useUserRole();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        role={role}
        onLogout={handleLogout}
      />

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col">
        {/* HEADER MÓVIL */}
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

        {/* MAIN CONTENT */}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>

      {/* OVERLAY MÓVIL */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

// COMPONENTE SIDEBAR
interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  role: string | null;
  onLogout: () => void;
}

function Sidebar({ sidebarOpen, setSidebarOpen, role, onLogout }: SidebarProps) {
  return (
    <aside
      className={`
        fixed md:static z-40 top-0 left-0 h-full w-64
        bg-gradient-to-b from-[#003D5C] to-[#002D44] text-white
        flex flex-col shadow-lg
        transform transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
    >
      {/* HEADER SIDEBAR */}
      <div className="p-6 border-b border-blue-400 border-opacity-30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">SIGEV</h1>
            <p className="text-xs text-blue-200 mt-1">GAD Montecristi</p>
          </div>
          <button
            className="md:hidden hover:bg-blue-700 p-1 rounded transition"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* NAVEGACIÓN */}
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* CONTROL GENERAL */}
        {(role === "admin" || role === "directora") && (
          <MenuSection title="CONTROL GENERAL">
            <MenuItem
              href={`/dashboard/${role}`}
              icon={<Home size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Dashboard
            </MenuItem>

            {role === "admin" && (
              <MenuItem
                href="/dashboard/semanas"
                icon={<Calendar size={18} />}
                onClick={() => setSidebarOpen(false)}
              >
                Gestión de Semanas
              </MenuItem>
            )}

            <MenuItem
              href="/dashboard/reportesinstitucionales"
              icon={<FileText size={18} />}
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
              icon={<Users size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Técnicos / Usuarios
            </MenuItem>

            <MenuItem
              href="/dashboard/admin/comunidades"
              icon={<Globe size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Comunidades
            </MenuItem>

            <MenuItem
              href="/dashboard/admin/eventos-globales"
              icon={<Calendar size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Eventos Globales
            </MenuItem>
          </MenuSection>
        )}

        {/* MI OPERACIÓN */}
        {(role === "admin" || role === "tecnico") && (
          <MenuSection title="MI OPERACIÓN">
            <MenuItem
              href="/dashboard/tecnico"
              icon={<BarChart3 size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Dashboard Técnico
            </MenuItem>

            <MenuItem
              href="/dashboard/participantes"
              icon={<Users size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Participantes
            </MenuItem>

            <MenuItem
              href="/dashboard/planificacion"
              icon={<FileText size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Planificación
            </MenuItem>

            <MenuItem
              href="/dashboard/seguimiento"
              icon={<BarChart3 size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Seguimiento
            </MenuItem>

            <MenuItem
              href="/dashboard/reportes"
              icon={<FileText size={18} />}
              onClick={() => setSidebarOpen(false)}
            >
              Mis Reportes
            </MenuItem>
          </MenuSection>
        )}
      </nav>

      {/* LOGOUT */}
      <div className="p-4 border-t border-blue-400 border-opacity-30">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition font-medium"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}

// COMPONENTE HEADER MÓVIL
interface MobileHeaderProps {
  onMenuClick: () => void;
}

function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="bg-white shadow-md p-4 md:hidden sticky top-0 z-20">
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-gray-100 rounded-lg transition"
        aria-label="Abrir menú"
      >
        <Menu size={28} className="text-gray-700" />
      </button>
    </header>
  );
}

// COMPONENTE SECCIÓN DE MENÚ
interface MenuSectionProps {
  title: string;
  children: React.ReactNode;
}

function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <div>
      <p className="text-blue-200 text-xs uppercase mb-3 tracking-wider font-semibold opacity-80">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// COMPONENTE ITEM DE MENÚ
interface MenuItemProps {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}

function MenuItem({ href, icon, children, onClick }: MenuItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg text-white hover:bg-blue-600 transition-colors duration-200 group"
    >
      {icon && <span className="opacity-80 group-hover:opacity-100">{icon}</span>}
      <span className="text-sm font-medium">{children}</span>
    </Link>
  );
}