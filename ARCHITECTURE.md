# Architecture

## Vision general
El sistema esta dividido en dos capas:
- `frontend/`: interfaz web para psicologo y paciente
- `backend/`: API REST autenticada sobre PostgreSQL

La app funciona hoy como un producto `web-first`. No se migro todavia a React Native/Expo.

## Direccion futura
Aunque el repo actual es web, la direccion tecnica objetivo del producto es:
- React Native + Expo
- Node.js + TypeScript + Express
- PostgreSQL
- Railway o Render
- Auth propia
- Expo Notifications
- Cloudflare R2 si se necesitan archivos
- Resend para emails

Esto implica:
- no asumir que la UI web actual es la forma final del producto
- intentar preservar reglas de negocio reutilizables
- evitar decisiones que amarren innecesariamente la logica al navegador
- recordar que la migracion movil es futura, no activa hoy

## Frontend

### Base
- Entrada principal: [`frontend/src/App.jsx`](./frontend/src/App.jsx)
- Cliente API: [`frontend/src/api/client.js`](./frontend/src/api/client.js)
- APIs por dominio:
  - [`frontend/src/api/auth.js`](./frontend/src/api/auth.js)
  - [`frontend/src/api/patients.js`](./frontend/src/api/patients.js)
  - [`frontend/src/api/appointments.js`](./frontend/src/api/appointments.js)
  - [`frontend/src/api/availability.js`](./frontend/src/api/availability.js)
  - [`frontend/src/api/reminders.js`](./frontend/src/api/reminders.js)
- Mappers:
  - [`frontend/src/mappers/patients.js`](./frontend/src/mappers/patients.js)
  - [`frontend/src/mappers/appointments.js`](./frontend/src/mappers/appointments.js)

### Pantallas principales
- `DashboardScreen`
- `PatientsScreen`
- `NotesScreen`
- `AppointmentsScreen`
- `LoginScreen`

### Patron de estado
`App.jsx` centraliza casi todo el estado de negocio:
- nota clinica actual
- pacientes
- citas
- disponibilidad
- excepciones
- waitlist
- reminders

Las pantallas reciben callbacks ya resueltos. Esto hace el codigo simple para MVP, aunque en el futuro podria extraerse a context o a una capa de state management.

### Implicacion para futura migracion mobile
Buena parte de la logica hoy ya vive en:
- API REST
- servicios backend
- mappers frontend/backend

Eso ayuda porque una futura app React Native deberia poder reutilizar:
- contrato de API
- reglas clinicas
- reglas de agenda, disponibilidad y waitlist

Lo menos portable hoy es:
- estado concentrado en `App.jsx`
- algunas pantallas grandes con mucha logica visual

## Backend

### Entrada
- App: [`backend/src/app.js`](./backend/src/app.js)
- Server: [`backend/src/server.js`](./backend/src/server.js)
- DB wrapper: [`backend/src/config/db.js`](./backend/src/config/db.js)

### Middlewares
- auth JWT: [`backend/src/middlewares/authMiddleware.js`](./backend/src/middlewares/authMiddleware.js)
- not found
- error handler

### Modulos activos
- `auth`
- `patients`
- `appointments`
- `availability`
- `reminders`
- `health`

### Modulos legacy o menos relevantes
- `notes`
- `tasks`

La mayor parte de la logica real de tareas y notas clinicas se centralizo dentro de `patients`.

## Base de datos

### Esquema principal
Definido en [`backend/sql/schema.sql`](./backend/sql/schema.sql)

Tablas importantes:
- `patients`
- `users`
- `psychologist_patient_access`
- `appointments`
- `appointment_waitlist_entries`
- `patient_tasks`
- `patient_clinical_notes`
- `psychologist_availability`
- `psychologist_availability_blocks`
- `psychologist_availability_exceptions`
- `psychologist_availability_exception_blocks`

### Seeds
- [`backend/sql/seed.sql`](./backend/sql/seed.sql)

## Dominios clave

### Auth y acceso
- `psychologist` ve sus pacientes accesibles
- `patient` solo ve su propio expediente, tareas y citas
- acceso filtrado en servicios con `buildPatientAccessScope`

### Pacientes
- ficha basica
- riesgo
- motivo de consulta
- nota general
- tareas
- notas clinicas

### Citas
- duran 60 minutos
- solo se agendan por hora exacta
- no se permiten solapamientos
- un paciente no puede tener mas de una cita activa el mismo dia
- citas con nota clinica vinculada no pueden volver a `pendiente` ni `cancelada`

### Disponibilidad
- disponibilidad semanal por multiples bloques
- excepciones por fecha
- bloqueos por rango tipo vacaciones
- no se puede recortar disponibilidad dejando citas fuera

### Notas Clinicas
- solo se registran desde una cita existente
- no se permiten notas clinicas sobre citas futuras
- al registrar una nota clinica, la cita queda tratada como completada

### Waitlist
- espera por horario especifico `fecha + hora`
- solo se puede crear sobre slots ocupados
- tiene prioridad persistente por slot
- se puede reordenar por drag & drop
- al crear una cita para ese paciente en ese mismo slot, la entrada pasa a `fulfilled`

## Flujo importante de agenda
1. Psicologo agenda cita
2. Si el slot se llena, otros pacientes pueden entrar a lista de espera
3. Si la cita se cancela, el sistema no agenda automaticamente
4. El sistema sugiere al paciente con prioridad 1
5. El psicologo decide si reagendar manualmente con ese paciente

## Validaciones tecnicas recomendadas

### Frontend
```bash
cd frontend
npm run lint
npm run build
```

### Backend
```bash
cd backend
npm run db:schema
npm run db:seed
```

## Deuda tecnica conocida
- Mucha logica concentrada en `App.jsx`
- `AppointmentsScreen.jsx` es una pantalla grande y de alta complejidad
- Faltan tests automatizados
- Hay modulos backend que podrian simplificarse o reordenarse
- el backend aun no esta en TypeScript aunque ese es el rumbo objetivo
