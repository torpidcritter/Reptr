# Reptr

A personal fitness app (installable PWA) that tracks workouts, strength progression, physique, nutrition and recovery, with an AI coach grounded in your own data.

## Development

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # unit tests (Vitest)
pnpm lint && pnpm typecheck && pnpm format:check
```

The build plan and task list live in the Reptr build spec. Weights, distances and times are stored in kg, metres and seconds and converted only for display (`src/lib/units`).
