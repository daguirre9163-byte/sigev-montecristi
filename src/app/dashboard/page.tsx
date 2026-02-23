"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getUserRole } from "@/lib/getUserRole";

export default function TecnicoDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else {
        getUserRole(user.uid).then((role) => {
          if (role !== "tecnico") {
            router.push("/login");
          } else {
            setAuthorized(true);
          }
        });
      }
    }
  }, [user, loading, router]);

  if (loading || !authorized) {
    return <div className="p-6">Cargando...</div>;
  }

  return <div className="p-6">Tecnico Admin Seguro</div>;
}
