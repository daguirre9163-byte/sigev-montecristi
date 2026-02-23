"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getUserRole } from "@/lib/getUserRole";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      getUserRole(user.uid).then((r) => setRole(r));
    }
  }, [user]);

  return role;
}
