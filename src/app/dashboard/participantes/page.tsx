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

  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    familiaPlan: "",
    genero: "",
    edad: "",
    inclusion: "",
    comunidadId: ""
  });

  // CARGAR DATOS
useEffect(() => {

  if (!user) return;

  cargarDatos(filtroComunidad);

}, [user, filtroComunidad]);

async function cargarDatos(comunidadId?: string) {

  if (!user) return;

  const comunidadesData =
    await getComunidadesByTecnico(user.uid);

  setComunidades(comunidadesData);

  // CONSULTA BASE
  let q = query(
    collection(db, "participantes"),
    where("tecnicoId", "==", user.uid),
    where("estado", "==", "activo")
  );

  // FILTRO POR COMUNIDAD
  if (comunidadId) {
    q = query(
      collection(db, "participantes"),
      where("tecnicoId", "==", user.uid),
      where("estado", "==", "activo"),
      where("comunidadId", "==", comunidadId)
    );
  }

  const snap = await getDocs(q);

  const lista: any[] = [];

  snap.forEach(doc =>
    lista.push({ id: doc.id, ...doc.data() })
  );

  setParticipantes(lista);

}

  // GUARDAR PARTICIPANTE
  async function guardarParticipante() {

    if (!user) return;

    if (!form.nombres || !form.apellidos || !form.comunidadId) {
      alert("Complete los campos obligatorios");
      return;
    }

    if (editandoId) {

      await updateDoc(
        doc(db, "participantes", editandoId),
        {
          ...form,
          edad: Number(form.edad)
        }
      );

      alert("Participante actualizado");

    } else {

      await addDoc(collection(db, "participantes"), {

        ...form,

        edad: Number(form.edad),

        tecnicoId: user.uid,

        estado: "activo",

        fechaRegistro: new Date()

      });

      alert("Participante creado");

    }

    limpiarFormulario();

    cargarDatos();

  }

  // EDITAR
  function editarParticipante(p: any) {

    setEditandoId(p.id);

    setForm({
      nombres: p.nombres,
      apellidos: p.apellidos,
      familiaPlan: p.familiaPlan,
      genero: p.genero,
      edad: p.edad,
      inclusion: p.inclusion,
      comunidadId: p.comunidadId
    });

  }

  // ELIMINAR (borrado lógico)
  async function eliminarParticipante(id: string) {

    if (!confirm("¿Eliminar participante?")) return;

    await updateDoc(
      doc(db, "participantes", id),
      {
        estado: "inactivo"
      }
    );

    alert("Participante eliminado");

    cargarDatos();

  }

  function limpiarFormulario() {

    setEditandoId(null);

    setForm({
      nombres: "",
      apellidos: "",
      familiaPlan: "",
      genero: "",
      edad: "",
      inclusion: "",
      comunidadId: ""
    });

  }

  return (

    <div className="space-y-6">

      <h1 className="text-2xl font-bold text-gray-800">
        Gestión de Participantes
      </h1>

      {/* FORMULARIO */}
      <div className="bg-white p-6 rounded-xl shadow space-y-4">

        <h2 className="font-semibold">
          {editandoId
            ? "Editar participante"
            : "Nuevo participante"}
        </h2>

        <input
          value={form.nombres}
          placeholder="Nombres"
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              nombres: e.target.value
            })
          }
        />

        <input
          value={form.apellidos}
          placeholder="Apellidos"
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              apellidos: e.target.value
            })
          }
        />

        <select
          value={form.familiaPlan}
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              familiaPlan: e.target.value
            })
          }
        >
          <option value="">
            Familia afiliada a PLAN
          </option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <select
          value={form.genero}
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              genero: e.target.value
            })
          }
        >
          <option value="">Genero</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
          <option value="O">Otro</option>
        </select>

        <input
          value={form.edad}
          type="number"
          placeholder="Edad"
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              edad: e.target.value
            })
          }
        />

        <select
          value={form.inclusion}
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              inclusion: e.target.value
            })
          }
        >
          <option value="">Inclusión</option>
          <option value="Mz">Mestizo/a</option>
          <option value="I">Indígena</option>
          <option value="A">Afro</option>
          <option value="Mn">Montubio/a</option>
          <option value="O">Otro</option>
        </select>

        <select
          value={form.comunidadId}
          className="border p-2 w-full rounded"
          onChange={e =>
            setForm({
              ...form,
              comunidadId: e.target.value
            })
          }
        >
          <option value="">
            Seleccione comunidad
          </option>

          {comunidades.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <div className="flex gap-2">

          <button
            onClick={guardarParticipante}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            {editandoId
              ? "Actualizar"
              : "Guardar"}
          </button>

          {editandoId && (

            <button
              onClick={limpiarFormulario}
              className="bg-gray-500 text-white px-4 py-2 rounded"
            >
              Cancelar
            </button>

          )}

        </div>

      </div>

      {/* TABLA */}
      <div className="bg-white p-6 rounded-xl shadow">

        <h2 className="font-semibold mb-4">
          Lista de participantes
        </h2>

        {/* FILTRO POR COMUNIDAD */}
<div className="mb-4">

  <select
    value={filtroComunidad}
    className="border p-2 rounded"
    onChange={e =>
      setFiltroComunidad(e.target.value)
    }
  >
    <option value="">
      Todas las comunidades
    </option>

    {comunidades.map(c => (
      <option key={c.id} value={c.id}>
        {c.nombre}
      </option>
    ))}

  </select>

</div>

        <table className="w-full border">

          <thead className="bg-green-600 text-white">

            <tr>

              <th className="p-2">Nombre</th>
              <th className="p-2">Apellido</th>
              <th className="p-2">Edad</th>
              <th className="p-2">Genero</th>
              <th className="p-2">Inclusión</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Acciones</th>

            </tr>

          </thead>

          <tbody>

            {participantes.map(p => (

              <tr key={p.id} className="border-b">

                <td className="p-2">{p.nombres}</td>
                <td className="p-2">{p.apellidos}</td>
                <td className="p-2">{p.edad}</td>
                <td className="p-2">{p.genero}</td>
                <td className="p-2">{p.inclusion}</td>
                <td className="p-2">{p.familiaPlan}</td>

                <td className="p-2 flex gap-2">

                  <button
                    onClick={() =>
                      editarParticipante(p)
                    }
                    className="bg-blue-600 text-white px-2 py-1 rounded"
                  >
                    Editar
                  </button>

                  <button
                    onClick={() =>
                      eliminarParticipante(p.id)
                    }
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

    </div>

  );

}
