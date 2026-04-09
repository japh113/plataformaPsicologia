import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/layout/MobileNav';
import NewPatientModal from './modals/NewPatientModal';
import DashboardScreen from './screens/DashboardScreen';
import PatientsScreen from './screens/PatientsScreen';
import NotesScreen from './screens/NotesScreen';
import LoginScreen from './screens/LoginScreen';
import AppointmentsScreen from './screens/AppointmentsScreen';
import {
  createMyUnavailableAvailabilityRange,
  deleteMyUnavailableAvailabilityRange,
  deleteMyAvailabilityException,
  getMyAvailability,
  getMyAvailabilityExceptions,
  updateMyAvailability,
  updateMyUnavailableAvailabilityRange,
  upsertMyAvailabilityException,
} from './api/availability';
import {
  createPatient,
  createPatientSession,
  createPatientTask,
  deletePatientSession,
  deletePatientTask,
  getPatients,
  updatePatient,
  updatePatientSession,
  updatePatientTask,
} from './api/patients';
import { createAppointment, deleteAppointment, getAppointments, updateAppointment } from './api/appointments';
import { getAuthToken } from './api/client';
import { getCurrentUser, login, logout } from './api/auth';
import { getMyReminders } from './api/reminders';
import {
  mapBackendPatientToUiPatient,
  mapBackendSessionToUiSession,
  mapBackendTaskToUiTask,
  mapUiPatientToBackendPatient,
} from './mappers/patients';
import {
  filterAppointmentsByDate,
  getTodayDateString,
  mapBackendAppointmentToUiAppointment,
  mapUiAppointmentToBackendAppointment,
} from './mappers/appointments';

const syncPatientInCollection = (patients, nextPatient) =>
  patients.map((patient) => (patient.id === nextPatient.id ? nextPatient : patient));

const sortAppointments = (appointments) =>
  [...appointments].sort((a, b) => {
    const left = `${a.fecha}T${a.hora24}`;
    const right = `${b.fecha}T${b.hora24}`;
    return left.localeCompare(right);
  });

const sortSessions = (sessions) =>
  [...sessions].sort((a, b) => {
    const left = `${a.fecha || '0000-00-00'}T${a.actualizadaEn || a.creadaEn || '00:00:00'}`;
    const right = `${b.fecha || '0000-00-00'}T${b.actualizadaEn || b.creadaEn || '00:00:00'}`;
    return right.localeCompare(left);
  });

const buildDateRangeStrings = (startDate, endDate) => {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const [startYear = '0', startMonth = '1', startDay = '1'] = String(startDate).split('-');
  const [endYear = '0', endMonth = '1', endDay = '1'] = String(endDate).split('-');
  const currentDate = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
  const lastDate = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));
  const dates = [];

  while (currentDate <= lastDate) {
    dates.push(currentDate.toISOString().slice(0, 10));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

export default function App() {
  const [vistaActiva, setVistaActiva] = useState('dashboard');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [sessionDraftAppointmentId, setSessionDraftAppointmentId] = useState(null);
  const [appointmentsViewContext, setAppointmentsViewContext] = useState({ date: '', nonce: 0 });
  const [pacientes, setPacientes] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [availabilityDraft, setAvailabilityDraft] = useState([]);
  const [availabilityExceptions, setAvailabilityExceptions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [mostrarModalNuevoPaciente, setMostrarModalNuevoPaciente] = useState(false);
  const [nuevoPacienteForm, setNuevoPacienteForm] = useState({ nombre: '', edad: '', motivo: '', riesgo: 'bajo' });
  const [notasTemp, setNotasTemp] = useState('');
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [guardandoPaciente, setGuardandoPaciente] = useState(false);
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [guardandoPerfilPaciente, setGuardandoPerfilPaciente] = useState(false);
  const [guardandoSesion, setGuardandoSesion] = useState(false);
  const [creandoTarea, setCreandoTarea] = useState(false);
  const [procesandoTareaId, setProcesandoTareaId] = useState(null);
  const [procesandoSesionId, setProcesandoSesionId] = useState(null);
  const [guardandoCita, setGuardandoCita] = useState(false);
  const [procesandoCitaId, setProcesandoCitaId] = useState(null);
  const [appointmentActionError, setAppointmentActionError] = useState('');
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityActionError, setAvailabilityActionError] = useState('');
  const [savingAvailabilityException, setSavingAvailabilityException] = useState(false);
  const [availabilityExceptionActionError, setAvailabilityExceptionActionError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const isPsychologist = currentUser?.role === 'psychologist';
  const todayDate = getTodayDateString();
  const todayAppointments = useMemo(() => filterAppointmentsByDate(appointments, todayDate), [appointments, todayDate]);

  const resetSessionState = () => {
    setVistaActiva('dashboard');
    setPacienteSeleccionado(null);
    setSessionDraftAppointmentId(null);
    setAppointmentsViewContext({ date: '', nonce: 0 });
    setPacientes([]);
    setAppointments([]);
    setAvailability([]);
    setAvailabilityDraft([]);
    setAvailabilityExceptions([]);
    setReminders([]);
    setNotasTemp('');
    setErrorCarga('');
    setAppointmentActionError('');
    setAvailabilityActionError('');
    setAvailabilityExceptionActionError('');
    setGuardandoSesion(false);
    setProcesandoSesionId(null);
    setMostrarModalNuevoPaciente(false);
    setNuevoPacienteForm({ nombre: '', edad: '', motivo: '', riesgo: 'bajo' });
  };

  const cargarDatos = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setCargandoDatos(true);
    setErrorCarga('');

    try {
      const requests = [getPatients(), getAppointments(), getMyReminders()];

      if (currentUser.role === 'psychologist') {
        requests.push(getMyAvailability());
        requests.push(getMyAvailabilityExceptions());
      }

      const [backendPatients, backendAppointments, backendReminders, backendAvailability = [], backendAvailabilityExceptions = []] = await Promise.all(requests);

      setPacientes(backendPatients.map(mapBackendPatientToUiPatient));
      setAppointments(sortAppointments(backendAppointments.map(mapBackendAppointmentToUiAppointment)));
      setReminders(backendReminders);
      setAvailability(backendAvailability);
      setAvailabilityDraft(backendAvailability);
      setAvailabilityExceptions(backendAvailabilityExceptions);
    } catch (error) {
      setErrorCarga(error.message || 'No se pudieron cargar los datos del tablero.');
    } finally {
      setCargandoDatos(false);
    }
  }, [currentUser]);

  useEffect(() => {
    const bootstrapSession = async () => {
      const token = getAuthToken();

      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch {
        logout();
        resetSessionState();
      } finally {
        setAuthLoading(false);
      }
    };

    bootstrapSession();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    cargarDatos();
  }, [currentUser, cargarDatos]);

  const handleLogin = async (credentials) => {
    if (loggingIn) {
      return;
    }

    setLoggingIn(true);
    setLoginError('');

    try {
      const session = await login(credentials);
      setCurrentUser(session.user);
      resetSessionState();
    } catch (error) {
      setLoginError(error.message || 'No se pudo iniciar sesion.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    resetSessionState();
  };

  const syncPatientState = (nextPatient) => {
    setPacientes((currentPatients) => syncPatientInCollection(currentPatients, nextPatient));
    setPacienteSeleccionado((currentPatient) => (currentPatient?.id === nextPatient.id ? nextPatient : currentPatient));
  };

  const syncAppointmentsState = (updater) => {
    setAppointments((currentAppointments) => sortAppointments(typeof updater === 'function' ? updater(currentAppointments) : updater));
  };

  const refreshReminders = async () => {
    if (!currentUser) {
      return;
    }

    try {
      const nextReminders = await getMyReminders();
      setReminders(nextReminders);
    } catch {
      // Keep the current reminders on screen if the refresh fails.
    }
  };

  const abrirNotas = (paciente, options = {}) => {
    const pacienteActualizado = pacientes.find((currentPatient) => currentPatient.id === paciente.id) || paciente;
    setPacienteSeleccionado(pacienteActualizado);
    setSessionDraftAppointmentId(options.appointmentId || null);
    setNotasTemp(pacienteActualizado.notas || '');
    setVistaActiva('notas');
  };

  const abrirAgenda = (date = '') => {
    setAppointmentsViewContext({ date, nonce: Date.now() });
    setVistaActiva('appointments');
  };

  const handleInputChange = (e) => {
    setNuevoPacienteForm({ ...nuevoPacienteForm, [e.target.name]: e.target.value });
  };

  const guardarNuevoPaciente = async (e) => {
    e.preventDefault();

    if (!isPsychologist || !nuevoPacienteForm.nombre.trim() || guardandoPaciente) {
      return;
    }

    setGuardandoPaciente(true);

    try {
      const createdPatient = await createPatient(
        mapUiPatientToBackendPatient({
          ...nuevoPacienteForm,
          notas: '',
          ultimaSesion: null,
          estado: 'active',
        }),
      );

      setPacientes((currentPatients) => [...currentPatients, mapBackendPatientToUiPatient(createdPatient)]);
      setNuevoPacienteForm({ nombre: '', edad: '', motivo: '', riesgo: 'bajo' });
      setMostrarModalNuevoPaciente(false);
    } catch (error) {
      window.alert(error.message || 'No se pudo crear el paciente.');
    } finally {
      setGuardandoPaciente(false);
    }
  };

  const guardarNotas = async () => {
    if (!isPsychologist || !pacienteSeleccionado || guardandoNotas) {
      return;
    }

    const patientToUpdate = pacientes.find((patient) => patient.id === pacienteSeleccionado.id) || pacienteSeleccionado;

    setGuardandoNotas(true);

    try {
      const updatedApiPatient = await updatePatient(
        patientToUpdate.id,
        mapUiPatientToBackendPatient({
          ...patientToUpdate,
          notas: notasTemp,
        }),
      );

      const updatedPatient = mapBackendPatientToUiPatient(updatedApiPatient);
      syncPatientState(updatedPatient);
      setNotasTemp(updatedApiPatient.notes || '');
      window.alert('Expediente actualizado correctamente.');
    } catch (error) {
      window.alert(error.message || 'No se pudieron guardar las notas.');
    } finally {
      setGuardandoNotas(false);
    }
  };

  const actualizarPerfilPaciente = async (changes) => {
    if (!isPsychologist || !pacienteSeleccionado || guardandoPerfilPaciente) {
      return false;
    }

    const patientToUpdate = pacientes.find((patient) => patient.id === pacienteSeleccionado.id) || pacienteSeleccionado;
    setGuardandoPerfilPaciente(true);

    try {
      const updatedApiPatient = await updatePatient(
        patientToUpdate.id,
        mapUiPatientToBackendPatient({
          ...patientToUpdate,
          ...changes,
        }),
      );

      const updatedPatient = mapBackendPatientToUiPatient(updatedApiPatient);
      syncPatientState(updatedPatient);
      return true;
    } catch (error) {
      window.alert(error.message || 'No se pudo actualizar la ficha del paciente.');
      return false;
    } finally {
      setGuardandoPerfilPaciente(false);
    }
  };

  const addTask = async (taskText) => {
    if (!isPsychologist || !pacienteSeleccionado || creandoTarea) {
      return false;
    }

    setCreandoTarea(true);

    try {
      const createdTask = await createPatientTask(pacienteSeleccionado.id, { text: taskText });
      const uiTask = mapBackendTaskToUiTask(createdTask);
      const nextPatient = {
        ...pacienteSeleccionado,
        tareas: [...(pacienteSeleccionado.tareas || []), uiTask],
      };

      syncPatientState(nextPatient);
      await refreshReminders();
      return true;
    } catch (error) {
      window.alert(error.message || 'No se pudo crear la tarea.');
      return false;
    } finally {
      setCreandoTarea(false);
    }
  };

  const toggleTask = async (taskId) => {
    if (!pacienteSeleccionado || procesandoTareaId) {
      return;
    }

    const task = pacienteSeleccionado.tareas.find((currentTask) => currentTask.id === taskId);

    if (!task) {
      return;
    }

    setProcesandoTareaId(taskId);

    try {
      const updatedTask = await updatePatientTask(pacienteSeleccionado.id, taskId, {
        completed: !task.completada,
      });

      const uiTask = mapBackendTaskToUiTask(updatedTask);
      const nextPatient = {
        ...pacienteSeleccionado,
        tareas: pacienteSeleccionado.tareas.map((currentTask) => (currentTask.id === taskId ? uiTask : currentTask)),
      };

      syncPatientState(nextPatient);
      await refreshReminders();
    } catch (error) {
      window.alert(error.message || 'No se pudo actualizar la tarea.');
    } finally {
      setProcesandoTareaId(null);
    }
  };

  const removeTask = async (taskId) => {
    if (!isPsychologist || !pacienteSeleccionado || procesandoTareaId) {
      return;
    }

    setProcesandoTareaId(taskId);

    try {
      await deletePatientTask(pacienteSeleccionado.id, taskId);

      const nextPatient = {
        ...pacienteSeleccionado,
        tareas: pacienteSeleccionado.tareas.filter((task) => task.id !== taskId),
      };

      syncPatientState(nextPatient);
      await refreshReminders();
    } catch (error) {
      window.alert(error.message || 'No se pudo eliminar la tarea.');
    } finally {
      setProcesandoTareaId(null);
    }
  };

  const createSession = async (payload) => {
    if (!isPsychologist || !pacienteSeleccionado || guardandoSesion) {
      return false;
    }

    setGuardandoSesion(true);

    try {
      const createdSession = await createPatientSession(pacienteSeleccionado.id, payload);
      const uiSession = mapBackendSessionToUiSession(createdSession);
      const sessionDate = uiSession.fecha || pacienteSeleccionado.ultimaSesion;
      const nextPatient = {
        ...pacienteSeleccionado,
        ultimaSesion: sessionDate,
        sesiones: sortSessions([...(pacienteSeleccionado.sesiones || []), uiSession]),
      };

      syncPatientState(nextPatient);
      return true;
    } catch (error) {
      window.alert(error.message || 'No se pudo crear la sesion.');
      return false;
    } finally {
      setGuardandoSesion(false);
    }
  };

  const updateSession = async (sessionId, payload) => {
    if (!isPsychologist || !pacienteSeleccionado || guardandoSesion) {
      return false;
    }

    setGuardandoSesion(true);
    setProcesandoSesionId(sessionId);

    try {
      const updatedSession = await updatePatientSession(pacienteSeleccionado.id, sessionId, payload);
      const uiSession = mapBackendSessionToUiSession(updatedSession);
      const nextSessions = sortSessions(
        (pacienteSeleccionado.sesiones || []).map((session) => (session.id === sessionId ? uiSession : session)),
      );
      const nextPatient = {
        ...pacienteSeleccionado,
        ultimaSesion: nextSessions[0]?.fecha || null,
        sesiones: nextSessions,
      };

      syncPatientState(nextPatient);
      return true;
    } catch (error) {
      window.alert(error.message || 'No se pudo actualizar la sesion.');
      return false;
    } finally {
      setGuardandoSesion(false);
      setProcesandoSesionId(null);
    }
  };

  const removeSession = async (sessionId) => {
    if (!isPsychologist || !pacienteSeleccionado || procesandoSesionId) {
      return false;
    }

    setProcesandoSesionId(sessionId);

    try {
      await deletePatientSession(pacienteSeleccionado.id, sessionId);
      const nextSessions = (pacienteSeleccionado.sesiones || []).filter((session) => session.id !== sessionId);
      const nextPatient = {
        ...pacienteSeleccionado,
        ultimaSesion: nextSessions[0]?.fecha || null,
        sesiones: nextSessions,
      };

      syncPatientState(nextPatient);
      return true;
    } catch (error) {
      window.alert(error.message || 'No se pudo eliminar la sesion.');
      return false;
    } finally {
      setProcesandoSesionId(null);
    }
  };

  const handleCreateAppointment = async (appointmentForm) => {
    if (!isPsychologist || guardandoCita) {
      return false;
    }

    setGuardandoCita(true);
    setAppointmentActionError('');

    try {
      const createdAppointment = await createAppointment(mapUiAppointmentToBackendAppointment(appointmentForm));
      const uiAppointment = mapBackendAppointmentToUiAppointment(createdAppointment);
      syncAppointmentsState((currentAppointments) => [...currentAppointments, uiAppointment]);
      await refreshReminders();
      return true;
    } catch (error) {
      setAppointmentActionError(error.message || 'No se pudo crear la cita.');
      return false;
    } finally {
      setGuardandoCita(false);
    }
  };

  const handleUpdateAppointment = async (appointmentId, appointmentForm) => {
    if (!isPsychologist || guardandoCita) {
      return false;
    }

    setGuardandoCita(true);
    setProcesandoCitaId(appointmentId);
    setAppointmentActionError('');

    try {
      const updatedAppointment = await updateAppointment(appointmentId, mapUiAppointmentToBackendAppointment(appointmentForm));
      const uiAppointment = mapBackendAppointmentToUiAppointment(updatedAppointment);
      syncAppointmentsState((currentAppointments) =>
        currentAppointments.map((appointment) => (appointment.id === appointmentId ? uiAppointment : appointment)),
      );
      await refreshReminders();
      return true;
    } catch (error) {
      setAppointmentActionError(error.message || 'No se pudo actualizar la cita.');
      return false;
    } finally {
      setGuardandoCita(false);
      setProcesandoCitaId(null);
    }
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (!isPsychologist || procesandoCitaId) {
      return false;
    }

    setProcesandoCitaId(appointmentId);
    setAppointmentActionError('');

    try {
      await deleteAppointment(appointmentId);
      syncAppointmentsState((currentAppointments) => currentAppointments.filter((appointment) => appointment.id !== appointmentId));
      await refreshReminders();
      return true;
    } catch (error) {
      window.alert(error.message || 'No se pudo eliminar la cita.');
      return false;
    } finally {
      setProcesandoCitaId(null);
    }
  };

  const handleOpenSessionFromAppointment = async (appointment, patient) => {
    if (!isPsychologist || !appointment || !patient) {
      return false;
    }

    if (appointment.estado === 'cancelada') {
      return false;
    }

    if (appointment.fecha > todayDate) {
      setAppointmentActionError('No puedes completar y registrar una cita futura.');
      return false;
    }

    if (appointment.estado !== 'completada') {
      const wasUpdated = await handleUpdateAppointment(appointment.id, {
        ...appointment,
        estado: 'completada',
      });

      if (!wasUpdated) {
        return false;
      }
    }

    abrirNotas(patient, { appointmentId: appointment.id });
    return true;
  };

  const handleUpdateAvailability = async (entries) => {
    if (!isPsychologist || savingAvailability) {
      return false;
    }

    setSavingAvailability(true);
    setAvailabilityActionError('');

    try {
      const updatedAvailability = await updateMyAvailability(entries);
      setAvailability(updatedAvailability);
      setAvailabilityDraft(updatedAvailability);
      return true;
    } catch (error) {
      setAvailabilityActionError(error.message || 'No se pudo actualizar la disponibilidad.');
      return false;
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleUpsertAvailabilityException = async (payload) => {
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const savedException = await upsertMyAvailabilityException(payload);
      setAvailabilityExceptions((currentExceptions) => {
        const withoutCurrentDate = currentExceptions.filter((exception) => exception.date !== savedException.date);
        return [...withoutCurrentDate, savedException].sort((left, right) => left.date.localeCompare(right.date));
      });
      return true;
    } catch (error) {
      setAvailabilityExceptionActionError(error.message || 'No se pudo guardar la excepcion.');
      return false;
    } finally {
      setSavingAvailabilityException(false);
    }
  };

  const handleDeleteAvailabilityException = async (date) => {
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      await deleteMyAvailabilityException(date);
      setAvailabilityExceptions((currentExceptions) => currentExceptions.filter((exception) => exception.date !== date));
      return true;
    } catch (error) {
      setAvailabilityExceptionActionError(error.message || 'No se pudo eliminar la excepcion.');
      return false;
    } finally {
      setSavingAvailabilityException(false);
    }
  };

  const handleCreateAvailabilityExceptionRange = async (payload) => {
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const createdExceptions = await createMyUnavailableAvailabilityRange(payload);
      setAvailabilityExceptions((currentExceptions) => {
        const blockedDates = new Set(createdExceptions.map((exception) => exception.date));
        const preservedExceptions = currentExceptions.filter((exception) => !blockedDates.has(exception.date));
        return [...preservedExceptions, ...createdExceptions].sort((left, right) => left.date.localeCompare(right.date));
      });
      return true;
    } catch (error) {
      setAvailabilityExceptionActionError(error.message || 'No se pudo bloquear el periodo.');
      return false;
    } finally {
      setSavingAvailabilityException(false);
    }
  };

  const handleUpdateAvailabilityExceptionRange = async (payload) => {
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const updatedExceptions = await updateMyUnavailableAvailabilityRange(payload);
      setAvailabilityExceptions((currentExceptions) => {
        const currentRangeDates = new Set(buildDateRangeStrings(payload.currentStartDate, payload.currentEndDate));
        const preservedExceptions = currentExceptions.filter((exception) => !currentRangeDates.has(exception.date));
        return [...preservedExceptions, ...updatedExceptions].sort((left, right) => left.date.localeCompare(right.date));
      });
      return true;
    } catch (error) {
      setAvailabilityExceptionActionError(error.message || 'No se pudo actualizar el periodo bloqueado.');
      return false;
    } finally {
      setSavingAvailabilityException(false);
    }
  };

  const handleDeleteAvailabilityExceptionRange = async (payload) => {
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const deletedRange = await deleteMyUnavailableAvailabilityRange(payload);
      const deletedDates = new Set(deletedRange.deletedDates || []);
      setAvailabilityExceptions((currentExceptions) => currentExceptions.filter((exception) => !deletedDates.has(exception.date)));
      return true;
    } catch (error) {
      setAvailabilityExceptionActionError(error.message || 'No se pudo desbloquear el periodo.');
      return false;
    } finally {
      setSavingAvailabilityException(false);
    }
  };

  const renderMainContent = () => {
    if (cargandoDatos) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800">Cargando tablero</h2>
          <p className="text-sm text-gray-500 mt-2">Consultando la API para sincronizar el tablero.</p>
        </div>
      );
    }

    if (errorCarga) {
      return (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800">No pudimos cargar la informacion</h2>
          <p className="text-sm text-gray-500 mt-2">{errorCarga}</p>
          <button onClick={cargarDatos} className="mt-4 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium">
            Reintentar
          </button>
        </div>
      );
    }

    if (vistaActiva === 'dashboard') {
      return (
        <DashboardScreen
          currentUser={currentUser}
          patients={pacientes}
          appointments={todayAppointments}
          reminders={reminders}
          onOpenPatient={abrirNotas}
          onNewPatient={() => setMostrarModalNuevoPaciente(true)}
          onViewAppointments={() => setVistaActiva('appointments')}
        />
      );
    }

    if (vistaActiva === 'appointments') {
      return (
        <AppointmentsScreen
          key={`appointments-${appointmentsViewContext.nonce || 'default'}-${currentUser?.id || 'anonymous'}`}
          viewContext={appointmentsViewContext}
          currentUser={currentUser}
          patients={pacientes}
          appointments={appointments}
          availability={availability}
          availabilityDraft={availabilityDraft}
          availabilityExceptions={availabilityExceptions}
          todayDate={todayDate}
          onOpenPatient={abrirNotas}
          onOpenAppointmentSession={handleOpenSessionFromAppointment}
          onCreateAppointment={handleCreateAppointment}
          onUpdateAppointment={handleUpdateAppointment}
          onDeleteAppointment={handleDeleteAppointment}
          onUpdateAvailability={handleUpdateAvailability}
          onChangeAvailabilityDraft={setAvailabilityDraft}
          onUpsertAvailabilityException={handleUpsertAvailabilityException}
          onCreateAvailabilityExceptionRange={handleCreateAvailabilityExceptionRange}
          onUpdateAvailabilityExceptionRange={handleUpdateAvailabilityExceptionRange}
          onDeleteAvailabilityExceptionRange={handleDeleteAvailabilityExceptionRange}
          onDeleteAvailabilityException={handleDeleteAvailabilityException}
          isSavingAppointment={guardandoCita}
          processingAppointmentId={procesandoCitaId}
          appointmentActionError={appointmentActionError}
          onDismissAppointmentError={() => setAppointmentActionError('')}
          isSavingAvailability={savingAvailability}
          availabilityActionError={availabilityActionError}
          onDismissAvailabilityError={() => setAvailabilityActionError('')}
          isSavingAvailabilityException={savingAvailabilityException}
          availabilityExceptionActionError={availabilityExceptionActionError}
          onDismissAvailabilityExceptionError={() => setAvailabilityExceptionActionError('')}
        />
      );
    }

    if (vistaActiva === 'patients') {
      return <PatientsScreen currentUser={currentUser} patients={pacientes} onOpenPatient={abrirNotas} />;
    }

    if (vistaActiva === 'notas') {
      return (
        <NotesScreen
          key={`${pacienteSeleccionado?.id || 'notes-screen'}-${sessionDraftAppointmentId || 'none'}`}
          currentUser={currentUser}
          patient={pacienteSeleccionado}
          appointments={appointments}
          todayDate={todayDate}
          prefilledAppointmentId={sessionDraftAppointmentId}
          setVistaActiva={setVistaActiva}
          onViewAppointments={abrirAgenda}
          onUpdatePatientProfile={actualizarPerfilPaciente}
          onOpenAppointmentSession={handleOpenSessionFromAppointment}
          notesTemp={notasTemp}
          setNotesTemp={setNotasTemp}
          onSaveNotes={guardarNotas}
          onToggleTask={toggleTask}
          onDeleteTask={removeTask}
          onAddTask={addTask}
          onCreateSession={createSession}
          onUpdateSession={updateSession}
          onDeleteSession={removeSession}
          isSavingNotes={guardandoNotas}
          isSavingPatientProfile={guardandoPerfilPaciente}
          isSavingSession={guardandoSesion}
          isCreatingTask={creandoTarea}
          processingTaskId={procesandoTareaId}
          processingSessionId={procesandoSesionId}
        />
      );
    }

    return null;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-lg">
          <h1 className="text-2xl font-black text-slate-900">Verificando sesion</h1>
          <p className="mt-2 text-sm text-slate-500">Comprobando acceso seguro a PsicoPanel.</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} isSubmitting={loggingIn} error={loginError} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900 relative pb-20 md:pb-0">
      <NewPatientModal
        isOpen={mostrarModalNuevoPaciente && isPsychologist}
        onClose={() => setMostrarModalNuevoPaciente(false)}
        form={nuevoPacienteForm}
        onChange={handleInputChange}
        onSubmit={guardarNuevoPaciente}
        isSubmitting={guardandoPaciente}
      />

      <Sidebar currentUser={currentUser} onLogout={handleLogout} vistaActiva={vistaActiva} setVistaActiva={setVistaActiva} />
      <MobileNav currentUser={currentUser} onLogout={handleLogout} vistaActiva={vistaActiva} setVistaActiva={setVistaActiva} />

      <main className="flex-1 flex flex-col h-screen overflow-auto bg-slate-50/50 w-full">
        <div className="p-4 md:p-8">{renderMainContent()}</div>
      </main>
    </div>
  );
}
