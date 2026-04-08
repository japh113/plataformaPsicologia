import React, { useState } from 'react';
import './App.css';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/layout/MobileNav';
import NewPatientModal from './modals/NewPatientModal';
import DashboardScreen from './screens/DashboardScreen';
import PatientsScreen from './screens/PatientsScreen';
import NotesScreen from './screens/NotesScreen';
import { initialPatients, todayAppointments, initialTransactions } from './data/mockData';

export default function App() {
  const [vistaActiva, setVistaActiva] = useState('dashboard');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [pacientes, setPacientes] = useState(initialPatients);
  const [, setTransacciones] = useState(initialTransactions);
  const [mostrarModalNuevoPaciente, setMostrarModalNuevoPaciente] = useState(false);
  const [nuevoPacienteForm, setNuevoPacienteForm] = useState({ nombre: '', edad: '', motivo: '', riesgo: 'bajo' });
  const [notasTemp, setNotasTemp] = useState('');

  const abrirNotas = (paciente) => {
    const pacienteActualizado = pacientes.find((p) => p.id === paciente.id);
    setPacienteSeleccionado(pacienteActualizado);
    setNotasTemp(pacienteActualizado.notas || '');
    setVistaActiva('notas');
  };

  const handleInputChange = (e) => setNuevoPacienteForm({ ...nuevoPacienteForm, [e.target.name]: e.target.value });

  const guardarNuevoPaciente = (e) => {
    e.preventDefault();
    if (!nuevoPacienteForm.nombre.trim()) return;
    setPacientes([
      ...pacientes,
      {
        id: pacientes.length + 1,
        ...nuevoPacienteForm,
        ultimaSesion: 'Nuevo Ingreso',
        notas: '',
        tareas: [],
      },
    ]);
    setNuevoPacienteForm({ nombre: '', edad: '', motivo: '', riesgo: 'bajo' });
    setMostrarModalNuevoPaciente(false);
  };

  const guardarNotas = () => {
    setPacientes(pacientes.map((p) => (p.id === pacienteSeleccionado.id ? { ...p, notas: notasTemp } : p)));
    setPacienteSeleccionado({ ...pacienteSeleccionado, notas: notasTemp });
    alert('Expediente actualizado correctamente.');
  };

  const addTask = (taskText) => {
    const tareasActualizadas = [...(pacienteSeleccionado.tareas || []), { id: Date.now(), texto: taskText, completada: false }];
    setPacientes(pacientes.map((p) => (p.id === pacienteSeleccionado.id ? { ...p, tareas: tareasActualizadas } : p)));
    setPacienteSeleccionado({ ...pacienteSeleccionado, tareas: tareasActualizadas });
  };

  const toggleTask = (taskId) => {
    const tareasActualizadas = pacienteSeleccionado.tareas.map((t) => (t.id === taskId ? { ...t, completada: !t.completada } : t));
    setPacientes(pacientes.map((p) => (p.id === pacienteSeleccionado.id ? { ...p, tareas: tareasActualizadas } : p)));
    setPacienteSeleccionado({ ...pacienteSeleccionado, tareas: tareasActualizadas });
  };

  const deleteTask = (taskId) => {
    const tareasActualizadas = pacienteSeleccionado.tareas.filter((t) => t.id !== taskId);
    setPacientes(pacientes.map((p) => (p.id === pacienteSeleccionado.id ? { ...p, tareas: tareasActualizadas } : p)));
    setPacienteSeleccionado({ ...pacienteSeleccionado, tareas: tareasActualizadas });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900 relative pb-16 md:pb-0">
      <NewPatientModal
        isOpen={mostrarModalNuevoPaciente}
        onClose={() => setMostrarModalNuevoPaciente(false)}
        form={nuevoPacienteForm}
        onChange={handleInputChange}
        onSubmit={guardarNuevoPaciente}
      />

      <Sidebar vistaActiva={vistaActiva} setVistaActiva={setVistaActiva} />
      <MobileNav vistaActiva={vistaActiva} setVistaActiva={setVistaActiva} onAddPatient={() => setMostrarModalNuevoPaciente(true)} />

      <main className="flex-1 flex flex-col h-screen overflow-auto bg-slate-50/50 w-full">
        <div className="p-4 md:p-8">
          {vistaActiva === 'dashboard' && (
            <DashboardScreen
              patients={pacientes}
              appointments={todayAppointments}
              onOpenPatient={abrirNotas}
              onNewPatient={() => setMostrarModalNuevoPaciente(true)}
            />
          )}
          {vistaActiva === 'patients' && <PatientsScreen patients={pacientes} onOpenPatient={abrirNotas} />}
          {vistaActiva === 'notas' && (
            <NotesScreen
              patient={pacienteSeleccionado}
              setVistaActiva={setVistaActiva}
              notesTemp={notasTemp}
              setNotesTemp={setNotasTemp}
              onSaveNotes={guardarNotas}
              onToggleTask={toggleTask}
              onDeleteTask={deleteTask}
              onAddTask={addTask}
            />
          )}
        </div>
      </main>
    </div>
  );
}
