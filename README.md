# Recap Canvas
A Vite + React app for building recap experiences.

## Product Requirements
See the full PRD: [`docs/PRD.md`](docs/PRD.md)

## Installation
1. Install Node.js 18+ and npm.
2. From the repo root, install dependencies:
   ```bash
   npm install
   ```

## Running the app
- Start the dev server (with HMR):
  ```bash
  npm run dev
  ```
- Build for production:
  ```bash
  npm run build
  ```
- Preview the production build locally:
  ```bash
  npm run preview
  ```

## Linting
Run ESLint across the project:
```bash
npm run lint
```

## GPT Integration (Optional Demo)
1) In a new terminal, start the backend with your key:
   ```bash
   cd server
   cp .env.example .env   # add your OPENAI_API_KEY
   npm install
   npm run dev
   ```
2) From the repo root, run the frontend:
   ```bash
   npm run dev
   ```
