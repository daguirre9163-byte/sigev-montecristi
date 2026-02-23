import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getComunidadesByTecnico(uid: string) {
  const q = query(
    collection(db, "comunidades"),
    where("tecnicoId", "==", uid)
  );

  const querySnapshot = await getDocs(q);

  const comunidades: any[] = [];

  querySnapshot.forEach((doc) => {
    comunidades.push({ id: doc.id, ...doc.data() });
  });

  return comunidades;
}
