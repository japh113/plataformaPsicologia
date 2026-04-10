# AGENTS

## Proposito
Este archivo existe para que cualquier chat nuevo o agente futuro arranque con contexto operativo real y no tenga que reconstruirlo desde cero.

## Producto
PsicoPanel es una plataforma clinica para psicologos y pacientes con foco en:
- agenda
- seguimiento clinico
- tareas
- sesiones
- disponibilidad
- lista de espera

Importante:
- hoy el producto activo en este repo es una `web-app`
- la direccion futura es una app movil
- cualquier agente nuevo debe tener presente ambas cosas al proponer cambios

## Stack objetivo a tener presente
Aunque hoy se trabaja sobre React web + Vite, la referencia futura del producto es:
- React Native + Expo
- Node.js + TypeScript + Express
- PostgreSQL
- Railway o Render
- Auth propia
- Expo Notifications
- Cloudflare R2 si se necesitan archivos
- Resend para emails

Esto no significa migrar ahora mismo.
Significa:
- no perder de vista que esta web-app es una base transitoria del producto
- favorecer logica reutilizable y contratos claros
- evitar acoplar decisiones innecesarias solo a web cuando haya alternativa razonable

## Estado del repo
- rama principal de trabajo: `main`
- el proyecto ya viene con muchos cambios integrados y funcionales
- se acostumbra hacer `commit + push` frecuente a `main` cuando el cambio esta estable
- si un cambio es mas riesgoso o exploratorio, se puede abrir branch temporal y luego mergear

## Convenciones de trabajo
- preservar el estilo visual ya existente
- no introducir redisenos bruscos sin motivo claro
- preferir mejoras incrementales
- cuando haya riesgo operativo, priorizar flujo manual asistido sobre automatizacion total

## Reglas funcionales importantes

### Citas
- duran 60 minutos
- se agendan por hora exacta
- no se permiten solapamientos
- un paciente no puede tener multiples citas activas el mismo dia
- si una cita tiene sesion vinculada, no debe volver a pendiente o cancelada
- no se pueden completar citas futuras

### Sesiones
- no se registra sesion sin cita
- no se registran sesiones para citas futuras
- el flujo correcto es cita -> completada -> sesion

### Waitlist
- la asignacion desde lista de espera debe ser manual, no automatica
- el sistema solo debe sugerir a la prioridad 1
- el psicologo debe conservar control final

### Disponibilidad
- soporta multiples bloques por dia
- soporta excepciones por fecha
- soporta bloqueos por rango
- no se debe permitir guardar disponibilidad que deje citas futuras fuera de cobertura

## UX preferences del usuario
- menos ruido visual, especialmente en expediente
- preferencia por modales cuando una pantalla se satura
- agenda visual limpia
- mensual tipo calendario, no lista
- semanal y mensual con chips compactos
- colores semanticos claros
- no mezclar colores de conceptos distintos

## Archivos calientes
Estos archivos concentran mucho comportamiento:
- [`frontend/src/App.jsx`](./frontend/src/App.jsx)
- [`frontend/src/screens/AppointmentsScreen.jsx`](./frontend/src/screens/AppointmentsScreen.jsx)
- [`frontend/src/screens/NotesScreen.jsx`](./frontend/src/screens/NotesScreen.jsx)
- [`backend/src/modules/appointments/appointments.service.js`](./backend/src/modules/appointments/appointments.service.js)
- [`backend/src/modules/patients/patients.service.js`](./backend/src/modules/patients/patients.service.js)
- [`backend/src/modules/availability/availability.service.js`](./backend/src/modules/availability/availability.service.js)

## Checklist antes de cerrar una tarea
1. Revisar impacto en frontend y backend si toca agenda
2. Verificar si hay efectos colaterales en waitlist o disponibilidad
3. Correr:
   - `cd frontend && npm run lint`
   - `cd frontend && npm run build`
4. Si cambia schema o seed:
   - `cd backend && npm run db:schema`
   - `cd backend && npm run db:seed`
5. Hacer commit descriptivo
6. Push a `main` si el cambio esta estable

## Regla operativa sobre commits
- no acumular demasiado trabajo sin commit
- preferir commits pequenos y descriptivos por feature o ajuste importante
- si se actualizaron docs/contexto, tambien commitearlo
- cuando el usuario lo permita, empujar periodicamente a `main`

## Commits
Preferir mensajes concretos:
- `feat: ...`
- `fix: ...`
- `refactor: ...`

Evitar mensajes genericos.

## No olvidar
- hay decisiones de producto ya tomadas que conviene respetar
- Google Calendar y WhatsApp estan pensados como fase futura, no implementados todavia
- no asumir que "automatico" es mejor en procesos clinicos
