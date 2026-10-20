# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Vailo is a React 19 + TypeScript SPA (Vite) for property management, backed entirely by Firebase (Auth, Firestore, Storage, Cloud Functions). There is also a `functions/` directory with Firebase Cloud Functions (plain JS, Node 24 target).

### Running the application

- **Dev server:** `npm run dev` (Vite on port 5173)
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Lint (root):** `npm run lint` (ESLint, has pre-existing warnings)
- **Lint (functions):** `cd functions && npm run lint`
- See `package.json` and `functions/package.json` for all available scripts.

### Environment variables

The frontend requires `VITE_FIREBASE_API_KEY` set in a root `.env` file (git-ignored). Without it, the app renders a blank page because Firebase cannot initialize. The Cloud Functions directory (`functions/`) has its own `.env` with `GOOGLE_MAPS_API_KEY`.

### Notable caveats

- The root ESLint config reports pre-existing errors (e.g., `react-hooks/static-components` in `App.tsx`). These are not regressions.
- `functions/package.json` requires Node 24 in its `engines` field; npm will warn about engine mismatch when installing on Node 22. This is fine for local development — the Node 24 requirement is for Firebase Cloud Functions deployment only.
- Firebase App Check (ReCAPTCHA Enterprise) will fail in non-browser or non-allowlisted-domain environments. This does not block local development but will produce console errors.
- Two `npm install` targets exist: root (`/workspace`) and `functions/` (`/workspace/functions`).
