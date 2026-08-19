# Isildur frontend

Next.js 16 App Router frontend for the Isildur/ASE prototype: a marketing site, a gated
onboarding form, and an authenticated-looking app (Graph, Search, Dashboard, Control Room,
demo workspace). Tailwind v4, shadcn/ui on Base UI primitives, TanStack Query, Zustand,
Zod, axios.

Backend lives at `../backend` (FastAPI + DuckDB). See the
[root README](../README.md) for the whole-repo picture and
[`docs/isildur.md`](../docs/isildur.md) for the product audit.

## Read `AGENTS.md` first

> This is **not** the Next.js you know.

Next 16.2.6 has breaking changes against what most models were trained on — APIs,
conventions, and file structure all differ. Before writing code, read the relevant guide in
`node_modules/next/dist/docs/` and heed deprecation notices. `AGENTS.md` carries the same
warning for coding agents.

One live example: `next build` currently prints

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

`middleware.ts` still works and the build labels it `ƒ Proxy (Middleware)`. The rename to
`proxy.ts` has not been done yet.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

| Script | Does |
|---|---|
| `dev` | Next dev server (Turbopack) |
| `build` | Production build |
| `start` | Serve a completed build |
| `lint` | ESLint (`eslint-config-next`) |
| `format` | Prettier over `**/*.{ts,tsx}` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |

Full gate:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`lint` currently reports 0 errors and 5 `react-hooks/exhaustive-deps` warnings in
`features/control-room/components/`. `test` runs 463 tests across 47 files.

### Configuration

Copy `.env.example` to `.env.local`. One variable is read today:

| Variable | Read by | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `getApiBaseUrl()` in `lib/axios.ts`, browser-side | `http://localhost:8010` |

All backend calls currently happen in the browser, so no server-side variable is needed and
the default works with no `.env.local`. A server-side `API_URL` for an `app/api/` Route
Handler BFF is planned but nothing reads it yet — do not assume it exists.

`VITE_API_URL` is dead. This was a Vite SPA; it is not one anymore.

## Layout

Routing lives in `app/` and holds **only** routing concerns — `page.tsx`, `layout.tsx`,
`loading.tsx`, `error.tsx`. All real code lives in feature slices. `@/*` maps to the
project root.

```
app/
  layout.tsx, providers.tsx, globals.css   root shell, theme + query providers
  page.tsx                                 / landing
  about|contact|documentation|
  how-it-works|request-access/             ungated marketing routes
  (app)/                                   route group — gated surfaces
    layout.tsx                               AppShell: sidebar + topbar
    app/page.tsx                             redirects to /app/graph
    app/graph|search|dashboard|graph-next/
    app/control-room/                        + 11 tab routes
    demo/enter|workspace/
features/<name>/
  components/ hooks/ services/ stores/ schemas/ types/
components/ui/                             shadcn primitives
components/theme-provider.tsx
hooks/                                     use-access, use-client, use-session
lib/                                       axios, access, query-client, cn, utils
api/query-keys.ts                          TanStack Query key factory
middleware.ts                              access gate
```

The route group `(app)` adds no URL segment; it exists so `/app/*` and `/demo/*` share the
`AppShell` layout while the marketing routes stay outside it.

Feature slices: `marketing`, `access`, `app-shell`, `graph`, `search`, `dashboard`,
`graph-next`, `control-room`, `ase`, `demo`, `findings`.

`features/ase/` is the largest — the domain-agnostic Control Room engines (traced values,
folds, ontology, identity, meaning, reasoning, detection, prediction, revision, exposure,
trust) plus the expedition dataset they run on.

## The demo access gate

`middleware.ts` gates `/app`, `/app/*`, `/demo`, and `/demo/*` on a single cookie:

| | |
|---|---|
| Cookie | `isildur_access` |
| Value | `1` |
| Constants | `ACCESS_COOKIE_NAME` / `ACCESS_COOKIE_VALUE` in `lib/access.ts` |
| On miss | 302 to `/request-access` (query string dropped) |

Completing the `/request-access` form sets the cookie and writes a summary to
`localStorage` under `isildur_access_request`; `hasAccess()` requires both. There is no
authentication behind this — it is a demo gate, forgeable from the console:

```js
document.cookie = "isildur_access=1; path=/"
```

The unauthenticated `POST /access-requests` call to the backend is the only network side
effect. Nothing on the server verifies anything.

## Where real data stops

Only three call sites touch the backend. Everything else is generated in the browser, which
means most of the app renders correctly with FastAPI stopped.

| Route | Data source |
|---|---|
| `/app/graph` | **Backend** — `features/graph/services/objects.ts` → `GET /objects`, `GET /objects/{id}` |
| `/app/search` | **Backend** — `features/search/services/search.ts` → `GET /search` |
| `/request-access` | **Backend** — `features/access/services/access-request.ts` → `POST /access-requests` |
| `/app/dashboard` | Browser fixtures — `features/dashboard`, expedition simulation |
| `/app/graph-next` | Browser fixtures — `features/graph-next/services/dataset.ts` |
| `/app/control-room/*` | Browser fixtures — `features/ase/services/dataset.ts` |
| `/app/control-room/findings` | Browser fixtures — `features/findings/mock/generate.ts` (Argent Holdings) |
| `/demo/enter`, `/demo/workspace` | Browser fixtures — `features/demo/services/*` |

These are three unrelated domains, not one: a synthetic online **gaming operator** behind
the API, an **expedition-safety** world in the Control Room / Graph Next / Dashboard /
Demo, and a leftover **Argent Holdings payments** mock behind Findings. See
`docs/isildur.md` §15.1.

The lone `lib/axios.ts` instance unwraps `{ success, data }` envelopes, raises `ApiError`,
and redirects to `/request-access` on a 401.

## Tests

`vitest.config.ts` runs in the `node` environment and includes only:

```
features/ase/**/*.test.ts
features/graph-next/**/*.test.ts
features/control-room/**/*.test.ts
```

That is deliberate — those slices hold pure services and Zustand stores, which is what is
worth unit-testing. There are no component or route tests, and no test suite for the
FastAPI backend.

## Adding shadcn components

```bash
npx shadcn@latest add button
```

Lands in `components/ui/`. Import as `import { Button } from "@/components/ui/button"`.
