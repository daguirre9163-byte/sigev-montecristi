import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getParticipantesByTecnico(uid: string) {
  const q = query(
    collection(db, "participantes"),
    where("tecnicoId", "==", uid),
    where("estado", "==", "activo")
  );

  const snapshot = await getDocs(q);

  return snapshot.size;
}
