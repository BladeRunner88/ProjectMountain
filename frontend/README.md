# Isildur frontend

React + Vite + Tailwind v4. The marketing site for Isildur/ASE, a gated onboarding flow, and
the authenticated app (graph, search, dashboard) that reads live from the backend API.

## Structure

```
src/
  pages/               one component per route
    Landing.tsx          marketing site
    RequestAccess.tsx    4-step gated onboarding flow
    Graph.tsx            force-directed graph view (react-force-graph-2d)
    Search.tsx           spotlight-style search
    Dashboard.tsx         pipeline health and resolution stats
    HowItWorks.tsx        product mechanism deep-dive page
  components/
    landing/             marketing page sections (Hero, ShowcasePanel, FeatureModule, ...)
    access/              onboarding form fields and steps
    SquareButton.tsx      shared button (light/dark section inversion)
  app/                  authenticated app shell: sidebar, topbar, layout
  lib/
    api.ts                typed client for the backend API
    access.tsx            onboarding/access-gate context (guards /app)
    countries.ts, validation.ts   reference data and form validation
```

## Running

```bash
npm install
npm run dev
```

Talks to the backend at `http://localhost:8010` by default. Set `VITE_API_URL` to point
elsewhere.

## Design system

Inter throughout, no letter-spacing, no dashes in copy, near-white surfaces with a single
accent color, hairline borders, sharp corners on interactive controls. See the component
files under `components/landing/` for the concrete rules in practice.
