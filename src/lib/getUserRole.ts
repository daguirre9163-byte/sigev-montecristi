import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getUserRole(uid: string) {
  const docRef = doc(db, "usuarios", uid);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().rol;
  } else {
    return null;
  }
}
