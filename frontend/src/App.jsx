import { preservePatientActivity } from './utils/patientFollowUp';
import IdentityPanel from './components/IdentityPanel';
import ProfessionalProfileScreen from './screens/ProfessionalProfileScreen';
import ProfessionalReviewScreen from './screens/ProfessionalReviewScreen';
import { patientRegistrationError } from './utils/identityFeedback';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/layout/MobileNav';
import NewPatientModal from './modals/NewPatientModal';
import PatientInterviewModal from './modals/PatientInterviewModal';
import DashboardScreen from './screens/DashboardScreen';
import PatientsScreen from './screens/PatientsScreen';
import NotesScreen from './screens/NotesScreen';
import LoginScreen from './screens/LoginScreen';
import AppointmentsScreen from './screens/AppointmentsScreen';
import BackofficeScreen from './screens/BackofficeScreen';
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
  createPatientObjective,
  createPatientClinicalNote,
  deletePatientObjective,
  deletePatientTask,
  getPatient,
  getPatientFollowUp,
  getPatients,
  upsertPatientInterview,
  updatePatient,
  updatePatientObjective,
  updatePatientClinicalNote,
  updatePatientTask,
} from './api/patients';
import {
  createAppointment,
  createAppointmentWaitlistEntry,
  cancelFutureRecurringAppointments,
  deleteAppointmentWaitlistEntry,
  getAppointments,
  getAppointmentWaitlist,
  reorderAppointmentWaitlistEntries,
  updateAppointment,
} from './api/appointments';
import { getAuthToken } from './api/client';
import {
  acceptCareRelationshipByCode,
  createCareRelationship,
  getAuditLogs,
  getBackofficeUsers,
  getCareRelationships,
  getCurrentUser,
  getPendingPsychologists,
  inviteCareRelationship,
  login,
  logout,
  requestPasswordReset,
  requestCareRelationship,
  registerPatient,
  registerPsychologist,
  respondToCareRelationship,
  reviewPsychologist,
  confirmPasswordReset,
  updateCareRelationship,
} from './api/auth';
import { getMyReminders } from './api/reminders';
import {
  mapBackendPatientToUiPatient,
  mapBackendFollowUpToUiFollowUp,
  mapBackendTaskToUiTask,
  mapUiInterviewToBackendInterview,
  mapUiPatientToBackendPatient,
} from './mappers/patients';
import {
  filterAppointmentsByDate,
  getTodayDateString,
  mapBackendAppointmentToUiAppointment,
  mapBackendWaitlistToUiWaitlistEntry,
  mapUiAppointmentToBackendAppointment,
} from './mappers/appointments';
import { buildInterviewForm as buildInterviewDraftForm } from './utils/patientInterview';

const sortAppointments = (appointments) =>
  [...appointments].sort((a, b) => {
    const left = `${a.fecha}T${a.hora24}`;
    const right = `${b.fecha}T${b.hora24}`;
    return left.localeCompare(right);
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

export default function App({onRestrictedSession}) {
  const sessionEpoch = useRef(0);
  const followUpRequests = useRef(new Map());
  const clinicalAccess = useRef({ generation: 0, denied: false });
  const patientRevisions = useRef(new Map());
  const [vistaActiva, setVistaActiva] = useState('dashboard');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [sessionDraftAppointmentId, setSessionDraftAppointmentId] = useState(null);
  const [appointmentsViewContext, setAppointmentsViewContext] = useState({ date: '', nonce: 0 });
  const [pacientes, setPacientes] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentWaitlist, setAppointmentWaitlist] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [availabilityDraft, setAvailabilityDraft] = useState([]);
  const [availabilityExceptions, setAvailabilityExceptions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [backofficeUsers, setBackofficeUsers] = useState([]);
  const [pendingPsychologists, setPendingPsychologists] = useState([]);
  const [careRelationships, setCareRelationships] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [mostrarModalNuevoPaciente, setMostrarModalNuevoPaciente] = useState(false);
  const [nuevoPacienteForm, setNuevoPacienteForm] = useState({ nombre: '', edad: '', motivo: '', riesgo: 'sin riesgo' });
  const [notasTemp, setNotasTemp] = useState('');
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [guardandoPaciente, setGuardandoPaciente] = useState(false);
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [guardandoPerfilPaciente, setGuardandoPerfilPaciente] = useState(false);
  const [guardandoSesion, setGuardandoSesion] = useState(false);
  const [sessionActionError, setSessionActionError] = useState('');
  const [guardandoEntrevista, setGuardandoEntrevista] = useState(false);
  const [procesandoTareaId, setProcesandoTareaId] = useState(null);
  const [creandoObjetivo, setCreandoObjetivo] = useState(false);
  const [procesandoObjetivoId, setProcesandoObjetivoId] = useState(null);
  const [guardandoCita, setGuardandoCita] = useState(false);
  const [procesandoCitaId, setProcesandoCitaId] = useState(null);
  const [appointmentActionError, setAppointmentActionError] = useState('');
  const [guardandoListaEspera, setGuardandoListaEspera] = useState(false);
  const [procesandoListaEsperaId, setProcesandoListaEsperaId] = useState(null);
  const [waitlistActionError, setWaitlistActionError] = useState('');
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityActionError, setAvailabilityActionError] = useState('');
  const [savingAvailabilityException, setSavingAvailabilityException] = useState(false);
  const [availabilityExceptionActionError, setAvailabilityExceptionActionError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState('');
  const [registeringAccount, setRegisteringAccount] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('');
  const [passwordResetPreview, setPasswordResetPreview] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [reviewingPsychologistId, setReviewingPsychologistId] = useState(null);
  const [processingRelationshipId, setProcessingRelationshipId] = useState(null);
  const [backofficeActionError, setBackofficeActionError] = useState('');
  const [relationshipActionError, setRelationshipActionError] = useState('');
  const [relationshipInvitePreview, setRelationshipInvitePreview] = useState(null);
  const [showPatientInterview, setShowPatientInterview] = useState(false);
  const [patientInterviewForm, setPatientInterviewForm] = useState(buildInterviewDraftForm(null, ''));
  const [uiFeedback, setUiFeedback] = useState(null);

  const isPsychologist = currentUser?.role === 'psychologist';
  const isBackoffice = ['admin', 'support', 'superadmin'].includes(currentUser?.role || '');
  const todayDate = getTodayDateString();
  const todayAppointments = useMemo(() => filterAppointmentsByDate(appointments, todayDate), [appointments, todayDate]);
  const patientProfile = useMemo(
    () => (currentUser?.role === 'patient' ? pacientes.find((patient) => patient.id === currentUser.patientId) || null : null),
    [currentUser, pacientes],
  );

  useEffect(() => {
    if (!uiFeedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setUiFeedback(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [uiFeedback]);

  const showUiFeedback = (type, message) => {
    setUiFeedback({
      id: Date.now(),
      type,
      message,
    });
  };

  const showSuccessFeedback = (message) => showUiFeedback('success', message);
  const showErrorFeedback = (message) => showUiFeedback('error', message);

  const resetSessionState = () => {
    sessionEpoch.current += 1;
    clinicalAccess.current = { generation: clinicalAccess.current.generation + 1, denied: false };
    patientRevisions.current.clear();
    followUpRequests.current.clear();
    setVistaActiva('dashboard');
    setPacienteSeleccionado(null);
    setSessionDraftAppointmentId(null);
    setAppointmentsViewContext({ date: '', nonce: 0 });
    setPacientes([]);
    setAppointments([]);
    setAppointmentWaitlist([]);
    setAvailability([]);
    setAvailabilityDraft([]);
    setAvailabilityExceptions([]);
    setReminders([]);
    setBackofficeUsers([]);
    setPendingPsychologists([]);
    setCareRelationships([]);
    setAuditLogs([]);
    setNotasTemp('');
    setErrorCarga('');
    setAppointmentActionError('');
    setWaitlistActionError('');
    setAvailabilityActionError('');
    setAvailabilityExceptionActionError('');
    setSessionActionError('');
    setGuardandoSesion(false);
    setGuardandoEntrevista(false);
    setCargandoDatos(false); setProcesandoTareaId(null); setCreandoObjetivo(false); setProcesandoObjetivoId(null);
    setGuardandoCita(false); setProcesandoCitaId(null); setGuardandoListaEspera(false); setProcesandoListaEsperaId(null);
    setGuardandoNotas(false); setGuardandoPerfilPaciente(false); setGuardandoPaciente(false);
    setSavingAvailability(false); setSavingAvailabilityException(false);
    setPatientInterviewForm(buildInterviewDraftForm(null, '')); setUiFeedback(null);
    setReviewingPsychologistId(null);
    setProcessingRelationshipId(null);
    setBackofficeActionError('');
    setRelationshipActionError('');
    setRelationshipInvitePreview(null);
    setShowPatientInterview(false);
    setMostrarModalNuevoPaciente(false);
    setNuevoPacienteForm({ nombre: '', edad: '', motivo: '', riesgo: 'sin riesgo' });
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setPasswordResetPreview(null);
    setResettingPassword(false);
  };

  const beginClinicalOperation = useCallback(({ allowDenied = false } = {}) => {
    const token = getAuthToken();
    const session = sessionEpoch.current;
    const access = clinicalAccess.current.generation;
    return () => Boolean(token) && getAuthToken() === token && sessionEpoch.current === session &&
      clinicalAccess.current.generation === access && (allowDenied || !clinicalAccess.current.denied);
  }, []);

  const advancePatientRevision = useCallback((patientId) => {
    patientRevisions.current.set(patientId, (patientRevisions.current.get(patientId) || 0) + 1);
  }, []);

  const invalidateClinicalAccess = useCallback(() => {
    clinicalAccess.current = { generation: clinicalAccess.current.generation + 1, denied: true };
    followUpRequests.current.clear();
    setPacientes([]); setPacienteSeleccionado(null); setAppointments([]); setReminders([]); setCareRelationships([]);
    setAppointmentWaitlist([]); setAvailability([]); setAvailabilityDraft([]); setAvailabilityExceptions([]);
    setNotasTemp(''); setShowPatientInterview(false); setPatientInterviewForm(buildInterviewDraftForm(null, ''));
    setCargandoDatos(false); setGuardandoEntrevista(false); setGuardandoSesion(false);
    setGuardandoPaciente(false); setGuardandoNotas(false); setGuardandoPerfilPaciente(false);
    setProcesandoTareaId(null); setCreandoObjetivo(false); setProcesandoObjetivoId(null);
    setGuardandoCita(false); setProcesandoCitaId(null); setGuardandoListaEspera(false); setProcesandoListaEsperaId(null);
    setSavingAvailability(false); setSavingAvailabilityException(false); setProcessingRelationshipId(null);
    setErrorCarga('Ya no tienes acceso a este expediente. Vuelve a comprobar tu sesión.');
  }, []);

  const refreshBackofficeData = useCallback(async () => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    const [users, pending, relationships, nextAuditLogs] = await Promise.all([
      getBackofficeUsers(),
      getPendingPsychologists(),
      getCareRelationships(),
      getAuditLogs(),
    ]);
    if (!isCurrent()) return false;
    setBackofficeUsers(users);
    setPendingPsychologists(pending);
    setCareRelationships(relationships);
    setAuditLogs(nextAuditLogs);
  }, [beginClinicalOperation]);

  const refreshPatientFollowUp = useCallback(async (patientId) => {
    if (currentUser?.role !== 'patient' || String(currentUser.patientId) !== String(patientId)) return false;
    const isAccessCurrent = beginClinicalOperation();
    if (!isAccessCurrent()) return false;
    const revision = patientRevisions.current.get(patientId) || 0;
    const requestId = (followUpRequests.current.get(patientId) || 0) + 1;
    followUpRequests.current.set(patientId, requestId);
    const isCurrent = () => isAccessCurrent() && followUpRequests.current.get(patientId) === requestId;
    const update = transform => {
      setPacientes(previous => previous.map(patient => patient.id === patientId ? transform(patient) : patient));
      setPacienteSeleccionado(previous => previous?.id === patientId ? transform(previous) : previous);
    };
    if (!isCurrent()) return false;
    update(patient => ({ ...patient, seguimientoEstado: 'loading' }));
    try {
      const followUp = await getPatientFollowUp(patientId);
      if (!isCurrent()) return false;
      if ((patientRevisions.current.get(patientId) || 0) !== revision) {
        update(patient => patient.seguimientoEstado === 'loading' ? { ...patient, seguimientoEstado: 'error' } : patient);
        return false;
      }
      advancePatientRevision(patientId);
      update(patient => ({
        ...patient,
        seguimiento: mapBackendFollowUpToUiFollowUp(followUp),
        tareas: [...followUp.consultations.flatMap(entry => entry.tasks), ...followUp.unassignedTasks].map(mapBackendTaskToUiTask),
        seguimientoEstado: 'ready',
      }));
      return true;
    } catch (error) {
      if (!isAccessCurrent()) return false;
      if ([401, 403, 404].includes(error.status)) {
        invalidateClinicalAccess();
      } else if (isCurrent()) {
        update(patient => ({ ...patient, seguimientoEstado: 'error' }));
      }
      return false;
    }
  }, [currentUser, beginClinicalOperation, advancePatientRevision, invalidateClinicalAccess]);

  const cargarDatos = useCallback(async ({ recheckAccess = false } = {}) => {
    if (!currentUser) {
      return;
    }

    let isCurrent = beginClinicalOperation({ allowDenied: recheckAccess });
    if (!isCurrent()) return;
    const revisions = new Map(patientRevisions.current);
    setCargandoDatos(true);
    setErrorCarga('');

    try {
      if (['admin', 'support', 'superadmin'].includes(currentUser.role)) {
        await refreshBackofficeData();
        if (!isCurrent()) return;
        setPacientes([]);
        setAppointments([]);
        setAppointmentWaitlist([]);
        setAvailability([]);
        setAvailabilityDraft([]);
        setAvailabilityExceptions([]);
        setReminders([]);
        return;
      }

      const commonRequests = [getPatients(), getAppointments(), getMyReminders(), getCareRelationships()];
      let backendPatients;
      let backendAppointments;
      let backendReminders;
      let backendRelationships;
      let backendWaitlist = [];
      let backendAvailability = [];
      let backendAvailabilityExceptions = [];

      if (currentUser.role === 'psychologist') {
        [
          backendPatients,
          backendAppointments,
          backendReminders,
          backendRelationships,
          backendWaitlist,
          backendAvailability,
          backendAvailabilityExceptions,
        ] = await Promise.all([
          ...commonRequests,
          getAppointmentWaitlist(),
          getMyAvailability(),
          getMyAvailabilityExceptions(),
        ]);
      } else {
        [backendPatients, backendAppointments, backendReminders, backendRelationships] = await Promise.all(commonRequests);
      }

      if (!isCurrent()) return;
      let recheckedFollowUp = null;
      if (clinicalAccess.current.denied) {
        // Only the explicit button may probe again. All required reads must succeed.
        if (currentUser.role === 'patient') {
          recheckedFollowUp = await getPatientFollowUp(String(currentUser.patientId));
          if (!isCurrent()) return;
        }
        clinicalAccess.current = { generation: clinicalAccess.current.generation + 1, denied: false };
        setVistaActiva('dashboard');
        isCurrent = beginClinicalOperation();
      }
      const updates = backendPatients.map(patient => {
        const id = String(patient.id);
        const preserveActivity = (revisions.get(id) || 0) !== (patientRevisions.current.get(id) || 0);
        advancePatientRevision(id);
        return { id, preserveActivity, patient: mapBackendPatientToUiPatient(
          recheckedFollowUp && id === String(currentUser.patientId) ? { ...patient, followUp: recheckedFollowUp, tasks: [
            ...recheckedFollowUp.consultations.flatMap(entry => entry.tasks), ...recheckedFollowUp.unassignedTasks,
          ] } : patient,
        ) };
      });
      setPacientes(previous => updates.map(({ id, patient, preserveActivity }) => preservePatientActivity(
        previous.find(existing => existing.id === id), patient, preserveActivity,
      )));
      setAppointments(sortAppointments(backendAppointments.map(mapBackendAppointmentToUiAppointment)));
      setReminders(backendReminders);
      setCareRelationships(backendRelationships);
      if (currentUser.role === 'psychologist') {
        setAppointmentWaitlist(backendWaitlist.map(mapBackendWaitlistToUiWaitlistEntry));
        setAvailability(backendAvailability);
        setAvailabilityDraft(backendAvailability);
        setAvailabilityExceptions(backendAvailabilityExceptions);
      } else {
        setAppointmentWaitlist([]);
        setAvailability([]);
        setAvailabilityDraft([]);
        setAvailabilityExceptions([]);
      }
      if (!recheckedFollowUp && currentUser.role === 'patient' && backendPatients.some(patient => String(patient.id) === String(currentUser.patientId))) {
        void refreshPatientFollowUp(String(currentUser.patientId));
      }
    } catch (error) {
      if (!isCurrent()) return;
      if ([401, 403, 404].includes(error.status)) {
        invalidateClinicalAccess();
        return;
      }
      if (clinicalAccess.current.denied) {
        setErrorCarga('No se pudo comprobar el acceso. El expediente sigue bloqueado; puedes reintentar.');
        return;
      }
      setErrorCarga(error.message || 'No se pudieron cargar los datos del tablero.');
    } finally {
      if (isCurrent()) setCargandoDatos(false);
    }
  }, [currentUser, refreshBackofficeData, refreshPatientFollowUp, beginClinicalOperation, advancePatientRevision, invalidateClinicalAccess]);

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

  useEffect(() => {
    if (currentUser?.role !== 'patient' || !patientProfile) {
      return;
    }

    setPatientInterviewForm(buildInterviewDraftForm(patientProfile, todayDate));
  }, [currentUser, patientProfile, todayDate]);

  const handleLogin = async (credentials) => {
    if (loggingIn) {
      return;
    }

    setLoggingIn(true);
    setLoginError('');
    setRegistrationError('');
    setRegistrationSuccess('');
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setPasswordResetPreview(null);

    try {
      const session = await login(credentials);
      if(session.sessionKind==='restricted') {
        setCurrentUser(null);resetSessionState();onRestrictedSession(session.restrictedToken);return;
      }
      setCurrentUser(session.user);
      resetSessionState();
    } catch (error) {
      setLoginError(error.message || 'No se pudo iniciar sesion.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegisterPatient = async (payload) => {
    if (registeringAccount) {
      return false;
    }

    setRegisteringAccount(true);
    setRegistrationError('');
    setRegistrationSuccess('');
    setLoginError('');
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setPasswordResetPreview(null);

    try {
      await registerPatient(payload);
      setRegistrationSuccess('Si los datos permiten el registro, ya puedes iniciar sesión. Si tienes cuenta, utiliza tu acceso habitual.');
      return true;
    } catch (error) {
      setRegistrationError(patientRegistrationError(error));
      return false;
    } finally {
      setRegisteringAccount(false);
    }
  };

  const handleRegisterPsychologist = async (payload) => {
    if (registeringAccount) {
      return false;
    }

    setRegisteringAccount(true);
    setRegistrationError('');
    setRegistrationSuccess('');
    setLoginError('');
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setPasswordResetPreview(null);

    try {
      await registerPsychologist(payload);
      setRegistrationSuccess('Tu cuenta profesional fue creada y quedo pendiente de revision. Te avisaremos cuando sea aprobada para iniciar sesion.');
      return true;
    } catch (error) {
      setRegistrationError(error.message || 'No se pudo crear la cuenta de psicologo.');
      return false;
    } finally {
      setRegisteringAccount(false);
    }
  };

  const handleRequestPasswordReset = async (payload) => {
    if (resettingPassword) {
      return false;
    }

    setResettingPassword(true);
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setPasswordResetPreview(null);
    setLoginError('');
    setRegistrationError('');

    try {
      const result = await requestPasswordReset(payload);
      setPasswordResetSuccess('Si el correo existe, ya dejamos listo un enlace de recuperacion. En esta fase de desarrollo tambien mostramos una vista previa para probar el flujo sin email.');
      setPasswordResetPreview(result.preview || null);
      return true;
    } catch (error) {
      setPasswordResetError(error.message || 'No se pudo iniciar la recuperacion de acceso.');
      return false;
    } finally {
      setResettingPassword(false);
    }
  };

  const handleConfirmPasswordReset = async (payload) => {
    if (resettingPassword) {
      return false;
    }

    setResettingPassword(true);
    setPasswordResetError('');
    setPasswordResetSuccess('');

    try {
      await confirmPasswordReset(payload);
      setPasswordResetSuccess('La contrasena se actualizo correctamente. Ya puedes iniciar sesion con la nueva clave.');
      setPasswordResetPreview(null);
      return true;
    } catch (error) {
      setPasswordResetError(error.message || 'No se pudo restablecer la contrasena.');
      return false;
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    const endSession = () => {
      setCurrentUser(null);
      resetSessionState();
    };
    const storageChanged = event => {
      if (event.key === 'psicopanel_auth_token' && !event.newValue) endSession();
    };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('psicopanel-session-ended', endSession);
    return () => {
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('psicopanel-session-ended', endSession);
    };
  }, []);

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    resetSessionState();
  };

  const handleReviewPsychologist = async (userId, payload) => {
    if (!isBackoffice || reviewingPsychologistId) {
      return false;
    }

    setReviewingPsychologistId(userId);
    setBackofficeActionError('');

    try {
      const reviewedUser = await reviewPsychologist(userId, payload);
      syncBackofficeUserState(reviewedUser);
      showSuccessFeedback('Solicitud de psicologo actualizada correctamente.');
      return true;
    } catch (error) {
      setBackofficeActionError(error.message || 'No se pudo actualizar la revision del psicologo.');
      return false;
    } finally {
      setReviewingPsychologistId(null);
    }
  };

  const syncCareRelationshipState = (nextRelationship) => {
    setCareRelationships((currentRelationships) => {
      const existingRelationshipIndex = currentRelationships.findIndex((relationship) => relationship.id === nextRelationship.id);

      if (existingRelationshipIndex === -1) {
        return [nextRelationship, ...currentRelationships];
      }

      return currentRelationships.map((relationship) => (relationship.id === nextRelationship.id ? nextRelationship : relationship));
    });
  };

  const handleCreateCareRelationship = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isBackoffice || processingRelationshipId) {
      return false;
    }

    setProcessingRelationshipId('new');
    setBackofficeActionError('');

    try {
      const relationship = await createCareRelationship(payload);
      if (!isCurrent()) return false;
      syncCareRelationshipState(relationship);
      showSuccessFeedback('Relacion paciente-psicologo creada correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setBackofficeActionError(error.message || 'No se pudo crear la relacion paciente-psicologo.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcessingRelationshipId(null);
      }
    }
  };

  const handleUpdateCareRelationship = async (relationshipId, payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isBackoffice || processingRelationshipId) {
      return false;
    }

    setProcessingRelationshipId(relationshipId);
    setBackofficeActionError('');

    try {
      const relationship = await updateCareRelationship(relationshipId, payload);
      if (!isCurrent()) return false;
      syncCareRelationshipState(relationship);
      showSuccessFeedback('Relacion paciente-psicologo actualizada correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setBackofficeActionError(error.message || 'No se pudo actualizar la relacion paciente-psicologo.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcessingRelationshipId(null);
      }
    }
  };

  const handleRequestCareRelationship = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (currentUser?.role !== 'patient' || processingRelationshipId) {
      return false;
    }

    setProcessingRelationshipId('request');
    setRelationshipActionError('');

    try {
      const relationship = await requestCareRelationship(payload);
      if (!isCurrent()) return false;
      syncCareRelationshipState(relationship);
      showSuccessFeedback('Solicitud enviada al psicologo. Quedara pendiente hasta que la revise.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setRelationshipActionError(error.message || 'No se pudo enviar la solicitud de vinculo.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcessingRelationshipId(null);
      }
    }
  };

  const handleInviteCareRelationship = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (currentUser?.role !== 'psychologist' || processingRelationshipId) {
      return false;
    }

    setProcessingRelationshipId('invite');
    setRelationshipActionError('');
    setRelationshipInvitePreview(null);

    try {
      const relationship = await inviteCareRelationship(payload);
      if (!isCurrent()) return false;
      syncCareRelationshipState(relationship);
      setRelationshipInvitePreview(relationship.invitePreview || null);
      showSuccessFeedback('Invitacion enviada al paciente para vincular su expediente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setRelationshipActionError(error.message || 'No se pudo enviar la invitacion al paciente.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcessingRelationshipId(null);
      }
    }
  };

  const handleRespondToCareRelationship = async (relationshipId, payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!['patient', 'psychologist'].includes(currentUser?.role || '') || processingRelationshipId) {
      return false;
    }

    setProcessingRelationshipId(relationshipId);
    setRelationshipActionError('');

    try {
      const relationship = await respondToCareRelationship(relationshipId, payload);
      if (!isCurrent()) return false;
      syncCareRelationshipState(relationship);

      if (currentUser?.role === 'psychologist' && payload.status === 'active') {
        try {
          const refreshedPatients = await getPatients();
          if (!isCurrent()) return false;
          setPacientes(refreshedPatients.map(mapBackendPatientToUiPatient));
        } catch (error) {
          if (!isCurrent()) return false;
          if ([403, 404].includes(error.status)) {
            invalidateClinicalAccess();
            return false;
          }
          // Keep current state if background refresh fails.
        }
      }

      showSuccessFeedback(
        payload.status === 'active'
          ? 'Vinculo confirmado correctamente.'
          : 'Solicitud de vinculo rechazada.',
      );
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setRelationshipActionError(error.message || 'No se pudo responder la solicitud de vinculo.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcessingRelationshipId(null);
      }
    }
  };

  const handleAcceptCareRelationshipByCode = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (currentUser?.role !== 'patient' || processingRelationshipId) {
      return false;
    }

    setProcessingRelationshipId('accept-code');
    setRelationshipActionError('');

    try {
      const relationship = await acceptCareRelationshipByCode(payload);
      if (!isCurrent()) return false;
      syncCareRelationshipState(relationship);
      showSuccessFeedback('Invitacion aceptada correctamente. El vinculo clinico ya quedo activo.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setRelationshipActionError(error.message || 'No se pudo aceptar el codigo de invitacion.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcessingRelationshipId(null);
      }
    }
  };

  const syncPatientState = (patientOrId, transform) => {
    const id = transform ? patientOrId : patientOrId.id;
    const update = patient => clinicalAccess.current.denied ? patient :
      transform ? transform(patient) : preservePatientActivity(patient, patientOrId, true);
    setPacientes(previous => previous.map(patient => patient.id === id ? update(patient) : patient));
    setPacienteSeleccionado(previous => previous?.id === id ? update(previous) : previous);
  };

  const syncAppointmentsState = (updater) => {
    setAppointments((currentAppointments) => sortAppointments(typeof updater === 'function' ? updater(currentAppointments) : updater));
  };

  const syncBackofficeUserState = (nextUser) => {
    setBackofficeUsers((currentUsers) => {
      const existingUserIndex = currentUsers.findIndex((user) => user.id === nextUser.id);

      if (existingUserIndex === -1) {
        return [nextUser, ...currentUsers];
      }

      return currentUsers.map((user) => (user.id === nextUser.id ? nextUser : user));
    });
    setPendingPsychologists((currentPendingUsers) => currentPendingUsers.filter((user) => user.id !== nextUser.id));
  };

  const refreshSelectedPatient = async (patientId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return null;
    const revision = patientRevisions.current.get(patientId) || 0;
    try {
      const refreshedPatient = await getPatient(patientId);
      if (!isCurrent()) return null;
      const uiPatient = mapBackendPatientToUiPatient(refreshedPatient);
      const preserveActivity = revision !== (patientRevisions.current.get(patientId) || 0);
      advancePatientRevision(patientId);
      syncPatientState(patientId, previous => preservePatientActivity(previous, uiPatient, preserveActivity));
      if (currentUser?.role === 'patient') void refreshPatientFollowUp(patientId);
      return uiPatient;
    } catch (error) {
      if (isCurrent() && [401, 403, 404].includes(error.status)) invalidateClinicalAccess();
      throw error;
    }
  };

  const refreshAppointmentsAndWaitlist = useCallback(async () => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!currentUser) {
      return;
    }

    const requests = [getAppointments()];

    if (currentUser.role === 'psychologist') {
      requests.push(getAppointmentWaitlist());
    }

    try {
      const [backendAppointments, backendWaitlist = []] = await Promise.all(requests);
      if (!isCurrent()) return false;
      setAppointments(sortAppointments(backendAppointments.map(mapBackendAppointmentToUiAppointment)));

      if (currentUser.role === 'psychologist') {
        setAppointmentWaitlist(backendWaitlist.map(mapBackendWaitlistToUiWaitlistEntry));
      } else {
        setAppointmentWaitlist([]);
      }
    } catch (error) {
      if (!isCurrent()) return false;
      if ([403, 404].includes(error.status)) invalidateClinicalAccess();
      // Keep current state if this background refresh fails.
    }
  }, [currentUser, beginClinicalOperation, invalidateClinicalAccess]);

  const refreshReminders = async () => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!currentUser) {
      return;
    }

    try {
      const nextReminders = await getMyReminders();
      if (!isCurrent()) return false;
      setReminders(nextReminders);
    } catch (error) {
      if (!isCurrent()) return false;
      if ([403, 404].includes(error.status)) invalidateClinicalAccess();
      // Keep the current reminders on screen if the refresh fails.
    }
  };

  const abrirNotas = (paciente, options = {}) => {
    if (clinicalAccess.current.denied) return;
    const pacienteActualizado = pacientes.find((currentPatient) => currentPatient.id === paciente.id) || paciente;
    setPacienteSeleccionado(pacienteActualizado);
    setSessionDraftAppointmentId(options.appointmentId || null);
    setSessionActionError('');
    setNotasTemp(pacienteActualizado.notas || '');
    setVistaActiva('notas');
  };

  const abrirAgenda = (date = '') => {
    setAppointmentsViewContext({ date, nonce: Date.now() });
    setVistaActiva('appointments');
  };

  const handleInputChange = (e) => {
    const { name, type, checked, value } = e.target;
    setNuevoPacienteForm({ ...nuevoPacienteForm, [name]: type === 'checkbox' ? checked : value });
  };

  const guardarNuevoPaciente = async (e) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
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
      if (!isCurrent()) return false;

      setPacientes((currentPatients) => [...currentPatients, mapBackendPatientToUiPatient(createdPatient)]);
      setNuevoPacienteForm({ nombre: '', edad: '', motivo: '', riesgo: 'sin riesgo' });
      setMostrarModalNuevoPaciente(false);
      showSuccessFeedback('Paciente creado correctamente.');
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudo crear el paciente.');
    } finally {
      if (isCurrent()) {
        setGuardandoPaciente(false);
      }
    }
  };

  const guardarNotas = async () => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || guardandoNotas) {
      return;
    }

    const patientToUpdate = pacientes.find((patient) => patient.id === pacienteSeleccionado.id) || pacienteSeleccionado;

    setGuardandoNotas(true);

    try {
      const updatedApiPatient = await updatePatient(
        patientToUpdate.id,
        { notes: notasTemp },
      );
      if (!isCurrent()) return false;

      const updatedPatient = mapBackendPatientToUiPatient(updatedApiPatient);
      syncPatientState(updatedPatient);
      setNotasTemp(updatedApiPatient.notes || '');
      showSuccessFeedback('Expediente actualizado correctamente.');
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudieron guardar las notas.');
    } finally {
      if (isCurrent()) {
        setGuardandoNotas(false);
      }
    }
  };

  const actualizarPerfilPaciente = async (changes) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || guardandoPerfilPaciente) {
      return false;
    }

    const patientToUpdate = pacientes.find((patient) => patient.id === pacienteSeleccionado.id) || pacienteSeleccionado;
    setGuardandoPerfilPaciente(true);

    try {
      const updatedApiPatient = await updatePatient(
        patientToUpdate.id,
        (() => {
          const mapped = mapUiPatientToBackendPatient({ ...patientToUpdate, ...changes });
          if (!isCurrent()) return false;
          return { riskLevel: mapped.riskLevel, status: mapped.status, reasonForConsultation: mapped.reasonForConsultation };
        })(),
      );

      const updatedPatient = mapBackendPatientToUiPatient(updatedApiPatient);
      syncPatientState(updatedPatient);
      showSuccessFeedback('Ficha del paciente actualizada.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudo actualizar la ficha del paciente.');
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoPerfilPaciente(false);
      }
    }
  };

  const handleIdentityUpdated = ({ firstName, lastName }) => {
    if (currentUser?.role !== 'patient') return;
    const nombre = (firstName + ' ' + lastName).trim();
    setCurrentUser(current => ({ ...current, firstName, lastName, fullName: nombre }));
    setPacientes(current => current.map(patient => patient.id === currentUser.patientId ? { ...patient, nombre } : patient));
    setPacienteSeleccionado(current => current?.id === currentUser.patientId ? { ...current, nombre } : current);
  };

  const handleInterviewFieldChange = (field, value) => {
    setPatientInterviewForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleInterviewIndicatorToggle = (indicatorKey) => {
    setPatientInterviewForm((currentForm) => ({
      ...currentForm,
      indicadores: {
        ...currentForm.indicadores,
        [indicatorKey]: !currentForm.indicadores?.[indicatorKey],
      },
    }));
  };

  const saveInterview = async (patientId, interviewForm) => {
    if (!patientId || guardandoEntrevista) {
      return false;
    }

    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    setGuardandoEntrevista(true);

    try {
      const updatedApiPatient = await upsertPatientInterview(patientId, mapUiInterviewToBackendInterview(interviewForm));
      // The PUT is confirmed even if this session ends before its response arrives.
      if (!isCurrent()) return true;
      const updatedPatient = mapBackendPatientToUiPatient(updatedApiPatient);
      syncPatientState(updatedPatient);

      if (currentUser?.role === 'patient' && currentUser.patientId === patientId) {
        setPatientInterviewForm(buildInterviewDraftForm(updatedPatient, todayDate));
      }

      showSuccessFeedback('Entrevista guardada correctamente.');
      if (currentUser?.role === 'patient') void refreshPatientFollowUp(patientId);
      return true;
    } catch (error) {
      const details = Array.isArray(error?.details) && error.details.length > 0 ? `\n\n${error.details.join('\n')}` : '';
      if (isCurrent()) showErrorFeedback((error.message || 'No se pudo guardar la entrevista.') + details);
      return false;
    } finally {
      if (isCurrent()) setGuardandoEntrevista(false);
    }
  };

  const handleSaveRequiredInterview = async () => {
    if (!patientProfile) {
      return;
    }

    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return;
    const patientId = patientProfile.id;
    const wasSaved = await saveInterview(patientId, patientInterviewForm);
    if (wasSaved && isCurrent()) setShowPatientInterview(false);
  };

  const toggleTask = async (taskId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!pacienteSeleccionado || procesandoTareaId) {
      return;
    }

    const task = pacienteSeleccionado.tareas.find((currentTask) => currentTask.id === taskId);

    if (!task) {
      return;
    }

    const patientId = pacienteSeleccionado.id;
    advancePatientRevision(patientId);
    setProcesandoTareaId(taskId);

    try {
      const updatedTask = await updatePatientTask(patientId, taskId, {
        completed: !task.completada,
      });
      if (!isCurrent()) return false;

      const uiTask = mapBackendTaskToUiTask(updatedTask);
      advancePatientRevision(patientId);
      syncPatientState(patientId, patient => ({
        ...patient,
        tareas: patient.tareas.map(currentTask => currentTask.id === taskId ? uiTask : currentTask),
      }));
      await refreshReminders();
      if (!isCurrent()) return false;
    } catch (error) {
      if (!isCurrent()) return false;
      advancePatientRevision(patientId);
      showErrorFeedback(error.message || 'No se pudo actualizar la tarea.');
    } finally {
      if (isCurrent()) {
        setProcesandoTareaId(null);
      }
    }
  };

  const removeTask = async (taskId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || procesandoTareaId) {
      return;
    }

    setProcesandoTareaId(taskId);

    try {
      await deletePatientTask(pacienteSeleccionado.id, taskId);
      if (!isCurrent()) return false;

      syncPatientState(pacienteSeleccionado.id, patient => ({
        ...patient, tareas: patient.tareas.filter(task => task.id !== taskId),
      }));
      await refreshReminders();
      if (!isCurrent()) return false;
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudo retirar la tarea.');
    } finally {
      if (isCurrent()) {
        setProcesandoTareaId(null);
      }
    }
  };

  const addObjective = async (objectiveText) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || creandoObjetivo) {
      return false;
    }

    setCreandoObjetivo(true);

    try {
      const createdObjective = await createPatientObjective(pacienteSeleccionado.id, { text: objectiveText });
      if (!isCurrent()) return false;
      const uiObjective = mapBackendTaskToUiTask(createdObjective);
      syncPatientState(pacienteSeleccionado.id, patient => ({
        ...patient, objetivos: [...(patient.objetivos || []), uiObjective],
      }));
      showSuccessFeedback('Objetivo agregado correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudo crear el objetivo.');
      return false;
    } finally {
      if (isCurrent()) {
        setCreandoObjetivo(false);
      }
    }
  };

  const toggleObjective = async (objectiveId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || procesandoObjetivoId) {
      return;
    }

    const objective = (pacienteSeleccionado.objetivos || []).find((currentObjective) => currentObjective.id === objectiveId);

    if (!objective) {
      return;
    }

    setProcesandoObjetivoId(objectiveId);

    try {
      const updatedObjective = await updatePatientObjective(pacienteSeleccionado.id, objectiveId, {
        completed: !objective.completada,
      });
      if (!isCurrent()) return false;

      const uiObjective = mapBackendTaskToUiTask(updatedObjective);
      syncPatientState(pacienteSeleccionado.id, patient => ({
        ...patient, objetivos: (patient.objetivos || []).map(objective => objective.id === objectiveId ? uiObjective : objective),
      }));
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudo actualizar el objetivo.');
    } finally {
      if (isCurrent()) {
        setProcesandoObjetivoId(null);
      }
    }
  };

  const removeObjective = async (objectiveId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || procesandoObjetivoId) {
      return;
    }

    setProcesandoObjetivoId(objectiveId);

    try {
      await deletePatientObjective(pacienteSeleccionado.id, objectiveId);
      if (!isCurrent()) return false;

      syncPatientState(pacienteSeleccionado.id, patient => ({
        ...patient, objetivos: (patient.objetivos || []).filter(objective => objective.id !== objectiveId),
      }));
      showSuccessFeedback('Objetivo retirado; su registro se conserva.');
    } catch (error) {
      if (!isCurrent()) return false;
      showErrorFeedback(error.message || 'No se pudo retirar el objetivo.');
    } finally {
      if (isCurrent()) {
        setProcesandoObjetivoId(null);
      }
    }
  };

  const createSession = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || guardandoSesion) {
      return false;
    }

    setGuardandoSesion(true);
    setSessionActionError('');

    try {
      await createPatientClinicalNote(pacienteSeleccionado.id, payload);
      if (!isCurrent()) return false;
      await refreshSelectedPatient(pacienteSeleccionado.id);
      if (!isCurrent()) return false;
      setSessionActionError('');
      showSuccessFeedback('Nota clinica creada correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const details = Array.isArray(error?.details) && error.details.length > 0 ? `\n\n${error.details.join('\n')}` : '';
      setSessionActionError((error.message || 'No se pudo crear la nota clinica.') + details);
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoSesion(false);
      }
    }
  };

  const updateSession = async (sessionId, payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !pacienteSeleccionado || guardandoSesion) {
      return false;
    }

    setGuardandoSesion(true);
    setSessionActionError('');

    try {
      await updatePatientClinicalNote(pacienteSeleccionado.id, sessionId, payload);
      if (!isCurrent()) return false;
      await refreshSelectedPatient(pacienteSeleccionado.id);
      if (!isCurrent()) return false;
      setSessionActionError('');
      showSuccessFeedback('Nota clinica actualizada correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const details = Array.isArray(error?.details) && error.details.length > 0 ? `\n\n${error.details.join('\n')}` : '';
      setSessionActionError((error.message || 'No se pudo actualizar la nota clinica.') + details);
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoSesion(false);
      }
    }
  };

  const handleCreateAppointment = async (appointmentForm) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || guardandoCita) {
      return false;
    }

    setGuardandoCita(true);
    setAppointmentActionError('');

    try {
      const createdAppointment = await createAppointment(mapUiAppointmentToBackendAppointment(appointmentForm));
      if (!isCurrent()) return false;
      const uiAppointment = mapBackendAppointmentToUiAppointment(createdAppointment);
      syncAppointmentsState((currentAppointments) => [...currentAppointments, uiAppointment]);
      await refreshAppointmentsAndWaitlist();
      if (!isCurrent()) return false;
      await refreshReminders();
      if (!isCurrent()) return false;
      showSuccessFeedback('Cita creada correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAppointmentActionError(error.message || 'No se pudo crear la cita.');
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoCita(false);
      }
    }
  };

  const handleUpdateAppointment = async (appointmentId, appointmentForm) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || guardandoCita) {
      return false;
    }

    setGuardandoCita(true);
    setProcesandoCitaId(appointmentId);
    setAppointmentActionError('');

    try {
      const updatedAppointment = await updateAppointment(appointmentId, mapUiAppointmentToBackendAppointment(appointmentForm));
      if (!isCurrent()) return false;
      const uiAppointment = mapBackendAppointmentToUiAppointment(updatedAppointment);
      syncAppointmentsState((currentAppointments) =>
        currentAppointments.map((appointment) => (appointment.id === appointmentId ? uiAppointment : appointment)),
      );
      await refreshAppointmentsAndWaitlist();
      if (!isCurrent()) return false;
      await refreshReminders();
      if (!isCurrent()) return false;
      showSuccessFeedback('Cita actualizada correctamente.');
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAppointmentActionError(error.message || 'No se pudo actualizar la cita.');
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoCita(false);
        setProcesandoCitaId(null);
      }
    }
  };

  const handleCancelFutureRecurringAppointments = async (appointmentId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || procesandoCitaId) {
      return false;
    }

    setProcesandoCitaId(appointmentId);
    setAppointmentActionError('');

    try {
      await cancelFutureRecurringAppointments(appointmentId);
      if (!isCurrent()) return false;
      showSuccessFeedback('Citas canceladas; sus registros se conservan.');
      await refreshAppointmentsAndWaitlist();
      if (!isCurrent()) return false;
      await refreshReminders();
      if (!isCurrent()) return false;
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAppointmentActionError(error.message || 'No se pudieron cancelar las citas futuras de la recurrencia.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcesandoCitaId(null);
      }
    }
  };

  const handleUpdateAppointmentStatus = async (appointment, nextStatus) => {
    if (!appointment) {
      return false;
    }

    return handleUpdateAppointment(appointment.id, {
      ...appointment,
      estado: nextStatus,
    });
  };

  const handleCreateAppointmentWaitlist = async (waitlistForm) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || guardandoListaEspera) {
      return false;
    }

    setGuardandoListaEspera(true);
    setWaitlistActionError('');

    try {
      await createAppointmentWaitlistEntry({
        patientId: waitlistForm.pacienteId,
        scheduledDate: waitlistForm.fecha,
        scheduledTime: waitlistForm.hora24,
        notes: waitlistForm.notas || '',
      });
      if (!isCurrent()) return false;
      await refreshAppointmentsAndWaitlist();
      if (!isCurrent()) return false;
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setWaitlistActionError(error.message || 'No se pudo agregar a lista de espera.');
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoListaEspera(false);
      }
    }
  };

  const handleDeleteAppointmentWaitlist = async (waitlistEntryId) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || procesandoListaEsperaId) {
      return false;
    }

    setProcesandoListaEsperaId(waitlistEntryId);
    setWaitlistActionError('');

    try {
      await deleteAppointmentWaitlistEntry(waitlistEntryId);
      if (!isCurrent()) return false;
      await refreshAppointmentsAndWaitlist();
      if (!isCurrent()) return false;
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setWaitlistActionError(error.message || 'No se pudo eliminar la solicitud de lista de espera.');
      return false;
    } finally {
      if (isCurrent()) {
        setProcesandoListaEsperaId(null);
      }
    }
  };

  const handleReorderAppointmentWaitlist = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || guardandoListaEspera) {
      return false;
    }

    setGuardandoListaEspera(true);
    setWaitlistActionError('');

    try {
      await reorderAppointmentWaitlistEntries({
        scheduledDate: payload.fecha,
        scheduledTime: payload.hora24,
        entryIds: payload.entryIds,
      });
      if (!isCurrent()) return false;
      await refreshAppointmentsAndWaitlist();
      if (!isCurrent()) return false;
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setWaitlistActionError(error.message || 'No se pudo reordenar la lista de espera.');
      return false;
    } finally {
      if (isCurrent()) {
        setGuardandoListaEspera(false);
      }
    }
  };

  const handleOpenSessionFromAppointment = async (appointment, patient) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || !appointment || !patient) {
      return false;
    }

    if (['cancelada', 'no asistio'].includes(appointment.estado)) {
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
      if (!isCurrent()) return false;

      if (!wasUpdated) {
        return false;
      }
    }

    abrirNotas(patient, { appointmentId: appointment.id });
    return true;
  };

  const handleUpdateAvailability = async (entries) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || savingAvailability) {
      return false;
    }

    setSavingAvailability(true);
    setAvailabilityActionError('');

    try {
      const updatedAvailability = await updateMyAvailability(entries);
      if (!isCurrent()) return false;
      setAvailability(updatedAvailability);
      setAvailabilityDraft(updatedAvailability);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAvailabilityActionError(error.message || 'No se pudo actualizar la disponibilidad.');
      return false;
    } finally {
      if (isCurrent()) {
        setSavingAvailability(false);
      }
    }
  };

  const handleUpsertAvailabilityException = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const savedException = await upsertMyAvailabilityException(payload);
      if (!isCurrent()) return false;
      setAvailabilityExceptions((currentExceptions) => {
        const withoutCurrentDate = currentExceptions.filter((exception) => exception.date !== savedException.date);
        return [...withoutCurrentDate, savedException].sort((left, right) => left.date.localeCompare(right.date));
      });
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAvailabilityExceptionActionError(error.message || 'No se pudo guardar la excepcion.');
      return false;
    } finally {
      if (isCurrent()) {
        setSavingAvailabilityException(false);
      }
    }
  };

  const handleDeleteAvailabilityException = async (date) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      await deleteMyAvailabilityException(date);
      if (!isCurrent()) return false;
      setAvailabilityExceptions((currentExceptions) => currentExceptions.filter((exception) => exception.date !== date));
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAvailabilityExceptionActionError(error.message || 'No se pudo eliminar la excepcion.');
      return false;
    } finally {
      if (isCurrent()) {
        setSavingAvailabilityException(false);
      }
    }
  };

  const handleCreateAvailabilityExceptionRange = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const createdExceptions = await createMyUnavailableAvailabilityRange(payload);
      if (!isCurrent()) return false;
      setAvailabilityExceptions((currentExceptions) => {
        const blockedDates = new Set(createdExceptions.map((exception) => exception.date));
        const preservedExceptions = currentExceptions.filter((exception) => !blockedDates.has(exception.date));
        return [...preservedExceptions, ...createdExceptions].sort((left, right) => left.date.localeCompare(right.date));
      });
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAvailabilityExceptionActionError(error.message || 'No se pudo bloquear el periodo.');
      return false;
    } finally {
      if (isCurrent()) {
        setSavingAvailabilityException(false);
      }
    }
  };

  const handleUpdateAvailabilityExceptionRange = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const updatedExceptions = await updateMyUnavailableAvailabilityRange(payload);
      if (!isCurrent()) return false;
      setAvailabilityExceptions((currentExceptions) => {
        const currentRangeDates = new Set(buildDateRangeStrings(payload.currentStartDate, payload.currentEndDate));
        const preservedExceptions = currentExceptions.filter((exception) => !currentRangeDates.has(exception.date));
        return [...preservedExceptions, ...updatedExceptions].sort((left, right) => left.date.localeCompare(right.date));
      });
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAvailabilityExceptionActionError(error.message || 'No se pudo actualizar el periodo bloqueado.');
      return false;
    } finally {
      if (isCurrent()) {
        setSavingAvailabilityException(false);
      }
    }
  };

  const handleDeleteAvailabilityExceptionRange = async (payload) => {
    const isCurrent = beginClinicalOperation();
    if (!isCurrent()) return false;
    if (!isPsychologist || savingAvailabilityException) {
      return false;
    }

    setSavingAvailabilityException(true);
    setAvailabilityExceptionActionError('');

    try {
      const deletedRange = await deleteMyUnavailableAvailabilityRange(payload);
      if (!isCurrent()) return false;
      const deletedDates = new Set(deletedRange.deletedDates || []);
      setAvailabilityExceptions((currentExceptions) => currentExceptions.filter((exception) => !deletedDates.has(exception.date)));
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setAvailabilityExceptionActionError(error.message || 'No se pudo desbloquear el periodo.');
      return false;
    } finally {
      if (isCurrent()) {
        setSavingAvailabilityException(false);
      }
    }
  };

  const renderMainContent = () => {
    if(vistaActiva==='professional-profile' && currentUser?.role==='psychologist')return <ProfessionalProfileScreen/>;
    if(vistaActiva==='professional-reviews' && ['admin','superadmin'].includes(currentUser?.role))return <ProfessionalReviewScreen/>;
    if (cargandoDatos) {
      return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800">Sincronizando tu espacio de trabajo</h2>
          <p className="mt-2 text-sm text-gray-500">Estamos consultando pacientes, agenda y recordatorios para dejar el tablero al dia.</p>
        </div>
      );
    }

    if (errorCarga) {
      return (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800">No pudimos sincronizar la informacion</h2>
          <p className="mt-2 text-sm text-gray-500">{errorCarga}</p>
          <p className="mt-1 text-sm text-gray-500">Puedes reintentar sin perder tu sesion actual.</p>
          <button onClick={() => cargarDatos({ recheckAccess: true })} className="mt-4 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium">
            Reintentar
          </button>
        </div>
      );
    }

    if (vistaActiva === 'dashboard') {
      if (isBackoffice) {
        return (
          <BackofficeScreen
            section="overview"
            currentUser={currentUser}
            users={backofficeUsers}
            pendingPsychologists={pendingPsychologists}
            relationships={careRelationships}
            auditLogs={auditLogs}
            onReviewPsychologist={handleReviewPsychologist}
            onCreateCareRelationship={handleCreateCareRelationship}
            onUpdateCareRelationship={handleUpdateCareRelationship}
            reviewingPsychologistId={reviewingPsychologistId}
            processingRelationshipId={processingRelationshipId}
            actionError={backofficeActionError}
            onDismissActionError={() => setBackofficeActionError('')}
          />
        );
      }

      return (
        <DashboardScreen
          currentUser={currentUser}
          patients={pacientes}
          appointments={isPsychologist ? todayAppointments : appointments}
          reminders={reminders}
          careRelationships={careRelationships}
          relationshipInvitePreview={relationshipInvitePreview}
          onOpenPatient={abrirNotas}
          onCompleteInterview={() => setShowPatientInterview(true)}
          onNewPatient={() => setMostrarModalNuevoPaciente(true)}
          onViewAppointments={() => abrirAgenda(isPsychologist ? todayDate : '')}
          onRetryFollowUp={refreshPatientFollowUp}
          onToggleTask={toggleTask}
          onRequestCareRelationship={handleRequestCareRelationship}
          onInviteCareRelationship={handleInviteCareRelationship}
          onRespondToCareRelationship={handleRespondToCareRelationship}
          onAcceptCareRelationshipByCode={handleAcceptCareRelationshipByCode}
          processingTaskId={procesandoTareaId}
          processingRelationshipId={processingRelationshipId}
          relationshipActionError={relationshipActionError}
          onDismissRelationshipError={() => setRelationshipActionError('')}
        />
      );
    }

    if (vistaActiva === 'appointments') {
      if (isBackoffice) {
        return (
          <BackofficeScreen
            section="pending"
            currentUser={currentUser}
            users={backofficeUsers}
            pendingPsychologists={pendingPsychologists}
            relationships={careRelationships}
            auditLogs={auditLogs}
            onReviewPsychologist={handleReviewPsychologist}
            onCreateCareRelationship={handleCreateCareRelationship}
            onUpdateCareRelationship={handleUpdateCareRelationship}
            reviewingPsychologistId={reviewingPsychologistId}
            processingRelationshipId={processingRelationshipId}
            actionError={backofficeActionError}
            onDismissActionError={() => setBackofficeActionError('')}
          />
        );
      }

      return (
        <AppointmentsScreen
          key={`appointments-${appointmentsViewContext.nonce || 'default'}-${currentUser?.id || 'anonymous'}`}
          viewContext={appointmentsViewContext}
          currentUser={currentUser}
          patients={pacientes}
          appointments={appointments}
          waitlistEntries={appointmentWaitlist}
          availability={availability}
          availabilityDraft={availabilityDraft}
          availabilityExceptions={availabilityExceptions}
          todayDate={todayDate}
          onOpenPatient={abrirNotas}
          onOpenAppointmentSession={handleOpenSessionFromAppointment}
          onCreateAppointment={handleCreateAppointment}
          onUpdateAppointment={handleUpdateAppointment}
          onCancelFutureRecurringAppointments={handleCancelFutureRecurringAppointments}
          onCreateAppointmentWaitlist={handleCreateAppointmentWaitlist}
          onDeleteAppointmentWaitlist={handleDeleteAppointmentWaitlist}
          onReorderAppointmentWaitlist={handleReorderAppointmentWaitlist}
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
          isSavingWaitlist={guardandoListaEspera}
          processingWaitlistId={procesandoListaEsperaId}
          waitlistActionError={waitlistActionError}
          onDismissWaitlistError={() => setWaitlistActionError('')}
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
      if (isBackoffice) {
        return (
          <BackofficeScreen
            section="users"
            currentUser={currentUser}
            users={backofficeUsers}
            pendingPsychologists={pendingPsychologists}
            relationships={careRelationships}
            auditLogs={auditLogs}
            onReviewPsychologist={handleReviewPsychologist}
            onCreateCareRelationship={handleCreateCareRelationship}
            onUpdateCareRelationship={handleUpdateCareRelationship}
            reviewingPsychologistId={reviewingPsychologistId}
            processingRelationshipId={processingRelationshipId}
            actionError={backofficeActionError}
            onDismissActionError={() => setBackofficeActionError('')}
          />
        );
      }

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
          onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
          notesTemp={notasTemp}
          setNotesTemp={setNotasTemp}
          onSaveNotes={guardarNotas}
          onRetryFollowUp={refreshPatientFollowUp}
          onToggleTask={toggleTask}
          onDeleteTask={removeTask}
          onToggleObjective={toggleObjective}
          onDeleteObjective={removeObjective}
          onAddObjective={addObjective}
          onCreateSession={createSession}
          onUpdateSession={updateSession}
          onSaveInterview={saveInterview}
          onStartPatientInterview={careRelationships.some(r => r.status === 'active') ? () => setShowPatientInterview(true) : null}
          sessionActionError={sessionActionError}
          onDismissSessionActionError={() => setSessionActionError('')}
          isSavingNotes={guardandoNotas}
          isSavingPatientProfile={guardandoPerfilPaciente}
          isSavingSession={guardandoSesion}
          isSavingInterview={guardandoEntrevista}
          processingTaskId={procesandoTareaId}
          isCreatingObjective={creandoObjetivo}
          processingObjectiveId={procesandoObjetivoId}
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
    return (
      <LoginScreen
        onLogin={handleLogin}
        onRegisterPatient={handleRegisterPatient}
        onRegisterPsychologist={handleRegisterPsychologist}
        isSubmitting={loggingIn}
        isRegistering={registeringAccount}
        onRequestPasswordReset={handleRequestPasswordReset}
        onConfirmPasswordReset={handleConfirmPasswordReset}
        isResetting={resettingPassword}
        error={loginError}
        registrationError={registrationError}
        registrationSuccess={registrationSuccess}
        passwordResetError={passwordResetError}
        passwordResetSuccess={passwordResetSuccess}
        passwordResetPreview={passwordResetPreview}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900 relative pb-20 md:pb-0">
      {uiFeedback && (
        <div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex justify-center md:justify-end">
          <div className={`pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 shadow-xl ${
            uiFeedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <p className="whitespace-pre-wrap text-sm leading-6">{uiFeedback.message}</p>
              <button
                type="button"
                onClick={() => setUiFeedback(null)}
                className="shrink-0 rounded-full border border-current/15 px-2 py-1 text-xs font-semibold transition hover:bg-white/50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="p-4 md:p-8">
          {currentUser?.role === 'patient' && <IdentityPanel onIdentityUpdated={handleIdentityUpdated} />}
          {renderMainContent()}
        </div>
      </main>

      {showPatientInterview && currentUser?.role === 'patient' && patientProfile && !patientProfile.entrevistaCompleta && careRelationships.some(r => r.status === 'active') && (
        <PatientInterviewModal
          patient={patientProfile}
          form={patientInterviewForm}
          onChange={handleInterviewFieldChange}
          onToggleIndicator={handleInterviewIndicatorToggle}
          onSubmit={handleSaveRequiredInterview}
          isSubmitting={guardandoEntrevista}
          title="Entrevista inicial"
          description="Puedes completar la entrevista de tu atención histórica y volver a tus funciones personales en cualquier momento. Guardarla no activa un episodio nuevo."
          allowClose
          onClose={() => setShowPatientInterview(false)}
        />
      )}
    </div>
  );
}
