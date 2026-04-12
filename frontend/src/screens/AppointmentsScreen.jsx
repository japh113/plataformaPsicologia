import React, { useCallback, useMemo, useState } from 'react';
import { Calendar, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Repeat2, Save, Trash2, Users, X } from 'lucide-react';
import {
  addDaysToDateString,
  buildAppointmentSlotKey,
  buildBlockedRanges,
  buildRecurringEndDateOptions,
  createDefaultExceptionBlock,
  createEmptyExceptionForm,
  emptyForm,
  emptyWaitlistForm,
  formatAppointmentDisplayHour,
  formatBlockedRangeLabel,
  formatExceptionDate,
  getAppointmentAccent,
  getAppointmentDateTime,
  getAppointmentDisplayStatus,
  getAppointmentHourOptions,
  getAppointmentSessionLabel,
  getAppointmentSessionState,
  getCalendarGroupContainerClasses,
  getDayNumberBadge,
  getExceptionCellAccent,
  getExceptionDotClasses,
  getExceptionPillClasses,
  getMiniAppointmentChip,
  getMonthDates,
  getMonthLabel,
  getMonthWeekdayHeaders,
  getRangeDayCount,
  getRecurringOccurrencesCount,
  getSessionBadgeClasses,
  getSessionIndicatorClasses,
  getStatusBadge,
  getVisibleCalendarAppointments,
  getWaitlistBadgeClasses,
  getWaitlistCountDotClasses,
  getWeekDates,
  getWeekdayFromDateString,
  getWeekRangeLabel,
  groupCalendarAppointmentsBySlot,
  isAppointmentOverdue,
  normalizeBlocks,
  normalizeDraftEntries,
  normalizeExceptionForm,
  shiftDateByDays,
  shiftDateByMonths,
  sortCalendarDayAppointments,
  weekdayLabels,
} from './appointmentsScreen.helpers';

function ModalShell({ title, description, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export default function AppointmentsScreen({
  viewContext,
  currentUser, patients, appointments, waitlistEntries = [], availability, availabilityDraft, availabilityExceptions, todayDate, onOpenPatient, onOpenAppointmentSession, onCreateAppointment, onUpdateAppointment, onDeleteAppointment, onDeleteFutureRecurringAppointments, onCreateAppointmentWaitlist, onDeleteAppointmentWaitlist, onReorderAppointmentWaitlist, onUpdateAvailability, onChangeAvailabilityDraft, onUpsertAvailabilityException, onCreateAvailabilityExceptionRange, onUpdateAvailabilityExceptionRange, onDeleteAvailabilityExceptionRange, onDeleteAvailabilityException,
  isSavingAppointment = false, processingAppointmentId = null, appointmentActionError = '', onDismissAppointmentError, isSavingWaitlist = false, processingWaitlistId = null, waitlistActionError = '', onDismissWaitlistError, isSavingAvailability = false, availabilityActionError = '', onDismissAvailabilityError, isSavingAvailabilityException = false, availabilityExceptionActionError = '', onDismissAvailabilityExceptionError,
}) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const initialFocusedDate = viewContext?.date || todayDate;
  const initialSelectedDate = typeof viewContext?.date !== 'undefined' ? viewContext.date : (isPsychologist ? todayDate : '');
  const [selectedDate, setSelectedDate] = useState(() => initialSelectedDate);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [sessionCoverageFilter, setSessionCoverageFilter] = useState('todos');
  const [patientTimelineFilter, setPatientTimelineFilter] = useState('todos');
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(initialFocusedDate);
  const [calendarView, setCalendarView] = useState('week');
  const [hoveredDate, setHoveredDate] = useState('');
  const [editingExceptionDate, setEditingExceptionDate] = useState('');
  const [exceptionForm, setExceptionForm] = useState(createEmptyExceptionForm());
  const [exceptionRangeForm, setExceptionRangeForm] = useState({ startDate: todayDate, endDate: todayDate });
  const [editingExceptionRange, setEditingExceptionRange] = useState(null);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isExceptionsModalOpen, setIsExceptionsModalOpen] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState(emptyWaitlistForm);
  const [draggedWaitlistEntryId, setDraggedWaitlistEntryId] = useState(null);
  const [waitlistSchedulingEntry, setWaitlistSchedulingEntry] = useState(null);
  const [waitlistSuccessMessage, setWaitlistSuccessMessage] = useState('');

  const normalizedAvailabilityDraft = useMemo(() => normalizeDraftEntries(availabilityDraft || availability), [availability, availabilityDraft]);
  const availabilityMap = useMemo(() => new Map(normalizedAvailabilityDraft.map((entry) => [entry.weekday, entry.blocks])), [normalizedAvailabilityDraft]);
  const availabilityExceptionsMap = useMemo(
    () => new Map((availabilityExceptions || []).map((exception) => [exception.date, { ...exception, blocks: normalizeBlocks(exception.blocks, `exception-${exception.date}`) }])),
    [availabilityExceptions],
  );
  const blockedExceptionRanges = useMemo(() => buildBlockedRanges(availabilityExceptions), [availabilityExceptions]);
  const datedAvailabilityExceptions = useMemo(() => (availabilityExceptions || []).filter((exception) => !exception.isUnavailable), [availabilityExceptions]);
  const appointmentSessionIds = useMemo(
    () =>
      new Set(
        patients.flatMap((patient) => (patient.sesiones || []).map((session) => session.citaId)).filter(Boolean),
      ),
    [patients],
  );
  const matchesSessionCoverageFilter = useCallback((appointment) => {
    if (sessionCoverageFilter === 'todos') {
      return true;
    }

    const sessionState = getAppointmentSessionState(appointment, appointmentSessionIds.has(appointment.id));
    return sessionCoverageFilter === sessionState;
  }, [appointmentSessionIds, sessionCoverageFilter]);
  const matchesPatientTimelineFilter = useCallback((appointment) => {
    if (isPsychologist || patientTimelineFilter === 'todos') {
      return true;
    }

    const appointmentDateTime = getAppointmentDateTime(appointment);

    if (patientTimelineFilter === 'proximas') {
      return appointmentDateTime >= new Date() && !['cancelada', 'no asistio'].includes(appointment.estado);
    }

    if (patientTimelineFilter === 'historial') {
      return appointmentDateTime < new Date() || ['completada', 'cancelada', 'no asistio'].includes(appointment.estado);
    }

    if (patientTimelineFilter === 'cambios') {
      return ['cancelada', 'no asistio'].includes(appointment.estado);
    }

    return true;
  }, [isPsychologist, patientTimelineFilter]);
  const appointmentsForCalendar = useMemo(
    () =>
      appointments.filter((appointment) => {
        const matchesStatus = statusFilter === 'todos'
          ? true
          : statusFilter === 'pendiente'
            ? ['pendiente', 'por cerrar'].includes(getAppointmentDisplayStatus(appointment))
            : appointment.estado === statusFilter;
        return matchesStatus && matchesSessionCoverageFilter(appointment) && matchesPatientTimelineFilter(appointment);
      }),
    [appointments, matchesPatientTimelineFilter, matchesSessionCoverageFilter, statusFilter],
  );
  const activeSummaryFilter = useMemo(() => {
    if (statusFilter === 'completada' && sessionCoverageFilter === 'missing') {
      return 'missing';
    }

    if (statusFilter === 'completada' && sessionCoverageFilter === 'registered') {
      return 'registered';
    }

    if (statusFilter === 'pendiente' && sessionCoverageFilter === 'todos') {
      return 'pending';
    }

    return 'none';
  }, [sessionCoverageFilter, statusFilter]);
  const hasActiveFilters = Boolean(selectedDate) || statusFilter !== 'todos' || sessionCoverageFilter !== 'todos' || patientTimelineFilter !== 'todos';
  const weekDates = useMemo(() => getWeekDates(calendarAnchorDate), [calendarAnchorDate]);
  const weekRangeLabel = useMemo(() => getWeekRangeLabel(calendarAnchorDate), [calendarAnchorDate]);
  const monthDates = useMemo(() => getMonthDates(calendarAnchorDate), [calendarAnchorDate]);
  const monthLabel = useMemo(() => getMonthLabel(calendarAnchorDate), [calendarAnchorDate]);
  const monthWeekdayHeaders = useMemo(() => getMonthWeekdayHeaders(), []);
  const selectedFormDate = form.fecha || todayDate;
  const editingAppointment = useMemo(
    () => appointments.find((appointment) => appointment.id === editingAppointmentId) || null,
    [appointments, editingAppointmentId],
  );
  const isEditingRecurringAppointment = Boolean(editingAppointment?.recurrenciaGrupoId);
  const recurrenceEndDateOptions = useMemo(() => buildRecurringEndDateOptions(selectedFormDate), [selectedFormDate]);
  const recurrenceOccurrencesCount = useMemo(
    () => getRecurringOccurrencesCount(selectedFormDate, form.recurrenciaHasta),
    [form.recurrenciaHasta, selectedFormDate],
  );
  const selectedWaitlistDate = waitlistForm.fecha || selectedDate || todayDate;

  const selectedDayAvailability = useMemo(() => {
    const exception = availabilityExceptionsMap.get(selectedFormDate);

    if (exception) {
      return {
        source: 'exception',
        isUnavailable: Boolean(exception.isUnavailable),
        blocks: exception.blocks || [],
      };
    }

    const weekday = getWeekdayFromDateString(selectedFormDate);

    return {
      source: 'weekly',
      isUnavailable: false,
      blocks: availabilityMap.get(weekday) || [],
    };
  }, [availabilityExceptionsMap, availabilityMap, selectedFormDate]);
  const selectedFormWeekday = getWeekdayFromDateString(selectedFormDate);
  const selectedDayBlocks = selectedDayAvailability.blocks;
  const requiresActiveSlotChecks = ['pendiente', 'completada'].includes(form.estado);
  const sameDayPatientAppointment = useMemo(
    () =>
      requiresActiveSlotChecks
        ? appointments.find(
          (appointment) =>
            appointment.pacienteId === form.pacienteId &&
            appointment.fecha === selectedFormDate &&
            ['pendiente', 'completada'].includes(appointment.estado) &&
            appointment.id !== editingAppointmentId,
        ) || null
        : null,
    [appointments, editingAppointmentId, form.pacienteId, selectedFormDate, requiresActiveSlotChecks],
  );
  const hasSameDayPatientConflict = Boolean(sameDayPatientAppointment);
  const occupiedHourValues = useMemo(
    () =>
      new Set(
        appointments
          .filter(
            (appointment) =>
              requiresActiveSlotChecks &&
              appointment.fecha === selectedFormDate &&
              ['pendiente', 'completada'].includes(appointment.estado) &&
              appointment.id !== editingAppointmentId,
          )
          .map((appointment) => appointment.hora24),
      ),
    [appointments, editingAppointmentId, requiresActiveSlotChecks, selectedFormDate],
  );

  const hourOptions = useMemo(() => {
    if (hasSameDayPatientConflict) {
      return [];
    }

    const currentHour = form.hora24;
    const blockOptions = selectedDayBlocks
      .flatMap((block) => getAppointmentHourOptions(Number(block.startTime.slice(0, 2)), Number(block.endTime.slice(0, 2)) - 1))
      .filter((option) => !occupiedHourValues.has(option.value));

    if (!currentHour || blockOptions.some((option) => option.value === currentHour)) {
      return blockOptions;
    }

    return [{ value: currentHour, label: `${formatAppointmentDisplayHour(currentHour)} (actual)` }, ...blockOptions];
  }, [form.hora24, hasSameDayPatientConflict, occupiedHourValues, selectedDayBlocks]);
  const normalizedHourValue = hourOptions.some((option) => option.value === form.hora24) ? form.hora24 : '';

  const weeklyAppointments = useMemo(() => {
    const grouped = Object.fromEntries(weekDates.map((weekDate) => [weekDate.isoDate, []]));
    appointmentsForCalendar.forEach((appointment) => { if (grouped[appointment.fecha]) grouped[appointment.fecha].push(appointment); });
    Object.keys(grouped).forEach((dateKey) => {
      grouped[dateKey] = sortCalendarDayAppointments(grouped[dateKey]);
    });
    return grouped;
  }, [appointmentsForCalendar, weekDates]);

  const monthlyAppointments = useMemo(() => {
    const grouped = Object.fromEntries(monthDates.map((monthDate) => [monthDate.isoDate, []]));
    appointmentsForCalendar.forEach((appointment) => { if (grouped[appointment.fecha]) grouped[appointment.fecha].push(appointment); });
    Object.keys(grouped).forEach((dateKey) => {
      grouped[dateKey] = sortCalendarDayAppointments(grouped[dateKey]);
    });
    return grouped;
  }, [appointmentsForCalendar, monthDates]);

  const filteredAppointments = useMemo(() => appointments.filter((appointment) => {
    const matchesDate = selectedDate ? appointment.fecha === selectedDate : true;
    const matchesStatus = statusFilter === 'todos'
      ? true
      : statusFilter === 'pendiente'
        ? ['pendiente', 'por cerrar'].includes(getAppointmentDisplayStatus(appointment))
        : appointment.estado === statusFilter;
    return matchesDate && matchesStatus && matchesSessionCoverageFilter(appointment) && matchesPatientTimelineFilter(appointment);
  }), [appointments, matchesPatientTimelineFilter, matchesSessionCoverageFilter, selectedDate, statusFilter]);
  const waitlistEntriesBySlot = useMemo(() => {
    const nextMap = new Map();

    waitlistEntries.forEach((entry) => {
      const key = buildAppointmentSlotKey(entry.fecha, entry.hora24);
      const currentEntries = nextMap.get(key) || [];
      nextMap.set(key, [...currentEntries, entry]);
    });

    return nextMap;
  }, [waitlistEntries]);
  const waitlistEntriesForSelectedDate = useMemo(
    () =>
      [...waitlistEntries]
        .filter((entry) => entry.fecha === selectedWaitlistDate)
        .sort((left, right) => {
          const slotCompare = `${left.fecha}T${left.hora24}`.localeCompare(`${right.fecha}T${right.hora24}`);
          if (slotCompare !== 0) {
            return slotCompare;
          }

          return String(left.creadaEn || '').localeCompare(String(right.creadaEn || ''));
        }),
    [selectedWaitlistDate, waitlistEntries],
  );
  const waitlistGroupsForSelectedDate = useMemo(() => {
    const groupedBySlot = new Map();

    waitlistEntriesForSelectedDate.forEach((entry) => {
      const currentEntries = groupedBySlot.get(entry.hora24) || [];
      groupedBySlot.set(entry.hora24, [...currentEntries, entry]);
    });

    return [...groupedBySlot.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([hour24, entries]) => {
        const slotAppointments = appointments.filter(
          (appointment) =>
            appointment.fecha === selectedWaitlistDate &&
            appointment.hora24 === hour24 &&
            ['pendiente', 'completada'].includes(appointment.estado),
        );

        return {
          hora24: hour24,
          hora: formatAppointmentDisplayHour(hour24),
          entries: [...entries].sort((left, right) => {
            const priorityCompare = Number(left.prioridad || 0) - Number(right.prioridad || 0);
            if (priorityCompare !== 0) {
              return priorityCompare;
            }

            return String(left.creadaEn || '').localeCompare(String(right.creadaEn || ''));
          }),
          slotAppointments,
        };
      });
  }, [appointments, selectedWaitlistDate, waitlistEntriesForSelectedDate]);
  const waitlistTopPriorityBySlot = useMemo(() => {
    const nextMap = new Map();

    waitlistEntries.forEach((entry) => {
      const slotKey = buildAppointmentSlotKey(entry.fecha, entry.hora24);
      const currentTopEntry = nextMap.get(slotKey);

      if (!currentTopEntry || Number(entry.prioridad || 0) < Number(currentTopEntry.prioridad || 0)) {
        nextMap.set(slotKey, entry);
      }
    });

    return nextMap;
  }, [waitlistEntries]);
  const patientTimelineSummary = useMemo(() => {
    const upcoming = appointments.filter((appointment) => {
      const appointmentDateTime = getAppointmentDateTime(appointment);
      return appointmentDateTime >= new Date() && !['cancelada', 'no asistio'].includes(appointment.estado);
    }).length;

    const history = appointments.filter((appointment) => {
      const appointmentDateTime = getAppointmentDateTime(appointment);
      return appointmentDateTime < new Date() || ['completada', 'cancelada', 'no asistio'].includes(appointment.estado);
    }).length;

    const changed = appointments.filter((appointment) => ['cancelada', 'no asistio'].includes(appointment.estado)).length;

    return {
      upcoming,
      history,
      changed,
    };
  }, [appointments]);
  const occupiedSlotOptions = useMemo(() => {
    const groupedBySlot = new Map();

    appointments
      .filter((appointment) => appointment.fecha === selectedWaitlistDate && ['pendiente', 'completada'].includes(appointment.estado))
      .forEach((appointment) => {
        const currentAppointments = groupedBySlot.get(appointment.hora24) || [];
        groupedBySlot.set(appointment.hora24, [...currentAppointments, appointment]);
      });

    return [...groupedBySlot.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([hour24, slotAppointments]) => {
        const currentWaitlistEntries = waitlistEntriesBySlot.get(buildAppointmentSlotKey(selectedWaitlistDate, hour24)) || [];
        const patientNames = slotAppointments
          .map((appointment) => patients.find((patient) => patient.id === appointment.pacienteId)?.nombre)
          .filter(Boolean)
          .join(' / ');

        return {
          value: hour24,
          label: `${formatAppointmentDisplayHour(hour24)}${patientNames ? ` • ${patientNames}` : ''}${currentWaitlistEntries.length > 0 ? ` • Espera ${currentWaitlistEntries.length}` : ''}`,
        };
      });
  }, [appointments, patients, selectedWaitlistDate, waitlistEntriesBySlot]);
  const waitlistSameDayPatientAppointment = useMemo(
    () =>
      appointments.find(
        (appointment) =>
          appointment.pacienteId === waitlistForm.pacienteId &&
          appointment.fecha === selectedWaitlistDate &&
          ['pendiente', 'completada'].includes(appointment.estado),
      ) || null,
    [appointments, selectedWaitlistDate, waitlistForm.pacienteId],
  );
  const hasWaitlistSameDayConflict = Boolean(waitlistSameDayPatientAppointment);
  const normalizedWaitlistHourValue = occupiedSlotOptions.some((option) => option.value === waitlistForm.hora24) ? waitlistForm.hora24 : '';
  const occupiedSlotSummaries = useMemo(() => {
    const groupedBySlot = new Map();

    appointments
      .filter(
        (appointment) =>
          appointment.fecha === selectedFormDate &&
          ['pendiente', 'completada'].includes(appointment.estado) &&
          appointment.id !== editingAppointmentId,
      )
      .forEach((appointment) => {
        const currentEntries = groupedBySlot.get(appointment.hora24) || [];
        groupedBySlot.set(appointment.hora24, [...currentEntries, appointment]);
      });

    return [...groupedBySlot.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([hour24, slotAppointments]) => ({
        hora24: hour24,
        hora: formatAppointmentDisplayHour(hour24),
        patientNames: slotAppointments
          .map((appointment) => patients.find((patient) => patient.id === appointment.pacienteId)?.nombre)
          .filter(Boolean)
          .join(' / '),
        waitlistCount: (waitlistEntriesBySlot.get(buildAppointmentSlotKey(selectedFormDate, hour24)) || []).length,
      }));
  }, [appointments, editingAppointmentId, patients, selectedFormDate, waitlistEntriesBySlot]);

  const resetForm = () => { setEditingAppointmentId(null); setForm(emptyForm); setWaitlistSchedulingEntry(null); onDismissAppointmentError?.(); };
  const resetWaitlistForm = (date = selectedDate || todayDate) => {
    setWaitlistForm({
      ...emptyWaitlistForm,
      fecha: date,
      pacienteId: patients[0]?.id || '',
    });
    onDismissWaitlistError?.();
  };
  const openNewAppointmentModal = () => {
    resetForm();
    setWaitlistSuccessMessage('');
    setForm((current) => ({ ...current, fecha: selectedDate || todayDate, pacienteId: current.pacienteId || patients[0]?.id || '' }));
    setIsAppointmentModalOpen(true);
  };
  const closeAppointmentModal = () => {
    setIsAppointmentModalOpen(false);
    resetForm();
  };
  const openWaitlistModal = () => {
    resetWaitlistForm(selectedDate || todayDate);
    setIsWaitlistModalOpen(true);
  };
  const closeWaitlistModal = () => {
    setIsWaitlistModalOpen(false);
    resetWaitlistForm(todayDate);
  };
  const closeAvailabilityModal = () => {
    setIsAvailabilityModalOpen(false);
    onDismissAvailabilityError?.();
  };
  const resetExceptionRangeForm = (date = selectedDate || todayDate) => {
    setEditingExceptionRange(null);
    setExceptionRangeForm({ startDate: date, endDate: date });
    onDismissAvailabilityExceptionError?.();
  };
  const resetExceptionForm = () => {
    setEditingExceptionDate('');
    setExceptionForm(createEmptyExceptionForm(selectedDate || todayDate));
    onDismissAvailabilityExceptionError?.();
  };
  const openExceptionsModal = () => {
    resetExceptionForm();
    resetExceptionRangeForm(selectedDate || todayDate);
    setIsExceptionsModalOpen(true);
  };
  const closeExceptionsModal = () => {
    setIsExceptionsModalOpen(false);
    resetExceptionForm();
    resetExceptionRangeForm(todayDate);
    onDismissAvailabilityExceptionError?.();
  };
  const openAppointmentModalFromWaitlistEntry = (entry) => {
    if (!entry) {
      return;
    }

    closeWaitlistModal();
    resetForm();
    setWaitlistSuccessMessage('');
    setWaitlistSchedulingEntry(entry);
    setSelectedDate(entry.fecha);
    setCalendarAnchorDate(entry.fecha);
    setForm({
      pacienteId: entry.pacienteId,
      fecha: entry.fecha,
      hora24: entry.hora24,
      estado: 'pendiente',
      notas: '',
      recurrenciaActiva: false,
      recurrenciaHasta: '',
      recurrenceEditScope: 'single',
    });
    setIsAppointmentModalOpen(true);
  };
  const handleEditAppointment = (appointment) => {
    setWaitlistSuccessMessage('');
    setEditingAppointmentId(appointment.id);
    setForm({
      pacienteId: appointment.pacienteId,
      fecha: appointment.fecha,
      hora24: appointment.hora24,
      estado: appointment.estado,
      notas: appointment.notas || '',
      recurrenciaActiva: false,
      recurrenciaHasta: '',
      recurrenceEditScope: 'single',
    });
    setSelectedDate(appointment.fecha);
    setCalendarAnchorDate(appointment.fecha);
    onDismissAppointmentError?.();
    setIsAppointmentModalOpen(true);
  };
  const handleChange = (event) => {
    onDismissAppointmentError?.();
      const { name, type, checked, value } = event.target;
      const nextValue = type === 'checkbox' ? checked : value;

      setForm((current) => {
        const nextForm = { ...current, [name]: nextValue };

        if (name === 'estado') {
          const nextStatus = name === 'estado' ? nextValue : current.estado;

          if (nextStatus !== 'pendiente') {
            nextForm.recurrenciaActiva = false;
            nextForm.recurrenciaHasta = '';
          }
        }

        if (name === 'fecha' && current.recurrenciaHasta && current.recurrenciaHasta <= nextValue) {
          nextForm.recurrenciaHasta = '';
        }

      if (name === 'fecha' && current.recurrenciaHasta && current.recurrenciaHasta < addDaysToDateString(nextValue, 7)) {
        nextForm.recurrenciaHasta = '';
      }

      if (name === 'recurrenciaActiva' && !nextValue) {
        nextForm.recurrenciaHasta = '';
      }

      return nextForm;
    });
  };
  const handleWaitlistChange = (event) => {
    onDismissWaitlistError?.();
    setWaitlistForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    const resolvedPatientId = form.pacienteId || patients[0]?.id || '';
    const resolvedDate = form.fecha || todayDate;
    if (!resolvedPatientId || !resolvedDate || !normalizedHourValue || hasSameDayPatientConflict) return;
    const payload = {
      pacienteId: resolvedPatientId,
      fecha: resolvedDate,
      hora24: normalizedHourValue,
      estado: form.estado,
      notas: form.notas,
      recurrenciaActiva: form.recurrenciaActiva,
      recurrenciaHasta: form.recurrenciaHasta,
      recurrenceEditScope: form.recurrenceEditScope || 'single',
    };
    const wasSaved = editingAppointmentId ? await onUpdateAppointment(editingAppointmentId, payload) : await onCreateAppointment(payload);
    if (wasSaved) {
      if (!editingAppointmentId && waitlistSchedulingEntry) {
        setWaitlistSuccessMessage(`Cita reagendada para ${waitlistSchedulingEntry.pacienteNombre}. La entrada salio de lista de espera.`);
      }
      setSelectedDate(resolvedDate);
      setCalendarAnchorDate(resolvedDate);
      closeAppointmentModal();
    }
  };
  const handleSubmitWaitlist = async (event) => {
    event.preventDefault();

    if (!waitlistForm.pacienteId || !waitlistForm.fecha || !normalizedWaitlistHourValue || hasWaitlistSameDayConflict) {
      return;
    }

    const wasSaved = await onCreateAppointmentWaitlist?.({
      ...waitlistForm,
      hora24: normalizedWaitlistHourValue,
    });

    if (wasSaved) {
      resetWaitlistForm(waitlistForm.fecha);
    }
  };
  const handleDelete = async (appointmentId) => { if (window.confirm('Se eliminara esta cita. Deseas continuar?')) await onDeleteAppointment(appointmentId); };
  const handleDeleteFutureRecurrence = async (appointment) => {
    if (!appointment?.recurrenciaGrupoId) {
      return;
    }

    if (!window.confirm('Se eliminaran esta cita y todas las futuras de la misma recurrencia. Deseas continuar?')) {
      return;
    }

    const wasDeleted = await onDeleteFutureRecurringAppointments?.(appointment.id);

    if (wasDeleted) {
      closeAppointmentModal();
    }
  };
  const handleDeleteWaitlistEntry = async (waitlistEntryId) => {
    if (!window.confirm('Se eliminara esta solicitud de lista de espera. Deseas continuar?')) {
      return;
    }

    await onDeleteAppointmentWaitlist?.(waitlistEntryId);
  };
  const handleReorderWaitlistEntries = async (slot, draggedEntryId, targetEntryId) => {
    if (!slot || !draggedEntryId || !targetEntryId || draggedEntryId === targetEntryId || isSavingWaitlist) {
      return;
    }

    const currentOrder = slot.entries.map((entry) => entry.id);
    const draggedIndex = currentOrder.indexOf(draggedEntryId);
    const targetIndex = currentOrder.indexOf(targetEntryId);

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
      return;
    }

    const nextOrder = [...currentOrder];
    const [draggedEntryIdValue] = nextOrder.splice(draggedIndex, 1);
    nextOrder.splice(targetIndex, 0, draggedEntryIdValue);

    await onReorderAppointmentWaitlist?.({
      fecha: selectedWaitlistDate,
      hora24: slot.hora24,
      entryIds: nextOrder,
    });
  };
  const handleUpdateAppointmentStatus = async (appointment, nextStatus) => {
    if (!appointment) {
      return false;
    }

    return onUpdateAppointment(appointment.id, {
      ...appointment,
      estado: nextStatus,
    });
  };
  const handleCancelAppointment = async (appointment) => {
    if (!window.confirm('La cita se marcara como cancelada. Deseas continuar?')) {
      return false;
    }

    const wasCancelled = await handleUpdateAppointmentStatus(appointment, 'cancelada');

    if (wasCancelled && appointment.waitlistCount > 0) {
      setSelectedDate(appointment.fecha);
      setCalendarAnchorDate(appointment.fecha);
      setWaitlistForm({
        pacienteId: '',
        fecha: appointment.fecha,
        hora24: appointment.hora24,
        notas: '',
      });
      setIsWaitlistModalOpen(true);
      onDismissWaitlistError?.();
    }

    return wasCancelled;
  };
  const handleMarkNoShow = async (appointment) => {
    if (!window.confirm('La cita se marcara como no asistio. Deseas continuar?')) {
      return false;
    }

    return handleUpdateAppointmentStatus(appointment, 'no asistio');
  };
  const handleSelectDate = (date) => { setSelectedDate(date); if (!date) return; setCalendarAnchorDate(date); onDismissAppointmentError?.(); };
  const handleMoveCalendar = (direction) => setCalendarAnchorDate((currentDate) => calendarView === 'month' ? shiftDateByMonths(currentDate, direction) : shiftDateByDays(currentDate, direction * 7));
  const handleResetCalendar = () => { setCalendarAnchorDate(todayDate); if (selectedDate) setSelectedDate(isPsychologist ? todayDate : ''); };
  const handleClearFilters = () => {
    setSelectedDate('');
    setStatusFilter('todos');
    setSessionCoverageFilter('todos');
    setPatientTimelineFilter('todos');
  };
  const handleSummaryFilter = (summaryKey) => {
    if (activeSummaryFilter === summaryKey) {
      handleClearFilters();
      return;
    }

    setSelectedDate('');

    if (summaryKey === 'missing') {
      setStatusFilter('completada');
      setSessionCoverageFilter('missing');
      return;
    }

    if (summaryKey === 'registered') {
      setStatusFilter('completada');
      setSessionCoverageFilter('registered');
      return;
    }

    if (summaryKey === 'pending') {
      setStatusFilter('pendiente');
      setSessionCoverageFilter('todos');
    }
  };

  const updateDraftEntries = (updater) => {
    onDismissAvailabilityError?.();
    onChangeAvailabilityDraft((current) => updater(normalizeDraftEntries(current)));
  };

  const handleAddAvailabilityBlock = (weekday) => {
    updateDraftEntries((entries) => entries.map((entry) => entry.weekday !== weekday ? entry : { ...entry, blocks: [...entry.blocks, { id: `tmp-${weekday}-${Date.now()}`, startTime: '09:00', endTime: '10:00' }] }));
  };
  const handleRemoveAvailabilityBlock = (weekday, blockId) => {
    updateDraftEntries((entries) => entries.map((entry) => entry.weekday !== weekday ? entry : { ...entry, blocks: entry.blocks.filter((block) => block.id !== blockId) }));
  };
  const handleAvailabilityBlockChange = (weekday, blockId, field, value) => {
    updateDraftEntries((entries) => entries.map((entry) => entry.weekday !== weekday ? entry : { ...entry, blocks: entry.blocks.map((block) => block.id !== blockId ? block : { ...block, [field]: value }) }));
  };
  const handleSaveAvailability = async () => {
    const wasSaved = await onUpdateAvailability(normalizedAvailabilityDraft.map((entry) => ({
      weekday: entry.weekday,
      blocks: entry.blocks.map((block) => ({ startTime: block.startTime, endTime: block.endTime })),
    })));
    if (wasSaved) {
      closeAvailabilityModal();
    }
  };

  const handleExceptionFieldChange = (field, value) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, [field]: value }));
  };
  const handleAddExceptionBlock = () => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, blocks: [...current.blocks, createDefaultExceptionBlock()] }));
  };
  const handleRemoveExceptionBlock = (blockId) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }));
  };
  const handleExceptionBlockChange = (blockId, field, value) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, blocks: current.blocks.map((block) => block.id !== blockId ? block : { ...block, [field]: value }) }));
  };
  const handleEditException = (exception) => {
    resetExceptionRangeForm(exception.date);
    setEditingExceptionDate(exception.date);
    setExceptionForm(normalizeExceptionForm(exception));
    onDismissAvailabilityExceptionError?.();
  };
  const handleEditExceptionRange = (range) => {
    resetExceptionForm();
    setEditingExceptionRange(range);
    setExceptionRangeForm({ startDate: range.startDate, endDate: range.endDate });
    onDismissAvailabilityExceptionError?.();
  };
  const handleSaveException = async (event) => {
    event.preventDefault();
    if (!exceptionForm.date) return;
    const wasSaved = await onUpsertAvailabilityException({
      date: exceptionForm.date,
      isUnavailable: Boolean(exceptionForm.isUnavailable),
      blocks: exceptionForm.isUnavailable ? [] : exceptionForm.blocks.map((block) => ({ startTime: block.startTime, endTime: block.endTime })),
    });
    if (wasSaved) {
      closeExceptionsModal();
    }
  };
  const handleDeleteException = async (date) => {
    if (!window.confirm('Se eliminara esta excepcion y el dia volvera a usar la disponibilidad semanal. Deseas continuar?')) return;
    const wasDeleted = await onDeleteAvailabilityException(date);
    if (wasDeleted && editingExceptionDate === date) {
      resetExceptionForm();
    }
  };
  const handleExceptionRangeFieldChange = (field, value) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionRangeForm((current) => ({ ...current, [field]: value }));
  };
  const handleSaveExceptionRange = async (event) => {
    event.preventDefault();
    if (!exceptionRangeForm.startDate || !exceptionRangeForm.endDate) return;
    const wasSaved = editingExceptionRange
      ? await onUpdateAvailabilityExceptionRange({
        currentStartDate: editingExceptionRange.startDate,
        currentEndDate: editingExceptionRange.endDate,
        startDate: exceptionRangeForm.startDate,
        endDate: exceptionRangeForm.endDate,
      })
      : await onCreateAvailabilityExceptionRange({
        startDate: exceptionRangeForm.startDate,
        endDate: exceptionRangeForm.endDate,
      });
    if (wasSaved) {
      closeExceptionsModal();
    }
  };
  const handleDeleteExceptionRange = async (range) => {
    if (!window.confirm('Se desbloqueara este periodo completo. Deseas continuar?')) return;
    const wasDeleted = await onDeleteAvailabilityExceptionRange({
      startDate: range.startDate,
      endDate: range.endDate,
    });
    if (wasDeleted && editingExceptionRange?.startDate === range.startDate && editingExceptionRange?.endDate === range.endDate) {
      resetExceptionRangeForm(selectedDate || todayDate);
    }
  };

  const calendarTitle = isPsychologist
    ? (calendarView === 'month' ? 'Vista Mensual' : 'Vista Semanal')
    : (calendarView === 'month' ? 'Tu calendario mensual' : 'Tu calendario semanal');
  const calendarSubtitle = isPsychologist
    ? (calendarView === 'month'
      ? 'Explora el mes completo con una cuadricula de calendario y toca un dia para enfocar el listado.'
      : 'Explora la semana y selecciona un dia para enfocar el listado.')
    : (calendarView === 'month'
      ? 'Revisa tus citas del mes y toca un dia para ver mejor tu seguimiento.'
      : 'Revisa tu semana clinica y toca un dia para enfocar tu historial.');
  const calendarRangeLabel = calendarView === 'month' ? monthLabel : weekRangeLabel;
  const blockSummary = selectedDayAvailability.isUnavailable
    ? 'Excepcion: dia no disponible'
    : selectedDayBlocks.length > 0
      ? `${selectedDayAvailability.source === 'exception' ? 'Excepcion' : 'Semana base'}: ${selectedDayBlocks.map((block) => `${block.startTime}-${block.endTime}`).join(' | ')}`
      : 'Sin disponibilidad';
  const availabilityStartOptions = getAppointmentHourOptions(6, 21);
  const availabilityEndOptions = getAppointmentHourOptions(7, 22);
  const availableSlotsMessage =
    hasSameDayPatientConflict
      ? `Este paciente ya tiene una cita activa este dia a las ${sameDayPatientAppointment?.hora || ''}. Cancela o reprograma esa cita antes de agendar otra.`
      : selectedDayAvailability.isUnavailable
      ? 'Este dia esta marcado como no disponible por una excepcion.'
      : selectedDayBlocks.length === 0
        ? 'No hay disponibilidad configurada para este dia.'
        : hourOptions.length === 0
        ? 'No quedan cupos disponibles en este dia.'
        : `${hourOptions.length} horario${hourOptions.length === 1 ? '' : 's'} disponible${hourOptions.length === 1 ? '' : 's'} en este dia.`;
  const occupiedSlotsMessage =
    occupiedSlotSummaries.length === 0
      ? 'Todavia no hay horarios ocupados este dia.'
      : 'Horarios ocupados visibles solo como referencia. Si se libera alguno, puedes gestionarlo desde lista de espera.';
  const waitlistSlotsMessage =
    occupiedSlotOptions.length === 0
      ? 'Todavia no hay horarios ocupados para este dia.'
      : `${occupiedSlotOptions.length} horario${occupiedSlotOptions.length === 1 ? '' : 's'} ocupado${occupiedSlotOptions.length === 1 ? '' : 's'} con opcion de lista de espera.`;
  const isHourSelectDisabled = isSavingAppointment || hasSameDayPatientConflict || ((selectedDayBlocks.length === 0 || selectedDayAvailability.isUnavailable) && !form.hora24);
  const exceptionRangeDayCount = getRangeDayCount(exceptionRangeForm.startDate, exceptionRangeForm.endDate);
  const clinicalSummary = useMemo(() => {
    const completedWithoutSession = appointments.filter((appointment) => getAppointmentSessionState(appointment, appointmentSessionIds.has(appointment.id)) === 'missing').length;
    const completedWithSession = appointments.filter((appointment) => getAppointmentSessionState(appointment, appointmentSessionIds.has(appointment.id)) === 'registered').length;
    const upcomingPending = appointments.filter((appointment) => appointment.estado === 'pendiente' && !isAppointmentOverdue(appointment) && appointment.fecha >= todayDate).length;

    return {
      completedWithoutSession,
      completedWithSession,
      upcomingPending,
    };
  }, [appointmentSessionIds, appointments, todayDate]);
  const showInlineManagementPanels = false;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {waitlistSuccessMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{waitlistSuccessMessage}</p>
            <button
              type="button"
              onClick={() => setWaitlistSuccessMessage('')}
              className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-900"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isPsychologist ? 'Agenda de Citas' : 'Mis Citas'}</h2>
          <p className="text-sm md:text-base text-gray-500">{isPsychologist ? 'Gestiona citas, registra notas clinicas y da seguimiento al calendario clinico.' : 'Consulta tu agenda personal, tus cambios recientes y el estado de cada cita.'}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="date" value={selectedDate} onChange={(event) => handleSelectDate(event.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          <button type="button" onClick={() => handleSelectDate('')} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{isPsychologist ? 'Ver todas' : 'Quitar fecha'}</button>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes y por cerrar</option>
            <option value="completada">Completadas</option>
            <option value="no asistio">No asistio</option>
            <option value="cancelada">Canceladas</option>
          </select>
          {isPsychologist && <select value={sessionCoverageFilter} onChange={(event) => setSessionCoverageFilter(event.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option value="todos">Todas las notas clinicas</option>
            <option value="missing">Completadas sin nota clinica</option>
            <option value="registered">Completadas con nota clinica</option>
          </select>}
          {hasActiveFilters && <button type="button" onClick={handleClearFilters} className="px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Limpiar filtros</button>}
        </div>
      </div>

      {!isPsychologist && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setSelectedDate('');
              setPatientTimelineFilter((current) => (current === 'proximas' ? 'todos' : 'proximas'));
            }}
            className={`rounded-2xl border p-4 text-left transition ${patientTimelineFilter === 'proximas' ? 'border-indigo-400 bg-indigo-100 ring-2 ring-indigo-200' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100/70'}`}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Proximas</p>
            <p className="mt-2 text-3xl font-black text-indigo-900">{patientTimelineSummary.upcoming}</p>
            <p className="mt-1 text-sm text-indigo-800">Tus citas futuras activas.</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedDate('');
              setPatientTimelineFilter((current) => (current === 'historial' ? 'todos' : 'historial'));
            }}
            className={`rounded-2xl border p-4 text-left transition ${patientTimelineFilter === 'historial' ? 'border-slate-400 bg-slate-100 ring-2 ring-slate-200' : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'}`}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700">Historial</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{patientTimelineSummary.history}</p>
            <p className="mt-1 text-sm text-slate-700">Citas ya transcurridas o cerradas.</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedDate('');
              setPatientTimelineFilter((current) => (current === 'cambios' ? 'todos' : 'cambios'));
            }}
            className={`rounded-2xl border p-4 text-left transition ${patientTimelineFilter === 'cambios' ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200' : 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'}`}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Cambios</p>
            <p className="mt-2 text-3xl font-black text-amber-900">{patientTimelineSummary.changed}</p>
            <p className="mt-1 text-sm text-amber-800">Canceladas o marcadas como no asistio.</p>
          </button>
        </section>
      )}

      {isPsychologist && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button type="button" onClick={() => handleSummaryFilter('missing')} className={`rounded-2xl border p-4 text-left transition ${activeSummaryFilter === 'missing' ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-200' : 'border-sky-200 bg-sky-50 hover:bg-sky-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">Pendiente clinico</p>
            <p className="mt-2 text-3xl font-black text-sky-900">{clinicalSummary.completedWithoutSession}</p>
            <p className="mt-1 text-sm text-sky-800">Citas completadas sin nota clinica registrada.</p>
          </button>
          <button type="button" onClick={() => handleSummaryFilter('registered')} className={`rounded-2xl border p-4 text-left transition ${activeSummaryFilter === 'registered' ? 'border-emerald-400 bg-emerald-100 ring-2 ring-emerald-200' : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Cierre clinico</p>
            <p className="mt-2 text-3xl font-black text-emerald-900">{clinicalSummary.completedWithSession}</p>
            <p className="mt-1 text-sm text-emerald-800">Citas completadas con nota clinica registrada.</p>
          </button>
          <button type="button" onClick={() => handleSummaryFilter('pending')} className={`rounded-2xl border p-4 text-left transition ${activeSummaryFilter === 'pending' ? 'border-indigo-400 bg-indigo-100 ring-2 ring-indigo-200' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Agenda activa</p>
            <p className="mt-2 text-3xl font-black text-indigo-900">{clinicalSummary.upcomingPending}</p>
            <p className="mt-1 text-sm text-indigo-800">Citas pendientes de hoy en adelante.</p>
          </button>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center"><Calendar className="mr-2 text-indigo-500" size={20} /> {calendarTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">{calendarSubtitle}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-1">
              <button type="button" onClick={() => setCalendarView('week')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${calendarView === 'week' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Semanal</button>
              <button type="button" onClick={() => setCalendarView('month')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${calendarView === 'month' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Mensual</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="min-w-32 text-center text-sm font-semibold capitalize text-gray-700">{calendarRangeLabel}</span>
              <button type="button" onClick={() => handleMoveCalendar(-1)} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 transition"><ChevronLeft size={18} /></button>
              <button type="button" onClick={handleResetCalendar} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{calendarView === 'month' ? 'Este mes' : 'Esta semana'}</button>
              <button type="button" onClick={() => handleMoveCalendar(1)} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 transition"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>

        {isPsychologist && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            {availabilityExceptions.length > 0 && <>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Excepciones</span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getExceptionPillClasses(true)}`}>
                <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getExceptionDotClasses(true)}`} />
                Dia bloqueado
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getExceptionPillClasses(false)}`}>
                <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getExceptionDotClasses(false)}`} />
                Horario especial
              </span>
            </>}
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSessionBadgeClasses('registered')}`}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getSessionIndicatorClasses('registered')}`} />
              Nota clinica registrada
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSessionBadgeClasses('missing')}`}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getSessionIndicatorClasses('missing')}`} />
              Falta nota clinica
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getWaitlistBadgeClasses()}`}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getWaitlistCountDotClasses()}`} />
              Lista de espera
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <Repeat2 size={12} className="mr-1.5" />
              Recurrente
            </span>
          </div>
        )}

        {calendarView === 'week' ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDates.map((weekDate) => {
              const dayAppointments = weeklyAppointments[weekDate.isoDate] || [];
              const visibleDayAppointments = getVisibleCalendarAppointments(dayAppointments, 3);
              const visibleDayAppointmentGroups = groupCalendarAppointmentsBySlot(visibleDayAppointments);
              const dayException = availabilityExceptionsMap.get(weekDate.isoDate);
              const isActive = selectedDate === weekDate.isoDate;
              const isHovered = hoveredDate === weekDate.isoDate;
              const isToday = weekDate.isoDate === todayDate;
              return (
                <button key={weekDate.isoDate} type="button" onClick={() => handleSelectDate(weekDate.isoDate)} className={`rounded-2xl border p-3 text-left transition ${isActive ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-100' : dayException ? getExceptionCellAccent(dayException.isUnavailable) : isHovered ? 'border-indigo-300 bg-indigo-50/60' : isToday ? 'border-indigo-200 bg-white' : 'border-gray-200 bg-gray-50 hover:bg-white'}`}>
                  <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">{weekDate.shortWeekday}</span><div className="flex items-center gap-1.5">{dayException && <span className={`inline-flex h-2.5 w-2.5 rounded-full ring-4 ${getExceptionDotClasses(dayException.isUnavailable)}`} />}{isToday && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Hoy</span>}</div></div>
                  <p className="mt-2 text-sm font-bold text-gray-900">{weekDate.shortLabel}</p>
                  {dayException && <div className={`mt-2 inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-semibold leading-none ${getExceptionPillClasses(dayException.isUnavailable)}`}>{dayException.isUnavailable ? 'Dia bloqueado' : 'Horario especial'}</div>}
                  <div className="mt-3 space-y-2">
                    {visibleDayAppointmentGroups.map((group) => {
                      const renderChip = (appointment) => {
                        const sessionState = getAppointmentSessionState(appointment, appointmentSessionIds.has(appointment.id));
                        const displayStatus = getAppointmentDisplayStatus(appointment);
                        const showWaitlistIndicator = appointment.estado === 'pendiente' && appointment.waitlistCount > 0;
                        const showSessionIndicator = isPsychologist ? sessionState !== 'none' : sessionState === 'registered';
                        return (
                          <div key={appointment.id} className={`flex min-w-0 items-center justify-between gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold leading-none ${getMiniAppointmentChip(displayStatus)} ${group.length > 1 ? 'max-w-[48%] flex-1' : ''}`}>
                            <p className="truncate">{appointment.hora}</p>
                            <div className="flex items-center gap-1.5">
                              {appointment.recurrenciaGrupoId && (
                                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-500" title="Cita recurrente">
                                  <Repeat2 size={10} />
                                </span>
                              )}
                              {showWaitlistIndicator && (
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${getWaitlistBadgeClasses()}`} title={`${appointment.waitlistCount} en lista de espera`}>
                                  {appointment.waitlistCount}
                                </span>
                              )}
                              {showSessionIndicator && <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ring-4 ${getSessionIndicatorClasses(sessionState)}`} title={getAppointmentSessionLabel(sessionState)} />}
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div key={`${weekDate.isoDate}-${group[0].hora24}`} className={getCalendarGroupContainerClasses(group.length, 'week')}>
                          {group.map((appointment) => renderChip(appointment))}
                        </div>
                      );
                    })}
                    {dayAppointments.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 px-2.5 py-3 text-center text-[11px] text-gray-400">{dayException?.isUnavailable ? 'Dia bloqueado' : 'Sin citas'}</div>}
                    {dayAppointments.length > visibleDayAppointments.length && <p className="text-[11px] font-medium text-indigo-600">+{dayAppointments.length - visibleDayAppointments.length} mas</p>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/80">{monthWeekdayHeaders.map((weekday) => <div key={weekday} className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{weekday}</div>)}</div>
            <div className="grid grid-cols-7">
              {monthDates.map((monthDate) => {
                const dayAppointments = monthlyAppointments[monthDate.isoDate] || [];
                const visibleDayAppointments = getVisibleCalendarAppointments(dayAppointments, 2);
                const visibleDayAppointmentGroups = groupCalendarAppointmentsBySlot(visibleDayAppointments);
                const dayException = availabilityExceptionsMap.get(monthDate.isoDate);
                const isActive = selectedDate === monthDate.isoDate;
                const isHovered = hoveredDate === monthDate.isoDate;
                const isToday = monthDate.isoDate === todayDate;
                return (
                  <button key={monthDate.isoDate} type="button" onClick={() => handleSelectDate(monthDate.isoDate)} className={`h-24 sm:h-28 border-b border-r p-2 text-left align-top transition ${isActive ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-200' : dayException ? (dayException.isUnavailable ? 'bg-red-50/40' : 'bg-amber-50/40') : isHovered ? 'bg-indigo-50/50' : monthDate.isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/70 hover:bg-slate-50'}`}>
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between"><span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition ${getDayNumberBadge({ isToday, isActive, isHovered, isCurrentMonth: monthDate.isCurrentMonth })}`}>{monthDate.dayNumber}</span>{dayException && <span className={`inline-flex h-2.5 w-2.5 rounded-full ring-4 ${getExceptionDotClasses(dayException.isUnavailable)}`} title={dayException.isUnavailable ? 'Dia bloqueado' : 'Horario especial'} />}</div>
                      {dayException && <div className={`mt-1 inline-flex w-fit rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${getExceptionPillClasses(dayException.isUnavailable)}`}>{dayException.isUnavailable ? 'Bloqueado' : 'Especial'}</div>}
                      <div className="mt-2 flex-1 space-y-1 overflow-hidden">{visibleDayAppointmentGroups.map((group) => {
                        const renderChip = (appointment) => {
                          const sessionState = getAppointmentSessionState(appointment, appointmentSessionIds.has(appointment.id));
                          const displayStatus = getAppointmentDisplayStatus(appointment);
                          const showWaitlistIndicator = appointment.estado === 'pendiente' && appointment.waitlistCount > 0;
                          const showSessionIndicator = isPsychologist ? sessionState !== 'none' : sessionState === 'registered';
                          return (
                            <div key={appointment.id} className={`flex min-w-0 items-center justify-between gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none ${getMiniAppointmentChip(displayStatus)} ${group.length > 1 ? 'max-w-[48%] flex-1' : ''}`}>
                              <div className="truncate">{appointment.hora}</div>
                              <div className="flex items-center gap-1">
                                {appointment.recurrenciaGrupoId && (
                                  <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-500" title="Cita recurrente">
                                    <Repeat2 size={8} />
                                  </span>
                                )}
                                {showWaitlistIndicator && <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ring-2 ${getWaitlistCountDotClasses()}`} title={`${appointment.waitlistCount} en lista de espera`} />}
                                {showSessionIndicator && <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ring-2 ${getSessionIndicatorClasses(sessionState)}`} title={getAppointmentSessionLabel(sessionState)} />}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div key={`${monthDate.isoDate}-${group[0].hora24}`} className={getCalendarGroupContainerClasses(group.length, 'month')}>
                            {group.map((appointment) => renderChip(appointment))}
                          </div>
                        );
                      })}</div>
                      {dayAppointments.length > visibleDayAppointments.length && <p className="mt-1 text-[10px] font-semibold leading-none text-indigo-700">+{dayAppointments.length - visibleDayAppointments.length}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {isPsychologist && (
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Acciones rapidas</h3>
              <p className="mt-1 text-sm text-gray-500">Abre formularios en modales para mantener la agenda limpia mientras trabajas.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={openNewAppointmentModal} className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700">
                <CalendarPlus size={16} className="mr-2" /> Nueva cita
              </button>
              <button type="button" onClick={openWaitlistModal} className="inline-flex items-center justify-center rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800 transition hover:bg-violet-100">
                <Users size={16} className="mr-2" /> Lista de espera
              </button>
              <button type="button" onClick={() => setIsAvailabilityModalOpen(true)} className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                <Save size={16} className="mr-2" /> Disponibilidad semanal
              </button>
              <button type="button" onClick={openExceptionsModal} className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                <Calendar size={16} className="mr-2" /> Excepciones por fecha
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><Calendar className="mr-2 text-indigo-500" size={20} /> Citas registradas</h3><span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{filteredAppointments.length} resultados</span></div>
          <div className="space-y-3">
            {filteredAppointments.map((appointment) => {
              const patient = patients.find((currentPatient) => currentPatient.id === appointment.pacienteId);
              const linkedSession = patient?.sesiones?.find((session) => session.citaId === appointment.id) || null;
              const sessionState = getAppointmentSessionState(appointment, Boolean(linkedSession));
              const sessionLabel = getAppointmentSessionLabel(sessionState);
              const shouldShowSessionBadge = isPsychologist ? sessionState !== 'none' : sessionState === 'registered';
              const displayStatus = getAppointmentDisplayStatus(appointment);
              const showWaitlistIndicator = appointment.estado === 'pendiente' && appointment.waitlistCount > 0;
              const topWaitlistEntry = showWaitlistIndicator ? waitlistTopPriorityBySlot.get(buildAppointmentSlotKey(appointment.fecha, appointment.hora24)) || null : null;
              const isFutureAppointment = appointment.fecha > todayDate;
              const isOverduePendingAppointment = isAppointmentOverdue(appointment);
              const canOpenSessionFlow =
                isPsychologist &&
                patient &&
                !['cancelada', 'no asistio'].includes(appointment.estado) &&
                (Boolean(linkedSession) || !isFutureAppointment);
              const isProcessingThisAppointment = processingAppointmentId === appointment.id;
              const isLinkedToHoveredDate = hoveredDate === appointment.fecha;
              const isLinkedToSelectedDate = selectedDate === appointment.fecha;
              return (
                <div key={appointment.id} tabIndex={0} onMouseEnter={() => setHoveredDate(appointment.fecha)} onMouseLeave={() => setHoveredDate('')} onFocus={() => setHoveredDate(appointment.fecha)} onBlur={() => setHoveredDate('')} className={`rounded-xl border border-gray-200 border-l-4 p-4 transition outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${getAppointmentAccent(displayStatus)} ${isLinkedToSelectedDate ? 'ring-2 ring-indigo-100 shadow-sm' : isLinkedToHoveredDate ? 'ring-2 ring-slate-200' : ''}`}>
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap"><h4 className="font-bold text-gray-900 truncate">{isPsychologist ? patient?.nombre || 'Paciente no disponible' : 'Tu cita'}</h4><span className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase ${getStatusBadge(displayStatus)}`}>{displayStatus}</span>{appointment.recurrenciaGrupoId && <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] md:text-xs font-bold text-slate-600"><Repeat2 size={12} className="mr-1.5" />Recurrente</span>}{shouldShowSessionBadge && <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] md:text-xs font-bold ${getSessionBadgeClasses(sessionState)}`}><span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getSessionIndicatorClasses(sessionState)}`} />{sessionLabel}</span>}{showWaitlistIndicator && <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] md:text-xs font-bold ${getWaitlistBadgeClasses()}`}><span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getWaitlistCountDotClasses()}`} />Espera {appointment.waitlistCount}</span>}</div>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500"><span className="inline-flex items-center"><Calendar size={14} className="mr-1.5" /> {appointment.fecha}</span><span className="inline-flex items-center"><Clock3 size={14} className="mr-1.5" /> {appointment.hora}</span></div>
                      {isOverduePendingAppointment && (
                        <p className="mt-2 text-sm font-medium text-amber-700">{isPsychologist ? 'La hora de esta cita ya paso y todavia necesita cierre operativo.' : 'Esta cita ya paso y sigue pendiente de confirmacion administrativa.'}</p>
                      )}
                      {topWaitlistEntry && (
                        <p className="mt-2 text-sm text-violet-700">
                          Lista de espera: prioridad actual para <span className="font-semibold">{topWaitlistEntry.pacienteNombre}</span>.
                        </p>
                      )}
                      {appointment.notas && <p className="mt-3 text-sm text-gray-600">{appointment.notas}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {patient && <button onClick={() => onOpenPatient(patient)} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium">{isPsychologist ? 'Ver expediente' : 'Abrir expediente'}</button>}
                      {canOpenSessionFlow && (
                        <button
                          onClick={() => {
                            if (linkedSession || appointment.estado === 'completada') {
                              onOpenPatient(patient, { appointmentId: appointment.id });
                              return;
                            }

                            onOpenAppointmentSession?.(appointment, patient);
                          }}
                          disabled={isProcessingThisAppointment}
                          className="px-3 py-2 bg-white text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {linkedSession ? 'Ver nota clinica' : appointment.estado === 'completada' ? 'Registrar nota clinica' : isProcessingThisAppointment ? 'Completando...' : 'Completar y registrar'}
                        </button>
                      )}
                      {isPsychologist && isOverduePendingAppointment && !linkedSession && (
                        <>
                          <button onClick={() => handleMarkNoShow(appointment)} disabled={isProcessingThisAppointment} className="px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
                            No asistio
                          </button>
                          <button onClick={() => handleCancelAppointment(appointment)} disabled={isProcessingThisAppointment} className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
                            Cancelar
                          </button>
                        </>
                      )}
                      {isPsychologist && showWaitlistIndicator && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(appointment.fecha);
                            setCalendarAnchorDate(appointment.fecha);
                            setWaitlistForm((current) => ({
                              ...current,
                              fecha: appointment.fecha,
                              hora24: appointment.hora24,
                            }));
                            setIsWaitlistModalOpen(true);
                            onDismissWaitlistError?.();
                          }}
                          className="px-3 py-2 bg-violet-50 text-violet-800 border border-violet-200 rounded-lg hover:bg-violet-100 transition text-sm font-medium inline-flex items-center"
                        >
                          <Users size={14} className="mr-2" /> Ver espera
                        </button>
                      )}
                      {isPsychologist && <>
                        <button onClick={() => handleEditAppointment(appointment)} className="px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition text-sm font-medium inline-flex items-center"><Pencil size={14} className="mr-2" /> Editar</button>
                        <button onClick={() => handleDelete(appointment.id)} disabled={processingAppointmentId === appointment.id} className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition text-sm font-medium inline-flex items-center disabled:opacity-60 disabled:cursor-not-allowed"><Trash2 size={14} className="mr-2" /> Eliminar</button>
                      </>}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredAppointments.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center"><p className="text-sm font-medium text-gray-600">No hay citas para los filtros seleccionados.</p></div>}
          </div>
        </div>

        {showInlineManagementPanels && isPsychologist && <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><CalendarPlus className="mr-2 text-indigo-500" size={20} /> {editingAppointmentId ? 'Editar cita' : 'Nueva cita'}</h3>{editingAppointmentId && <button onClick={resetForm} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">Limpiar</button>}</div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {appointmentActionError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{appointmentActionError}</div>}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Paciente</label>
                <select name="pacienteId" value={form.pacienteId || patients[0]?.id || ''} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Selecciona un paciente</option>
                  {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha</label>
                  <input type="date" name="fecha" value={form.fecha || todayDate} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  <p className="mt-1 text-xs text-gray-500">{weekdayLabels[selectedFormWeekday]}: {blockSummary}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Hora</label>
                  <select name="hora24" value={normalizedHourValue} onChange={handleChange} disabled={isHourSelectDisabled} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    <option value="">{hasSameDayPatientConflict ? 'Paciente ya agendado este dia' : selectedDayAvailability.isUnavailable ? 'Dia no disponible' : selectedDayBlocks.length > 0 ? 'Selecciona un horario' : 'Dia sin disponibilidad'}</option>
                    {hourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">{availableSlotsMessage}</p>
                  <p className="mt-1 text-xs text-gray-500">Las sesiones duran 60 minutos y se agendan por hora exacta.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="pendiente">Pendiente</option><option value="completada">Completada</option><option value="no asistio">No asistio</option><option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
                <textarea name="notas" value={form.notas} onChange={handleChange} disabled={isSavingAppointment} rows="4" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" placeholder="Detalles logisticos, contexto o recordatorios de la cita..." />
              </div>
              <button type="submit" disabled={isSavingAppointment || patients.length === 0 || hasSameDayPatientConflict} className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed">{isSavingAppointment ? 'Guardando...' : editingAppointmentId ? 'Guardar cambios' : 'Crear cita'}</button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-lg font-bold text-gray-800">Disponibilidad semanal</h3><p className="text-sm text-gray-500 mt-1">Agrega uno o varios bloques por dia para cubrir manana, tarde o turnos partidos.</p></div>
              <button type="button" onClick={handleSaveAvailability} disabled={isSavingAvailability} className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"><Save size={16} className="mr-2" /> {isSavingAvailability ? 'Guardando...' : 'Guardar'}</button>
            </div>
            {availabilityActionError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{availabilityActionError}</div>}
            <div className="space-y-3">
              {normalizedAvailabilityDraft.map((entry) => <div key={entry.weekday} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-800">{weekdayLabels[entry.weekday]}</p>
                      <p className="text-xs text-gray-500">{entry.blocks.length > 0 ? `${entry.blocks.length} bloque(s)` : 'Sin disponibilidad ese dia'}</p>
                    </div>
                    <button type="button" onClick={() => handleAddAvailabilityBlock(entry.weekday)} disabled={isSavingAvailability} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"><Plus size={14} className="mr-2" /> Agregar bloque</button>
                  </div>
                  <div className="space-y-2">
                    {entry.blocks.map((block) => <div key={block.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                      <select value={block.startTime} onChange={(event) => handleAvailabilityBlockChange(entry.weekday, block.id, 'startTime', event.target.value)} disabled={isSavingAvailability} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                        {availabilityStartOptions.map((option) => <option key={option.value} value={option.value}>Desde {option.label}</option>)}
                      </select>
                      <select value={block.endTime} onChange={(event) => handleAvailabilityBlockChange(entry.weekday, block.id, 'endTime', event.target.value)} disabled={isSavingAvailability} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                        {availabilityEndOptions.map((option) => <option key={option.value} value={option.value}>Hasta {option.label}</option>)}
                      </select>
                      <button type="button" onClick={() => handleRemoveAvailabilityBlock(entry.weekday, block.id)} disabled={isSavingAvailability} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={16} /></button>
                    </div>)}
                    {entry.blocks.length === 0 && <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500">No hay bloques configurados.</div>}
                  </div>
                </div>
              </div>)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Excepciones por fecha</h3>
                <p className="text-sm text-gray-500 mt-1">Tienen prioridad sobre la semana base. Puedes bloquear un dia completo o definir horarios especiales.</p>
              </div>
              <button type="button" onClick={resetExceptionForm} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Nueva excepcion</button>
            </div>

            {availabilityExceptionActionError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{availabilityExceptionActionError}</div>}

            <form onSubmit={handleSaveExceptionRange} className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <h4 className="font-semibold text-slate-800">Bloquear periodo</h4>
                <p className="mt-1 text-xs text-slate-500">Ideal para vacaciones, congresos o ausencias de varios dias. Creara dias no disponibles en todo el rango.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Inicio</label>
                  <input type="date" value={exceptionRangeForm.startDate} onChange={(event) => handleExceptionRangeFieldChange('startDate', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Fin</label>
                  <input type="date" value={exceptionRangeForm.endDate} onChange={(event) => handleExceptionRangeFieldChange('endDate', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {exceptionRangeDayCount > 0
                    ? `Se bloquearan ${exceptionRangeDayCount} dia${exceptionRangeDayCount === 1 ? '' : 's'} completos.`
                    : 'Selecciona un rango valido para bloquear el periodo.'}
                </p>
                <button type="submit" disabled={isSavingAvailabilityException || exceptionRangeDayCount === 0} className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed">
                  {isSavingAvailabilityException ? 'Guardando...' : 'Bloquear periodo'}
                </button>
              </div>
            </form>

            <form onSubmit={handleSaveException} className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-gray-800">{editingExceptionDate ? 'Editar excepcion' : 'Nueva excepcion'}</h4>
                  <p className="text-xs text-gray-500 mt-1">Usa esta configuracion para vacaciones, feriados o un horario especial en una fecha puntual.</p>
                </div>
                {editingExceptionDate && <button type="button" onClick={resetExceptionForm} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">Limpiar</button>}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha</label>
                  <input type="date" value={exceptionForm.date} onChange={(event) => handleExceptionFieldChange('date', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
                  <input type="checkbox" checked={exceptionForm.isUnavailable} onChange={(event) => handleExceptionFieldChange('isUnavailable', event.target.checked)} disabled={isSavingAvailabilityException} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Marcar este dia como no disponible
                </label>
              </div>

              {!exceptionForm.isUnavailable && <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Bloques para esta fecha</p>
                    <p className="text-xs text-gray-500">Estos horarios reemplazan la disponibilidad semanal solo en este dia.</p>
                  </div>
                  <button type="button" onClick={handleAddExceptionBlock} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"><Plus size={14} className="mr-2" /> Agregar bloque</button>
                </div>
                <div className="space-y-2">
                  {exceptionForm.blocks.map((block) => <div key={block.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                    <select value={block.startTime} onChange={(event) => handleExceptionBlockChange(block.id, 'startTime', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      {availabilityStartOptions.map((option) => <option key={option.value} value={option.value}>Desde {option.label}</option>)}
                    </select>
                    <select value={block.endTime} onChange={(event) => handleExceptionBlockChange(block.id, 'endTime', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      {availabilityEndOptions.map((option) => <option key={option.value} value={option.value}>Hasta {option.label}</option>)}
                    </select>
                    <button type="button" onClick={() => handleRemoveExceptionBlock(block.id)} disabled={isSavingAvailabilityException} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={16} /></button>
                  </div>)}
                </div>
              </div>}

              <button type="submit" disabled={isSavingAvailabilityException || !exceptionForm.date} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
                {isSavingAvailabilityException ? 'Guardando...' : editingExceptionDate ? 'Guardar excepcion' : 'Crear excepcion'}
              </button>
            </form>

            <div className="mt-4 space-y-3">
              {availabilityExceptions.length > 0 ? availabilityExceptions.map((exception) => (
                <div key={exception.date} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 capitalize">{formatExceptionDate(exception.date)}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {exception.isUnavailable
                          ? 'Dia completo no disponible.'
                          : exception.blocks.map((block) => `${String(block.startTime).slice(0, 5)}-${String(block.endTime).slice(0, 5)}`).join(' | ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleEditException(exception)} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"><Pencil size={14} className="mr-2" /> Editar</button>
                      <button type="button" onClick={() => handleDeleteException(exception.date)} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={14} className="mr-2" /> Eliminar</button>
                    </div>
                  </div>
                </div>
              )) : <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">Todavia no hay excepciones configuradas.</div>}
            </div>
          </div>
        </div>}
      </div>

      {isPsychologist && isWaitlistModalOpen && (
        <ModalShell
          title="Lista de espera"
          description="Reserva la prioridad de un paciente sobre un horario ya ocupado por si luego se libera."
          onClose={closeWaitlistModal}
        >
          <div className="space-y-5">
            <form onSubmit={handleSubmitWaitlist} className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              {waitlistActionError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{waitlistActionError}</div>}
              <div>
                <h4 className="font-semibold text-slate-900">Agregar paciente a espera</h4>
                <p className="mt-1 text-xs text-slate-600">Solo puedes anotar al paciente sobre horarios actualmente ocupados. Si ese espacio se libera, la solicitud queda visible para seguimiento.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Paciente</label>
                <select name="pacienteId" value={waitlistForm.pacienteId} onChange={handleWaitlistChange} disabled={isSavingWaitlist} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Selecciona un paciente</option>
                  {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Fecha</label>
                  <input type="date" name="fecha" value={waitlistForm.fecha} onChange={handleWaitlistChange} disabled={isSavingWaitlist} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Horario ocupado</label>
                  <select name="hora24" value={normalizedWaitlistHourValue} onChange={handleWaitlistChange} disabled={isSavingWaitlist || occupiedSlotOptions.length === 0 || hasWaitlistSameDayConflict} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    <option value="">{hasWaitlistSameDayConflict ? 'Paciente ya agendado ese dia' : occupiedSlotOptions.length > 0 ? 'Selecciona un horario ocupado' : 'No hay horarios ocupados'}</option>
                    {occupiedSlotOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">{hasWaitlistSameDayConflict ? `Este paciente ya tiene una cita activa ese dia a las ${waitlistSameDayPatientAppointment?.hora || ''}.` : waitlistSlotsMessage}</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Notas</label>
                <textarea name="notas" value={waitlistForm.notas} onChange={handleWaitlistChange} disabled={isSavingWaitlist} rows="3" className="w-full rounded-lg border border-gray-300 bg-white p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" placeholder="Ej. Prefiere este horario por trabajo o escuela." />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => resetWaitlistForm(waitlistForm.fecha || selectedDate || todayDate)} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Limpiar</button>
                <button type="submit" disabled={isSavingWaitlist || !waitlistForm.pacienteId || !waitlistForm.fecha || !normalizedWaitlistHourValue || hasWaitlistSameDayConflict} className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed">
                  <Users size={16} className="mr-2" /> {isSavingWaitlist ? 'Guardando...' : 'Agregar a espera'}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900">Solicitudes activas</h4>
                  <p className="mt-1 text-xs text-slate-500">Visualiza la espera por fecha y elimina solicitudes que ya no apliquen.</p>
                </div>
                <input type="date" value={waitlistForm.fecha} onChange={handleWaitlistChange} name="fecha" className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div className="mt-4 space-y-3">
                {waitlistGroupsForSelectedDate.map((slot) => (
                  <div key={slot.hora24} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{slot.hora}</p>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getWaitlistBadgeClasses()}`}>
                            <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getWaitlistCountDotClasses()}`} />
                            {slot.entries.length} en espera
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {slot.slotAppointments.length > 0
                            ? `Horario ocupado por ${slot.slotAppointments.map((appointment) => patients.find((patient) => patient.id === appointment.pacienteId)?.nombre).filter(Boolean).join(' / ')}.`
                            : 'El horario ya se libero, pero la lista de espera sigue disponible para reagendar.'}
                        </p>
                        {slot.entries[0] && (
                          <p className="mt-2 text-xs font-medium text-violet-700">
                            Siguiente sugerido: <span className="font-semibold">{slot.entries[0].pacienteNombre}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {slot.slotAppointments.length === 0 && slot.entries[0] && (
                          <button
                            type="button"
                            onClick={() => openAppointmentModalFromWaitlistEntry(slot.entries[0])}
                            className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <CalendarPlus size={14} className="mr-2" /> Reagendar con prioridad 1
                          </button>
                        )}
                        {slot.entries.length > 1 && <p className="text-xs font-medium text-slate-500">Arrastra para cambiar prioridad</p>}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {slot.entries.map((entry, index) => (
                        <div
                          key={entry.id}
                          draggable={!isSavingWaitlist}
                          onDragStart={() => setDraggedWaitlistEntryId(entry.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={async (event) => {
                            event.preventDefault();
                            await handleReorderWaitlistEntries(slot, draggedWaitlistEntryId, entry.id);
                            setDraggedWaitlistEntryId(null);
                          }}
                          onDragEnd={() => setDraggedWaitlistEntryId(null)}
                          className={`rounded-xl border bg-white p-4 transition ${draggedWaitlistEntryId === entry.id ? 'border-violet-300 opacity-70 shadow-sm' : 'border-slate-200'} ${isSavingWaitlist ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                                <p className="font-semibold text-slate-900">{entry.pacienteNombre}</p>
                                {index === 0 && <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Siguiente sugerido</span>}
                              </div>
                              {entry.notas && <p className="mt-2 text-sm text-slate-600">{entry.notas}</p>}
                            </div>
                            <button type="button" onClick={() => handleDeleteWaitlistEntry(entry.id)} disabled={processingWaitlistId === entry.id || isSavingWaitlist} className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed">
                              <Trash2 size={14} className="mr-2" />
                              {processingWaitlistId === entry.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {waitlistGroupsForSelectedDate.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    No hay pacientes en lista de espera para esta fecha.
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {isPsychologist && isAvailabilityModalOpen && (
        <ModalShell
          title="Disponibilidad semanal"
          description="Agrega uno o varios bloques por dia para cubrir manana, tarde o turnos partidos."
          onClose={closeAvailabilityModal}
        >
          {availabilityActionError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{availabilityActionError}</div>}
          <div className="space-y-3">
            {normalizedAvailabilityDraft.map((entry) => <div key={entry.weekday} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{weekdayLabels[entry.weekday]}</p>
                    <p className="text-xs text-gray-500">{entry.blocks.length > 0 ? `${entry.blocks.length} bloque(s)` : 'Sin disponibilidad ese dia'}</p>
                  </div>
                  <button type="button" onClick={() => handleAddAvailabilityBlock(entry.weekday)} disabled={isSavingAvailability} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"><Plus size={14} className="mr-2" /> Agregar bloque</button>
                </div>
                <div className="space-y-2">
                  {entry.blocks.map((block) => <div key={block.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                    <select value={block.startTime} onChange={(event) => handleAvailabilityBlockChange(entry.weekday, block.id, 'startTime', event.target.value)} disabled={isSavingAvailability} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      {availabilityStartOptions.map((option) => <option key={option.value} value={option.value}>Desde {option.label}</option>)}
                    </select>
                    <select value={block.endTime} onChange={(event) => handleAvailabilityBlockChange(entry.weekday, block.id, 'endTime', event.target.value)} disabled={isSavingAvailability} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      {availabilityEndOptions.map((option) => <option key={option.value} value={option.value}>Hasta {option.label}</option>)}
                    </select>
                    <button type="button" onClick={() => handleRemoveAvailabilityBlock(entry.weekday, block.id)} disabled={isSavingAvailability} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={16} /></button>
                  </div>)}
                  {entry.blocks.length === 0 && <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500">No hay bloques configurados.</div>}
                </div>
              </div>
            </div>)}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeAvailabilityModal} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cerrar</button>
            <button type="button" onClick={handleSaveAvailability} disabled={isSavingAvailability} className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"><Save size={16} className="mr-2" /> {isSavingAvailability ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </ModalShell>
      )}

      {isPsychologist && isExceptionsModalOpen && (
        <ModalShell
          title="Excepciones por fecha"
          description="Bloquea un dia completo, crea horarios especiales o marca vacaciones de varios dias."
          onClose={closeExceptionsModal}
        >
          {availabilityExceptionActionError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{availabilityExceptionActionError}</div>}
          <form onSubmit={handleSaveExceptionRange} className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-800">{editingExceptionRange ? 'Editar periodo bloqueado' : 'Bloquear periodo'}</h4>
                <p className="mt-1 text-xs text-slate-500">Ideal para vacaciones, congresos o ausencias de varios dias. Creara dias no disponibles en todo el rango.</p>
              </div>
              {editingExceptionRange && <button type="button" onClick={() => resetExceptionRangeForm(selectedDate || todayDate)} className="text-sm font-medium text-slate-500 transition hover:text-slate-800">Cancelar edicion</button>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Inicio</label>
                <input type="date" value={exceptionRangeForm.startDate} onChange={(event) => handleExceptionRangeFieldChange('startDate', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Fin</label>
                <input type="date" value={exceptionRangeForm.endDate} onChange={(event) => handleExceptionRangeFieldChange('endDate', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {exceptionRangeDayCount > 0
                  ? `Se bloquearan ${exceptionRangeDayCount} dia${exceptionRangeDayCount === 1 ? '' : 's'} completos.`
                  : 'Selecciona un rango valido para bloquear el periodo.'}
              </p>
              <button type="submit" disabled={isSavingAvailabilityException || exceptionRangeDayCount === 0} className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed">
                {isSavingAvailabilityException ? 'Guardando...' : editingExceptionRange ? 'Guardar periodo' : 'Bloquear periodo'}
              </button>
            </div>
          </form>

          <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <h4 className="font-semibold text-slate-800">Periodos bloqueados</h4>
              <p className="mt-1 text-xs text-slate-500">Administra vacaciones o ausencias largas sin editar cada dia por separado.</p>
            </div>
            {blockedExceptionRanges.length > 0 ? blockedExceptionRanges.map((range) => (
              <div key={`${range.startDate}-${range.endDate}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800 capitalize">{formatBlockedRangeLabel(range)}</p>
                    <p className="mt-1 text-sm text-slate-500">{range.dayCount} dia{range.dayCount === 1 ? '' : 's'} bloqueado{range.dayCount === 1 ? '' : 's'}.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleEditExceptionRange(range)} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"><Pencil size={14} className="mr-2" /> Editar</button>
                    <button type="button" onClick={() => handleDeleteExceptionRange(range)} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={14} className="mr-2" /> Desbloquear</button>
                  </div>
                </div>
              </div>
            )) : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Todavia no hay periodos bloqueados.</div>}
          </div>

          <form onSubmit={handleSaveException} className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-gray-800">{editingExceptionDate ? 'Editar excepcion' : 'Nueva excepcion'}</h4>
                <p className="text-xs text-gray-500 mt-1">Usa esta configuracion para vacaciones, feriados o un horario especial en una fecha puntual.</p>
              </div>
              {editingExceptionDate && <button type="button" onClick={resetExceptionForm} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">Limpiar</button>}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha</label>
                <input type="date" value={exceptionForm.date} onChange={(event) => handleExceptionFieldChange('date', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
                <input type="checkbox" checked={exceptionForm.isUnavailable} onChange={(event) => handleExceptionFieldChange('isUnavailable', event.target.checked)} disabled={isSavingAvailabilityException} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                Marcar este dia como no disponible
              </label>
            </div>

            {!exceptionForm.isUnavailable && <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Bloques para esta fecha</p>
                  <p className="text-xs text-gray-500">Estos horarios reemplazan la disponibilidad semanal solo en este dia.</p>
                </div>
                <button type="button" onClick={handleAddExceptionBlock} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"><Plus size={14} className="mr-2" /> Agregar bloque</button>
              </div>
              <div className="space-y-2">
                {exceptionForm.blocks.map((block) => <div key={block.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                  <select value={block.startTime} onChange={(event) => handleExceptionBlockChange(block.id, 'startTime', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    {availabilityStartOptions.map((option) => <option key={option.value} value={option.value}>Desde {option.label}</option>)}
                  </select>
                  <select value={block.endTime} onChange={(event) => handleExceptionBlockChange(block.id, 'endTime', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    {availabilityEndOptions.map((option) => <option key={option.value} value={option.value}>Hasta {option.label}</option>)}
                  </select>
                  <button type="button" onClick={() => handleRemoveExceptionBlock(block.id)} disabled={isSavingAvailabilityException} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={16} /></button>
                </div>)}
              </div>
            </div>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={resetExceptionForm} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Limpiar</button>
              <button type="submit" disabled={isSavingAvailabilityException || !exceptionForm.date} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed">
                {isSavingAvailabilityException ? 'Guardando...' : editingExceptionDate ? 'Guardar excepcion' : 'Crear excepcion'}
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-3">
            {datedAvailabilityExceptions.length > 0 ? datedAvailabilityExceptions.map((exception) => (
              <div key={exception.date} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 capitalize">{formatExceptionDate(exception.date)}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {exception.blocks.map((block) => `${String(block.startTime).slice(0, 5)}-${String(block.endTime).slice(0, 5)}`).join(' | ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleEditException(exception)} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"><Pencil size={14} className="mr-2" /> Editar</button>
                    <button type="button" onClick={() => handleDeleteException(exception.date)} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={14} className="mr-2" /> Eliminar</button>
                  </div>
                </div>
              </div>
            )) : <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">Todavia no hay horarios especiales configurados.</div>}
          </div>
        </ModalShell>
      )}

      {isPsychologist && isAppointmentModalOpen && (
        <ModalShell
          title={editingAppointmentId ? 'Editar cita' : 'Nueva cita'}
          description="Agenda citas, ajusta el estado y deja notas logisticas sin salir del calendario."
          onClose={closeAppointmentModal}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {appointmentActionError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{appointmentActionError}</div>}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Paciente</label>
              <select name="pacienteId" value={form.pacienteId || patients[0]?.id || ''} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option value="">Selecciona un paciente</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha</label>
                <input type="date" name="fecha" value={form.fecha || todayDate} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                <p className="mt-1 text-xs text-gray-500">{weekdayLabels[selectedFormWeekday]}: {blockSummary}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Hora</label>
                <select name="hora24" value={normalizedHourValue} onChange={handleChange} disabled={isHourSelectDisabled} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">{hasSameDayPatientConflict ? 'Paciente ya agendado este dia' : selectedDayAvailability.isUnavailable ? 'Dia no disponible' : selectedDayBlocks.length > 0 ? 'Selecciona un horario' : 'Dia sin disponibilidad'}</option>
                  {hourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500">{availableSlotsMessage}</p>
                <p className="mt-1 text-xs text-gray-500">Las sesiones duran 60 minutos y se agendan por hora exacta.</p>
                {occupiedSlotSummaries.length > 0 && (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-800">Horarios ocupados</p>
                    <p className="mt-1 text-xs text-violet-700">{occupiedSlotsMessage}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {occupiedSlotSummaries.map((slot) => (
                        <span key={slot.hora24} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getWaitlistBadgeClasses()}`}>
                          {slot.hora}
                          {slot.waitlistCount > 0 ? ` • Espera ${slot.waitlistCount}` : ' • Ocupado'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Estado</label>
              <select name="estado" value={form.estado} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option value="pendiente">Pendiente</option>
                <option value="completada">Completada</option>
                <option value="no asistio">No asistio</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="recurrenciaActiva"
                  checked={Boolean(form.recurrenciaActiva)}
                  onChange={handleChange}
                  disabled={isSavingAppointment || isEditingRecurringAppointment || form.estado !== 'pendiente'}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">Cita recurrente semanal</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Genera automaticamente este mismo horario cada semana hasta la fecha que elijas.
                  </p>
                  {isEditingRecurringAppointment && (
                    <>
                      <p className="mt-2 text-xs text-slate-500">Esta cita ya forma parte de una recurrencia. Elige si quieres aplicar los cambios solo aqui o desde esta cita hacia adelante.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, recurrenceEditScope: 'single' }))}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${form.recurrenceEditScope !== 'future' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          Solo esta cita
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, recurrenceEditScope: 'future' }))}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${form.recurrenceEditScope === 'future' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          Esta y futuras
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {form.recurrenceEditScope === 'future'
                          ? 'Los cambios se aplicaran desde esta cita hacia adelante dentro de la misma serie.'
                          : 'Los cambios se aplicaran solo a esta cita y la serie seguira igual.'}
                      </p>
                    </>
                  )}
                  {!isEditingRecurringAppointment && form.estado !== 'pendiente' && (
                    <p className="mt-2 text-xs text-slate-500">La recurrencia solo se puede usar con citas en estado pendiente.</p>
                  )}
                </div>
              </div>

              {form.recurrenciaActiva && !isEditingRecurringAppointment && form.estado === 'pendiente' && (
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Repetir hasta</label>
                  <select
                    name="recurrenciaHasta"
                    value={form.recurrenciaHasta}
                    onChange={handleChange}
                    disabled={isSavingAppointment}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">Selecciona un {weekdayLabels[selectedFormWeekday].toLowerCase()} futuro</option>
                    {recurrenceEndDateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Solo se muestran {weekdayLabels[selectedFormWeekday].toLowerCase()} futuros para mantener la recurrencia semanal consistente.</p>
                  {recurrenceOccurrencesCount > 0 && (
                    <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                      Se crearan {recurrenceOccurrencesCount} cita(s) futura(s), para un total de {recurrenceOccurrencesCount + 1} cita(s) contando la inicial.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
              <textarea name="notas" value={form.notas} onChange={handleChange} disabled={isSavingAppointment} rows="4" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" placeholder="Detalles logisticos, contexto o recordatorios de la cita..." />
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {editingAppointment && editingAppointment.recurrenciaGrupoId && (
                <>
                  <button type="button" onClick={() => handleDelete(editingAppointment.id)} disabled={isSavingAppointment || processingAppointmentId === editingAppointment.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed">
                    {processingAppointmentId === editingAppointment.id ? 'Eliminando...' : 'Eliminar solo esta'}
                  </button>
                  <button type="button" onClick={() => handleDeleteFutureRecurrence(editingAppointment)} disabled={isSavingAppointment || processingAppointmentId === editingAppointment.id} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed">
                    {processingAppointmentId === editingAppointment.id ? 'Eliminando...' : 'Eliminar esta y futuras'}
                  </button>
                </>
              )}
              <button type="button" onClick={closeAppointmentModal} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={isSavingAppointment || patients.length === 0 || hasSameDayPatientConflict || (form.recurrenciaActiva && !form.recurrenciaHasta)} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed">{isSavingAppointment ? 'Guardando...' : editingAppointmentId ? 'Guardar cambios' : 'Crear cita'}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
