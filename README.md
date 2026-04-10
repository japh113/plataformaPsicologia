# PsicoPanel

PsicoPanel es una aplicacion web para psicologos y pacientes. Hoy funciona como una `web-app` real y esa es la base activa del repo. La direccion de producto a mediano plazo es migrar la experiencia cliente a una app movil, pero sin perder la logica de negocio ya consolidada en esta version web.

Hoy ya tiene una base funcional real con frontend React + Vite, backend Express, PostgreSQL, auth por roles, agenda, disponibilidad, lista de espera, tareas, recordatorios y expediente clinico.

## Stack actual
- Frontend: React 19, Vite, Tailwind, lucide-react
- Backend: Node.js, Express, PostgreSQL, JWT, bcryptjs
- Base de datos: PostgreSQL

## Stack lean objetivo
Este es el stack de referencia para el futuro del producto y debe mantenerse presente en decisiones tecnicas nuevas:
- React Native + Expo
- Node.js + TypeScript + Express
- PostgreSQL
- Railway o Render
- Auth propia
- Expo Notifications
- Cloudflare R2 si se necesitan archivos
- Resend para emails

Nota:
- hoy el repo sigue en `web-app`
- no se esta migrando todavia a React Native
- los cambios actuales deben intentar no bloquear esa migracion futura

## Estado actual
- Roles reales: `psychologist` y `patient`
- Auth con JWT
- Pacientes persistidos en PostgreSQL
- Citas con reglas de agenda, disponibilidad y conflictos
- Disponibilidad semanal con multiples bloques por dia
- Excepciones por fecha y bloqueos por rango
- Lista de espera por horario con prioridad y drag & drop
- Tareas por paciente
- Historial clinico por sesiones
- Recordatorios in-app

## Estructura
- [`frontend/`](./frontend): app web
- [`backend/`](./backend): API REST + SQL
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): mapa tecnico del sistema
- [`AGENTS.md`](./AGENTS.md): guia operativa para futuros chats/agentes
- [`NOTES.md`](./NOTES.md): decisiones, estado del producto y pendientes

## Correr el proyecto

### Backend
```bash
cd backend
npm install
npm run db:schema
npm run db:seed
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno
- Frontend: usar `frontend/.env.example`
- Backend: usar `backend/.env.example`

## Credenciales demo
- Psicologo: `doctor@psicopanel.com` / `Demo12345!`
- Paciente: `juan@example.com` / `Demo12345!`

## Comandos utiles

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
npm run db:normalize-appointments
npm run db:normalize-future-sessions
```

## Nota importante
Este repo ya trae bastante contexto conversacional convertido en codigo. Antes de tocar agenda, disponibilidad, sesiones o lista de espera, conviene leer:
- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`AGENTS.md`](./AGENTS.md)
- [`NOTES.md`](./NOTES.md)

## Convencion de trabajo
- hacer commits descriptivos cuando un cambio quede estable
- push frecuente a `main` si la tarea ya esta validada
- si el cambio es grande o riesgoso, se puede usar branch temporal, pero por defecto se ha trabajado con commits frecuentes a `main`
