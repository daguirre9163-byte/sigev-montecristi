import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function checkPlanificacionEnviada(
  semanaId: string,
  tecnicoId: string
) {
  const q = query(
    collection(db, "planificaciones"),
    where("semanaId", "==", semanaId),
    where("tecnicoId", "==", tecnicoId),
    where("estado", "==", "enviado")
  );

  const snapshot = await getDocs(q);

  return !snapshot.empty; // true si ya envió
}
