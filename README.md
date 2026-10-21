# Task Manager Frontend

A browser-based project and task management interface built with **Next.js App Router, React, and TypeScript**. It talks to a separate Go REST API and does not connect to PostgreSQL directly.

- **Frontend:** `http://127.0.0.1:3100`
- **Backend API:** `http://127.0.0.1:8080` by default
- **Repository:** [task-manager-frontend](https://github.com/devaanggoswami-debug/task-manager-frontend)
- **Related backend:** [task-manager-backend](https://github.com/devaanggoswami-debug/task-manager-backend)

> **Local-development app:** The current application has no user authentication. The development server binds to loopback (`127.0.0.1`); do not expose it to a public network without adding appropriate authentication and security controls.

## Features

### Projects and sprints

- Create and rename projects.
- View project summaries, task/sprint counts, and derived project health.
- Open a project detail page with **List**, **Board**, and **Overview** views.
- Create and edit sprints, including start/end dates and project association.
- Add tasks to a sprint or remove them from a sprint.
- View derived sprint health and sprint task counts.

### Task management

- Create, view, update, and delete tasks.
- Store an assignee, due date, description, status, category, and project/sprint memberships.
- Use statuses: `not_started`, `in_progress`, `blocked`, and `done`.
- Use categories: `engineering`, `marketing`, `finance`, `sales`, and `compliance`; the backend can assign a category from description keywords when auto-classification is selected.
- Add and review task comments/updates.
- Search and filter tasks by text, project, sprint, status, and category.
- Navigate longer lists with pagination.

### In-app assistant

The assistant UI sends requests to the backend's `/api/chat` endpoint. The current implementation uses a **deterministic, rule-based parser**, not an external LLM. It can create a task from a supported natural-language command and report project or sprint status.

Example prompt:

```text
create task "Fix login bug" for Alice due tomorrow in sprint "Sprint 1" projects Auth and Billing
```

## Tech stack

- Next.js `16.4.2` and React `19.3.0`
- TypeScript
- `fetch`-based API client in `lib/api.ts`
- Vitest, React Testing Library, and jsdom for component/API tests
- ESLint for linting

Use Node.js **20.9 or newer** and npm. The lockfile is committed; use `npm ci` for a reproducible install.

## Getting started

The Go API and PostgreSQL database must be running before the frontend can load or save application data. See the [backend README](https://github.com/devaanggoswami-debug/task-manager-backend) for database/API setup.

### 1. Install dependencies

```bash
git clone https://github.com/devaanggoswami-debug/task-manager-frontend.git
cd task-manager-frontend
npm ci
```

### 2. Configure the API URL

The frontend defaults to `http://127.0.0.1:8080`. Override it only when your backend runs elsewhere.

**Windows PowerShell:**

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8080"
```

**Git Bash / macOS / Linux:**

```bash
export NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:8080"
```

`NEXT_PUBLIC_API_BASE_URL` is a public frontend configuration value, not a secret. Set it before starting Next.js; restart the dev server after changing it.

### 3. Run the development server

```bash
npm run dev
```

Open **http://127.0.0.1:3100**. The package scripts bind the Next.js server to `127.0.0.1` on port `3100`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Next.js development server on port `3100` |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build on port `3100` (run `npm run build` first) |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite once |

Run the checks before submitting changes:

```bash
npm run lint
npm test
npm run build
```

Tests are located in `__tests__/` and cover the task forms/manager, comments, API client, project/sprint views, pagination, assistant UI, and shared UI behavior.

## How the frontend connects to the backend

The API client is in `lib/api.ts`. It sends JSON requests to `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://127.0.0.1:8080`. The backend owns validation, business rules, classification/status calculation, and persistence. PostgreSQL credentials must never be placed in frontend variables.

The frontend relies on these backend route groups:

- `/api/tasks` and `/api/tasks/{id}`
- `/api/tasks/{id}/comments`
- `/api/projects` and `/api/projects/{id}`
- `/api/projects/{id}/status`
- `/api/sprints` and `/api/sprints/{id}`
- `/api/sprints/{id}/status` and `/api/sprints/{id}/tasks`
- `/api/chat`

See the backend repository README for the endpoint/method reference.

## Project structure

```text
app/
  page.tsx                    # Projects landing page
  tasks/page.tsx              # Cross-project task list
  projects/[id]/page.tsx      # Project detail page
  components/                 # Project, sprint, task, board, assistant, and UI components
lib/
  api.ts                      # Typed API client and data contracts
  dialog.ts                   # Dialog helpers
  format.ts                   # Formatting helpers
  hooks.ts                    # Shared React hooks
__tests__/                    # Vitest + React Testing Library tests
package.json
package-lock.json
vitest.config.mts
```

## Notes and limitations

- This repository contains only the frontend; it does not include the Go API or PostgreSQL schema.
- The app is currently designed for local development and has no sign-in/authentication flow.
- The task assistant is backed by rule-based backend logic; it is not an LLM integration.
