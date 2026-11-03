# SpekPlatz

A community map for discovering and sharing hidden spots — rooftops, viewpoints, parks, beaches, and more.

**Live:** [spekplatz.app](https://spekplatz.app)

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Vite |
| Map | Leaflet + React-Leaflet (OpenStreetMap, Mapy.com, Esri tiles) |
| Database | Firebase Auth + Firestore (`spekplatz` named database) |
| Hosting | GitHub Pages |
| Styling | Tailwind CSS v4 (PostCSS, not CDN) |
| Animations | Framer Motion |

## Development

```bash
npm ci
npm run dev        # http://localhost:3000
npm run typecheck
npm run build      # typecheck + production build
```

Copy `.env.example` to `.env.local` and fill in the Firebase web config (and optionally `VITE_MAPY_KEY`).
