"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

import {
collection,
getDocs
} from "firebase/firestore";

import { useRouter } from "next/navigation";

export default function ReportesInstitucionales(){

const router = useRouter()

const [loading,setLoading] = useState(true)

const [usuarios,setUsuarios] = useState<any[]>([])
const [planes,setPlanes] = useState<any[]>([])
const [seguimientos,setSeguimientos] = useState<any[]>([])
const [semanas,setSemanas] = useState<any[]>([])

const [actividades,setActividades] = useState<any[]>([])
const [reporteComunidades,setReporteComunidades] = useState<any[]>([])

const [tecnicoFiltro,setTecnicoFiltro] = useState("todos")
const [comunidadFiltro,setComunidadFiltro] = useState("todas")
const [semanaFiltro,setSemanaFiltro] = useState("actual")

const [kpi,setKpi] = useState({
tecnicos:0,
comunidades:0,
asistentes:0,
actividades:0,
cumplidas:0,
pendientes:0,
asistenciaPromedio:0
})

/*--------------------------------------------------
CARGAR DATOS
--------------------------------------------------*/

useEffect(()=>{
cargar()
},[])

useEffect(()=>{
procesar()
},[
planes,
seguimientos,
semanaFiltro,
tecnicoFiltro,
comunidadFiltro
])

async function cargar(){

const [
usuariosSnap,
planesSnap,
segSnap,
semanasSnap
] = await Promise.all([

getDocs(collection(db,"usuarios")),
getDocs(collection(db,"planificaciones")),
getDocs(collection(db,"seguimientos")),
getDocs(collection(db,"semanas"))

])

setUsuarios(
usuariosSnap.docs.map(d=>({
id:d.id,
...d.data()
}))
)

setPlanes(
planesSnap.docs.map(d=>({
id:d.id,
...d.data()
}))
)

setSeguimientos(
segSnap.docs.map(d=>({
id:d.id,
...d.data()
}))
)

setSemanas(
semanasSnap.docs.map(d=>({
id:d.id,
...d.data()
}))
)

setLoading(false)
}

/*--------------------------------------------------
NOMBRE TECNICO
--------------------------------------------------*/

function nombreTecnico(id:string){

const tecnico =
usuarios.find(u=>u.id===id)

return tecnico?.nombre || tecnico?.email || "Tecnico"

}

/*-------------------------------------------------
BUSCAR SEGUIMIENTO
--------------------------------------------------*/

function buscarSeguimiento(
tecnicoId:string,
comunidad:string,
semanaId:string
){

const seg = seguimientos.find(
s =>
s.tecnicoId === tecnicoId &&
s.semanaId === semanaId
)

if(!seg) return null

const reg = seg.registros?.find(
(r:any)=> r.comunidadNombre === comunidad
)

return reg || null

}

/*--------------------------------------------------
PROCESAR DATOS
--------------------------------------------------*/

function procesar(){

let semanaActiva:any = null

if(semanaFiltro === "actual"){
semanaActiva =
semanas.find(s=>s.activa === true)
}

if(
semanaFiltro !== "actual" &&
semanaFiltro !== "historico"
){
semanaActiva =
semanas.find(s=>s.id === semanaFiltro)
}

let lista:any[] = []

planes.forEach(plan=>{

if(
semanaActiva &&
plan.semanaId !== semanaActiva.id
) return

if(!plan.actividades) return

plan.actividades.forEach((a:any)=>{

const seguimiento =
buscarSeguimiento(
plan.tecnicoId,
a.comunidadNombre,
plan.semanaId
)

const esSemanaActual =
semanaActiva &&
plan.semanaId === semanaActiva.id

lista.push({

tecnicoId:plan.tecnicoId,
tecnico:nombreTecnico(plan.tecnicoId),
comunidad:a.comunidadNombre,
actividad:a.actividad,
dia:a.dia,
horario:a.horario,

estado:
seguimiento
? "Cumplida"
: esSemanaActual
? "Programada"
: "Pendiente",

asistentes:
seguimiento
? seguimiento.asistentesIds?.length || 0
: 0,

porcentaje:
seguimiento
? seguimiento.porcentajeAsistencia || 0
: 0

})

})

})

/*--------------------------------------------------
FILTROS
--------------------------------------------------*/

if(tecnicoFiltro !== "todos"){
lista = lista.filter(
a=>a.tecnicoId === tecnicoFiltro
)
}

if(comunidadFiltro !== "todas"){
lista = lista.filter(
a=>a.comunidad === comunidadFiltro
)
}

/*--------------------------------------------------
ORDENAR
--------------------------------------------------*/

lista.sort((a,b)=>{

if(a.tecnico < b.tecnico) return -1
if(a.tecnico > b.tecnico) return 1

return a.dia.localeCompare(b.dia)

})

setActividades(lista)

calcularKPI(lista)
calcularReporteComunidades(lista)

}

/*--------------------------------------------------
CALCULAR KPI
--------------------------------------------------*/

function calcularKPI(lista:any[]){

const tecnicosUnicos =
new Set(lista.map(a=>a.tecnicoId))

const comunidadesUnicas =
new Set(lista.map(a=>a.comunidad))

let asistentesTotal = 0
let cumplidas = 0
let pendientes = 0
let sumaAsistencia = 0
let totalAsistencias = 0

lista.forEach(a=>{

asistentesTotal += a.asistentes

if(a.estado === "Cumplida"){
cumplidas++
sumaAsistencia += a.porcentaje
totalAsistencias++
}

if(a.estado === "Pendiente"){
pendientes++
}

})

const promedio =
totalAsistencias > 0
? Math.round(
sumaAsistencia / totalAsistencias
)
: 0

setKpi({

tecnicos:tecnicosUnicos.size,
comunidades:comunidadesUnicas.size,
asistentes:asistentesTotal,
actividades:lista.length,
cumplidas,
pendientes,
asistenciaPromedio:promedio

})

}

/*--------------------------------------------------
REPORTE COMUNIDAD
--------------------------------------------------*/

function calcularReporteComunidades(lista:any[]){

const mapa:any = {}

lista.forEach(a=>{

if(!mapa[a.comunidad]){

mapa[a.comunidad] = {
comunidad:a.comunidad,
actividades:0,
asistentes:0
}

}

mapa[a.comunidad].actividades++
mapa[a.comunidad].asistentes += a.asistentes

})

setReporteComunidades(
Object.values(mapa)
)

}

/*--------------------------------------------------
UI
--------------------------------------------------*/

if(loading)
return <div className="p-6">Cargando reportes...</div>

return(

<div className="p-6 space-y-8">

<h1 className="text-2xl font-bold">
Reportes Institucionales
</h1>

{/* LEYENDA */}

<div className="bg-blue-50 border p-3 rounded text-sm">

<p className="font-semibold mb-1">
Validación automática
</p>

<p>🟢 Cumplida → existe seguimiento</p>
<p>🟡 Pendiente → semana pasada sin seguimiento</p>
<p>🔵 Programada → actividad de la semana actual</p>

</div>

{/* KPI */}

<div className="grid grid-cols-7 gap-4">

<KPI titulo="Técnicos" valor={kpi.tecnicos}/>
<KPI titulo="Comunidades" valor={kpi.comunidades}/>
<KPI titulo="Asistentes" valor={kpi.asistentes}/>
<KPI titulo="Actividades" valor={kpi.actividades}/>
<KPI titulo="Cumplidas" valor={kpi.cumplidas}/>
<KPI titulo="Pendientes" valor={kpi.pendientes}/>
<KPI titulo="Asistencia %" valor={kpi.asistenciaPromedio}/>

</div>

{/* FILTROS */}

<div className="grid grid-cols-3 gap-4">

<select
value={semanaFiltro}
onChange={e=>setSemanaFiltro(e.target.value)}
className="border p-2 rounded"
>

<option value="actual">
Semana Actual
</option>

<option value="historico">
Histórico
</option>

{semanas.map(s=>(
<option key={s.id} value={s.id}>
{s.fechaInicio} - {s.fechaFin}
</option>
))}

</select>

<select
value={tecnicoFiltro}
onChange={e=>setTecnicoFiltro(e.target.value)}
className="border p-2 rounded"
>

<option value="todos">
Todos los técnicos
</option>

{usuarios
.filter(
u=>u.rol==="tecnico" || u.rol==="admin"
)
.map(t=>(
<option key={t.id} value={t.id}>
{t.nombre}
</option>
))}

</select>

<select
value={comunidadFiltro}
onChange={e=>setComunidadFiltro(e.target.value)}
className="border p-2 rounded"
>

<option value="todas">
Todas las comunidades
</option>

{[
...new Set(
planes.flatMap(
(p:any)=>p.actividades?.map((a:any)=>a.comunidadNombre) || []
)
)
].map((c:any)=>(
<option key={c} value={c}>
{c}
</option>
))}

</select>

</div>

{/* TABLA */}

<table className="w-full bg-white shadow rounded">

<thead className="bg-gray-100">

<tr>

<th className="p-2">Técnico</th>
<th className="p-2">Comunidad</th>
<th className="p-2">Actividad</th>
<th className="p-2">Día</th>
<th className="p-2">Horario</th>
<th className="p-2">Estado</th>
<th className="p-2">Asistentes</th>
<th className="p-2">% Asistencia</th>

</tr>

</thead>

<tbody>

{actividades.map((a,i)=>(

<tr key={i} className="border-t">

<td
className="p-2 text-blue-600 cursor-pointer"
onClick={()=>router.push(
`/dashboard/admin/tecnico/${a.tecnicoId}`
)}
>
{a.tecnico}
</td>

<td className="p-2">{a.comunidad}</td>
<td className="p-2">{a.actividad}</td>
<td className="p-2">{a.dia}</td>
<td className="p-2">{a.horario}</td>

<td className="p-2 text-center">

{a.estado==="Cumplida" && "🟢"}
{a.estado==="Pendiente" && "🟡"}
{a.estado==="Programada" && "🔵"}

</td>

<td className="p-2 text-center">
{a.asistentes}
</td>

<td className="p-2 text-center">
{a.porcentaje ? `${a.porcentaje}%` : "-"}
</td>

</tr>

))}

</tbody>

</table>

{/* REPORTE COMUNIDADES */}

<div>

<h2 className="text-xl font-bold">
Resumen por Comunidad
</h2>

<table className="w-full bg-white shadow rounded">

<thead className="bg-gray-100">

<tr>

<th className="p-2">Comunidad</th>
<th className="p-2">Actividades</th>
<th className="p-2">Asistentes</th>

</tr>

</thead>

<tbody>

{reporteComunidades.map((c,i)=>(

<tr key={i} className="border-t">

<td className="p-2">{c.comunidad}</td>
<td className="p-2 text-center">{c.actividades}</td>
<td className="p-2 text-center">{c.asistentes}</td>

</tr>

))}

</tbody>

</table>

</div>

</div>

)

}

function KPI({titulo,valor}:any){

return(

<div className="bg-white p-4 rounded shadow">

<p className="text-gray-500">
{titulo}
</p>

<h2 className="text-2xl font-bold text-green-600">
{valor}
</h2>

</div>

)

}