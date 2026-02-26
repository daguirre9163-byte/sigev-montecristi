"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc
} from "firebase/firestore";

import { getComunidadesByTecnico } from "@/lib/getComunidadesByTecnico";

export default function ParticipantesPage() {

  const { user } = useAuth();

  const [comunidades, setComunidades] = useState<any[]>([]);
  const [participantes, setParticipantes] = useState<any[]>([]);

  const [filtroComunidad, setFiltroComunidad] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    edad: "",
    genero: "",
    familiaPlan: "",
    inclusion: ""
  });

  // =========================
  // CARGAR COMUNIDADES
  // =========================
  useEffect(() => {

    if (!user) return;

    async function cargarComunidades() {
      const data =
        await getComunidadesByTecnico(user.uid);
      setComunidades(data);
    }

    cargarComunidades();

  }, [user]);

  // =========================
  // CARGAR PARTICIPANTES
  // =========================
  useEffect(() => {

    if (!user || !filtroComunidad) return;

    cargarParticipantes();

  }, [user, filtroComunidad]);

  async function cargarParticipantes() {

    const q = query(
      collection(db, "participantes"),
      where("tecnicoId", "==", user.uid),
      where("estado", "==", "activo"),
      where("comunidadId", "==", filtroComunidad)
    );

    const snap = await getDocs(q);

    const lista: any[] = [];

    snap.forEach(doc =>
      lista.push({ id: doc.id, ...doc.data() })
    );

    setParticipantes(lista);

  }

  // =========================
  // GUARDAR
  // =========================
  async function guardarParticipante() {

    if (!user || !filtroComunidad) {
      alert("Seleccione una comunidad");
      return;
    }

    if (!form.nombres || !form.apellidos) {
      alert("Complete los campos obligatorios");
      return;
    }

    const data = {
      ...form,
      edad: Number(form.edad),
      comunidadId: filtroComunidad,
      tecnicoId: user.uid,
      estado: "activo",
      fechaRegistro: new Date()
    };

    if (editandoId) {

      await updateDoc(
        doc(db, "participantes", editandoId),
        data
      );

      alert("Participante actualizado");

    } else {

      await addDoc(collection(db, "participantes"), data);

      alert("Participante creado");

    }

    limpiarFormulario();
    cargarParticipantes();

  }

  // =========================
  // EDITAR
  // =========================
  function editarParticipante(p: any) {

    setEditandoId(p.id);

    setForm({
      nombres: p.nombres,
      apellidos: p.apellidos,
      edad: p.edad,
      genero: p.genero,
      familiaPlan: p.familiaPlan,
      inclusion: p.inclusion
    });

  }

  // =========================
  // ELIMINAR
  // =========================
  async function eliminarParticipante(id: string) {

    if (!confirm("¿Eliminar participante?")) return;

    await updateDoc(
      doc(db, "participantes", id),
      { estado: "inactivo" }
    );

    cargarParticipantes();

  }

  function limpiarFormulario() {

    setEditandoId(null);

    setForm({
      nombres: "",
      apellidos: "",
      edad: "",
      genero: "",
      familiaPlan: "",
      inclusion: ""
    });

  }

  // =========================
  // FILTRO DE BUSQUEDA
  // =========================
  const participantesFiltrados = participantes.filter(p =>
    `${p.nombres} ${p.apellidos}`
      .toLowerCase()
      .includes(busqueda.toLowerCase())
  );

  // =========================
  // INDICADORES
  // =========================
  const total = participantesFiltrados.length;
  const hombres = participantesFiltrados.filter(p => p.genero === "M").length;
  const mujeres = participantesFiltrados.filter(p => p.genero === "F").length;

  return (

    <div className="space-y-6">

      <h1 className="text-2xl font-bold text-gray-800">
        Participantes
      </h1>

      {/* ================= COMUNIDAD ================= */}

      <div className="bg-white p-4 rounded-xl shadow">

        <label className="font-semibold block mb-2">
          Seleccione comunidad
        </label>

        <select
          value={filtroComunidad}
          onChange={e => setFiltroComunidad(e.target.value)}
          className="border p-2 rounded w-full"
        >
          <option value="">Seleccione...</option>

          {comunidades.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}

        </select>

      </div>

      {/* ================= INDICADORES ================= */}

      {filtroComunidad && (

        <div className="grid grid-cols-3 gap-4">

          <div className="bg-green-100 p-4 rounded-xl text-center">
            <p>Total</p>
            <p className="text-2xl font-bold">{total}</p>
          </div>

          <div className="bg-blue-100 p-4 rounded-xl text-center">
            <p>Hombres</p>
            <p className="text-2xl font-bold">{hombres}</p>
          </div>

          <div className="bg-pink-100 p-4 rounded-xl text-center">
            <p>Mujeres</p>
            <p className="text-2xl font-bold">{mujeres}</p>
          </div>

        </div>

      )}

      {/* ================= FORMULARIO ================= */}

      {filtroComunidad && (

        <div className="bg-white p-6 rounded-xl shadow space-y-4">

          <h2 className="font-semibold">
            {editandoId ? "Editar participante" : "Nuevo participante"}
          </h2>

          <input
            placeholder="Nombres"
            value={form.nombres}
            className="border p-2 w-full rounded"
            onChange={e =>
              setForm({ ...form, nombres: e.target.value })
            }
          />

          <input
            placeholder="Apellidos"
            value={form.apellidos}
            className="border p-2 w-full rounded"
            onChange={e =>
              setForm({ ...form, apellidos: e.target.value })
            }
          />

          <input
            type="number"
            placeholder="Edad"
            value={form.edad}
            className="border p-2 w-full rounded"
            onChange={e =>
              setForm({ ...form, edad: e.target.value })
            }
          />

          <select
            value={form.genero}
            className="border p-2 w-full rounded"
            onChange={e =>
              setForm({ ...form, genero: e.target.value })
            }
          >
            <option value="">Genero</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
            <option value="O">Otro</option>
          </select>

          {/* FAMILIA PLAN */}
          <select
            value={form.familiaPlan}
            className="border p-2 w-full rounded"
            onChange={e =>
              setForm({ ...form, familiaPlan: e.target.value })
            }
          >
            <option value="">Familia afiliada a PLAN</option>
            <option value="SI">SI</option>
            <option value="NO">NO</option>
          </select>

          {/* INCLUSION */}
          <select
            value={form.inclusion}
            className="border p-2 w-full rounded"
            onChange={e =>
              setForm({ ...form, inclusion: e.target.value })
            }
          >
            <option value="">Inclusión</option>
            <option value="Mz">Mestizo/a</option>
            <option value="I">Indígena</option>
            <option value="A">Afro</option>
            <option value="Mn">Montubio/a</option>
            <option value="O">Otro</option>
          </select>

          <button
            onClick={guardarParticipante}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            {editandoId ? "Actualizar" : "Guardar"}
          </button>

        </div>

      )}

      {/* ================= BUSQUEDA ================= */}

      {filtroComunidad && (

        <input
          placeholder="Buscar participante..."
          className="border p-2 w-full rounded"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />

      )}

      {/* ================= TABLA ================= */}

      {filtroComunidad && (

        <div className="bg-white p-6 rounded-xl shadow">

          <table className="w-full border">

            <thead className="bg-green-600 text-white">

              <tr>
                <th className="p-2">Nombre</th>
                <th className="p-2">Edad</th>
                <th className="p-2">Genero</th>
                <th className="p-2">Plan</th>
                <th className="p-2">Inclusión</th>
                <th className="p-2">Acciones</th>
              </tr>

            </thead>

            <tbody>

              {participantesFiltrados.map(p => (

                <tr key={p.id} className="border-b">

                  <td className="p-2">
                    {p.nombres} {p.apellidos}
                  </td>

                  <td className="p-2">{p.edad}</td>
                  <td className="p-2">{p.genero}</td>
                  <td className="p-2">{p.familiaPlan}</td>
                  <td className="p-2">{p.inclusion}</td>

                  <td className="p-2 flex gap-2">

                    <button
                      onClick={() => editarParticipante(p)}
                      className="bg-blue-600 text-white px-2 py-1 rounded"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => eliminarParticipante(p.id)}
                      className="bg-red-600 text-white px-2 py-1 rounded"
                    >
                      Eliminar
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      )}

    </div>

  );

}