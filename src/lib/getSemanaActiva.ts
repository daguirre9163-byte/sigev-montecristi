import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getSemanaActiva() {

  const q = query(
    collection(db, "semanas"),
    where("activa", "==", true) // ✅ CORREGIDO
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];

  return {
    id: doc.id,
    ...doc.data()
  };

}