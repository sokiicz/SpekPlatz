# SpekPlatz

A community map for discovering and sharing hidden spots — rooftops, viewpoints, parks, beaches, and more.

**Live:** [spekplatz.app](https://spekplatz.app)

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Vite |
| Map | Leaflet + React-Leaflet |
| Database | Firebase Firestore (`spekplatz` named database) |
| Hosting | Firebase Hosting |
| Styling | Tailwind CSS v4 (PostCSS, not CDN) |
| Animations | Framer Motion |

## Run locally

```bash
npm install
npm run dev        # → http://localhost:3000
```

## Deploy

Push to `main` → GitHub Actions builds and deploys to Firebase Hosting automatically.

Manual deploy:
```bash
npm run build
firebase deploy --only hosting
```

Firebase project ID: `gen-lang-client-0666255668`
