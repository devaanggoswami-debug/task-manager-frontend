# Task Manager Frontend

A browser-based project and task management interface built with the
**Next.js App Router, React, and TypeScript**. It talks to a separate Go REST
API over JSON and never connects to PostgreSQL directly. The backend and
database are maintained in
[task-manager-backend](https://github.com/devaanggoswami-debug/task-manager-backend).

- **Frontend (local):** `http://127.0.0.1:3100`
- **Backend API (local default):** `http://127.0.0.1:8080`
- **Repository:** [task-manager-frontend](https://github.com/devaanggoswami-debug/task-manager-frontend)
- **Related backend:** [task-manager-backend](https://github.com/devaanggoswami-debug/task-manager-backend)

> **No authentication.** Neither this app nor the API it calls has any sign-in
> or access control. The dev server binds to loopback (`127.0.0.1`). Do not
> expose it, or point it at a backend that holds sensitive data, without first
> adding authentication and the appropriate production security controls.

## Architecture

```
Browser ──▶ Next.js frontend ──HTTP/JSON──▶ Go REST API ──▶ PostgreSQL
            (React, TypeScript)              │
                                             └──▶ Gemini (free-form chat only,
                                                  server-side key)
```

- **Frontend:** Next.js (App Router) with React and TypeScript. UI, routing, and
  form handling only — all business logic, validation, classification, and
  status calculation live in the backend.
- **Backend:** a Go `net/http` API that owns persistence and rules.
- **Database:** PostgreSQL, accessed only by the backend.
- **Assistant:** the in-app chat calls the backend's `/api/chat`. The backend
  answers task and status commands deterministically and forwards free-form
  questions to **Google's Gemini** when a server-side key is configured. The
  Gemini key lives only in the backend and is never exposed to the browser.

## Features

### Projects and sprints

- Create and rename projects; view task/sprint counts and derived project
  health.
- Open a project detail page with **List**, **Board**, and **Overview** views.
- Create and edit sprints (name, start/end dates, project association).
- Add tasks to a sprint, or remove them from a sprint. Unassigned (legacy)
  sprints without a project can be edited to adopt one.

### Task management

- Create, view, update, and delete tasks.
- Each task stores an assignee, due date, description, status, category, and
  project/sprint memberships.
- Statuses: `not_started`, `in_progress`, `blocked`, `done`.
- Categories: `engineering`, `marketing`, `finance`, `sales`, `compliance`.
  Leaving the category on **Auto-classify** lets the backend pick one from
  description keywords (defaulting to Engineering); older tasks may show
  **Unclassified**.
- Add and review task comments/updates.
- Search and filter tasks by text, project, sprint, status, and category;
  filters are reflected in the URL so links and the Back button work.
- Navigate longer lists with Previous/Next pagination and a page-size choice.

### Status management

- Derived health (**On track**, **At risk**, **Blocked**) for projects and
  sprints, fetched from the backend's `/status` endpoints and shown with its
  reason and counts.

### In-app assistant

Open the assistant with **Show assistant** on any page. It sends messages to the
backend's `/api/chat` endpoint:

- **Create a task** from a natural-language command (handled deterministically
  by the backend):

  ```text
  create task "Fix login bug" for Alice due tomorrow in sprint "Sprint 1" projects Auth and Billing
  ```

  The due date may be `YYYY-MM-DD`, `today`, `tomorrow`, a weekday, or
  `in N days`. On-page lists refresh automatically after a task is created.
- **Ask for status** (also deterministic): `what's the status of sprint "Sprint 1"?`
- **Ask anything else:** free-form questions (e.g. "which tasks are overdue?")
  are answered by Gemini via the backend when the server-side key is configured;
  otherwise the backend returns a short help reply.

## Tech stack

- Next.js `16.4.2` (App Router; `cacheComponents` and `partialPrefetching`
  enabled in `next.config.ts`) and React `19.3.0`
- TypeScript `5.9`
- A `fetch`-based, typed API client in `lib/api.ts`
- Vitest, React Testing Library, and jsdom for component/API tests
- ESLint (`eslint-config-next`) for linting

## Prerequisites

- **Node.js 20.9 or newer** and npm.
- The **Go API and PostgreSQL database must be running** before the app can load
  or save data. See the
  [backend README](https://github.com/devaanggoswami-debug/task-manager-backend)
  for database and API setup.

The lockfile (`package-lock.json`) is committed; use `npm ci` for a reproducible
install.

## Getting started

### 1. Install dependencies

```bash
git clone https://github.com/devaanggoswami-debug/task-manager-frontend.git
cd task-manager-frontend
npm ci
```

### 2. Configure the API URL (optional for local)

The client defaults to `http://127.0.0.1:8080`, which matches the backend's
local default — so no configuration is needed for a standard local setup.
Override `NEXT_PUBLIC_API_BASE_URL` only when the backend runs elsewhere.

**Windows PowerShell:**

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8080"
```

**Git Bash / macOS / Linux:**

```bash
export NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:8080"
```

`NEXT_PUBLIC_API_BASE_URL` is a **public, build-time** configuration value (any
`NEXT_PUBLIC_*` variable is inlined into the browser bundle), not a secret. Set
it before starting Next.js and restart the dev server after changing it. Never
put secrets — in particular the backend's `GEMINI_API_KEY` or any database
credential — in a `NEXT_PUBLIC_*` variable or anywhere in this frontend.

### 3. Run the development server

```bash
npm run dev
```

Open **http://127.0.0.1:3100** (use `127.0.0.1`, not `localhost` — the backend's
default CORS origin is `http://127.0.0.1:3100`). The `dev` and `start` scripts
bind Next.js to `127.0.0.1` on port `3100` (port 3100 avoids the commonly
occupied 3000).

## Scripts

Defined in `package.json`:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server on `127.0.0.1:3100` |
| `npm run build` | Create a production build (`next build`) |
| `npm run start` | Serve the production build on `127.0.0.1:3100` (run `npm run build` first) |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once (`vitest run`) |

Run the full check before submitting changes:

```bash
npm run lint
npm test
npm run build
```

Tests live in `__tests__/` and cover the task forms/manager, comments, the API
client, project/sprint views, pagination, the assistant UI, layout, and shared
hooks.

## How the frontend connects to the backend

The entire API surface is in `lib/api.ts`: a typed `fetch` client that sends
JSON to `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8080`), surfaces
backend validation errors as a typed `ApiError` (status + per-field messages),
and reads the `X-Total-Count` header for pagination. The backend owns
validation, business rules, keyword classification, status calculation, and
persistence; the frontend sends exactly the fields each endpoint accepts.

The client uses these backend route groups:

- `/api/tasks` and `/api/tasks/{id}`
- `/api/tasks/{id}/comments`
- `/api/projects`, `/api/projects/{id}`, and `/api/projects/{id}/status`
- `/api/sprints`, `/api/sprints/{id}`, `/api/sprints/{id}/status`, and
  `/api/sprints/{id}/tasks`
- `/api/chat`

**The `127.0.0.1` / `localhost` URLs are for local development only.** In a
deployed environment, set `NEXT_PUBLIC_API_BASE_URL` to the backend's public
HTTPS URL, and make sure the backend's `CORS_ORIGIN` is set to this frontend's
deployed origin. See the backend repository README for the full endpoint and
method reference.

## Project structure

```text
app/
  page.tsx                    # Projects landing page (/)
  tasks/page.tsx              # Cross-project task list (/tasks)
  projects/[id]/page.tsx      # Project detail page (/projects/{id})
  layout.tsx, globals.css     # Root layout and global styles
  components/                 # Project, sprint, task, board, assistant, and shared UI components
lib/
  api.ts                      # Typed API client and data contracts
  dialog.ts                   # Dialog helpers
  format.ts                   # Formatting helpers
  hooks.ts                    # Shared React hooks
__tests__/                    # Vitest + React Testing Library tests
next.config.ts                # Next.js config
eslint.config.mjs             # ESLint config
vitest.config.mts             # Vitest config
tsconfig.json
package.json / package-lock.json
```

## Deployment (Vercel)

This app deploys cleanly to Vercel with the default Next.js preset (Vercel
auto-detects Next.js, runs `next build`, and serves it — the `-H`/`-p` flags in
the `dev`/`start` scripts apply only to local runs and are not used by Vercel).

1. **Import the repository** into Vercel and keep the Next.js framework preset.
2. **Set the production API URL.** Add an environment variable
   `NEXT_PUBLIC_API_BASE_URL` set to the backend's public HTTPS URL, for example
   `https://task-manager-backend.onrender.com` (use your actual backend URL).
   Apply it to the Production (and Preview, if desired) environments.
3. **Allow the origin on the backend.** Set the backend's `CORS_ORIGIN` to this
   app's deployed origin (e.g. `https://<your-app>.vercel.app`) so browser calls
   are accepted, and ensure the backend is reachable over HTTPS.
4. **Rebuild after changing `NEXT_PUBLIC_*` variables.** Because `NEXT_PUBLIC_*`
   values are inlined at **build time**, changing `NEXT_PUBLIC_API_BASE_URL`
   does **not** take effect until you trigger a new deployment/build — a restart
   is not enough.

## Notes and limitations

- This repository contains only the frontend; the Go API and PostgreSQL schema
  live in the backend repository.
- There is no authentication; the app is configured for local development by
  default.
- The assistant handles task creation and status queries deterministically and
  forwards only free-form questions to Gemini through the backend. The Gemini
  API key is kept exclusively in the backend environment and must never appear
  in frontend code or a `NEXT_PUBLIC_*` variable. See the backend README for
  Gemini configuration details.

## Related repository

- **Backend:** [task-manager-backend](https://github.com/devaanggoswami-debug/task-manager-backend)
  — the Go REST API and PostgreSQL schema this app depends on.
