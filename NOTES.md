# Notes

## Fecha de referencia
Contexto actualizado al `2026-04-13`.

## Recordatorio de producto
- hoy se esta construyendo y operando como `web-app`
- la meta futura sigue siendo migrar a experiencia movil
- el stack lean objetivo a recordar es:
  - React Native + Expo
  - Node.js + TypeScript + Express
  - PostgreSQL
  - Railway o Render
  - Auth propia
  - Expo Notifications
  - Cloudflare R2 si se necesitan archivos
  - Resend para emails

Esto debe mantenerse en mente en futuros chats, aunque el trabajo inmediato siga sobre la base web actual.

## Lo que ya existe
- auth por roles
- pacientes persistidos
- tareas por paciente
- citas persistidas
- disponibilidad semanal por bloques
- excepciones por fecha
- bloqueos por rango
- recordatorios in-app
- historial clinico por notas clinicas
- expediente del paciente
- lista de espera por slot con prioridad y drag & drop
- base de backoffice con roles `support`, `admin` y `superadmin`
- consola inicial para aprobacion de psicologos y revision de usuarios

## Decisiones de producto importantes

### 1. Agenda manual asistida
No se agenda automaticamente a la primera persona en espera.

Razon:
- en contexto clinico y operativo es mas seguro que el psicologo decida
- el sistema sugiere al primer paciente en espera, pero no actua solo

### 2. Notas Clinicas desde citas
No se puede registrar una nota clinica libremente.

Razon:
- el expediente debe amarrarse a la operacion real de agenda

### 3. Menos ruido visual
El usuario prefiere:
- menos bloques al mismo tiempo
- menos listados sobrecargados
- modales cuando una pantalla se satura

### 4. Agenda con fuerte sentido visual
Preferencias marcadas:
- mensual tipo calendario
- chips compactos
- semanal y mensual consistentes
- estados por color claros

### 5. Backoffice separado de lo clinico
- `support` y `admin` no deben asumir acceso clinico total por defecto
- `superadmin` se trata como rol maestro excepcional
- la UI de backoffice debe mantenerse separada de la UI clinica normal

## Pendientes funcionales razonables

### Muy probables
- acciones secundarias en banner de reagenda:
  - `Ver cita`
  - `Abrir expediente`
- mejor feedback al completar acciones desde agenda
- filtros o metricas adicionales sobre pacientes

### Futuros grandes
- Google Calendar sync
- WhatsApp reminders / outreach
- push notifications
- email reminders
- posible version mobile real con Expo / React Native
- migracion progresiva del stack actual web hacia el stack lean objetivo

## Datos demo actuales
- credenciales demo:
  - admin: `admin@psicopanel.com` / `Demo12345!`
  - soporte: `support@psicopanel.com` / `Demo12345!`
  - superadmin: `root@psicopanel.com` / `Demo12345!`
  - psicologo: `doctor@psicopanel.com` / `Demo12345!`
  - paciente: `juan@example.com` / `Demo12345!`
  - psicologo pendiente: `ana.herrera@psicopanel.com` / `Demo12345!`
- pacientes demo extra ya sembrados:
  - Sofia Ramirez
  - Carlos Mendez
  - Valeria Torres

## Scripts utiles

### Backend
```bash
cd backend
npm run db:schema
npm run db:seed
npm run db:normalize-appointments
npm run db:normalize-future-clinical-notes
```

### Frontend
```bash
cd frontend
npm run lint
npm run build
```

## Riesgos a tener en mente
- `AppointmentsScreen.jsx` es una pantalla compleja; tocar una parte puede afectar varias
- `App.jsx` centraliza mucho estado
- si cambia schema, conviene correr seed y revisar flujos reales
- lista de espera y agenda comparten mucha logica de slot, no tocarlas por separado sin revisar ambos lados

## Sugerencia para un nuevo chat
Pedirle al agente nuevo que lea primero:
1. `README.md`
2. `ARCHITECTURE.md`
3. `AGENTS.md`
4. `NOTES.md`

Eso suele ser suficiente para arrancar con bastante contexto sin depender del historial completo.

## Convencion de trabajo a recordar
- hacer commits descriptivos cuando una tarea quede estable
- no dejar cambios grandes sin versionar mucho tiempo
- push periodico a `main` cuando el cambio ya fue validado
