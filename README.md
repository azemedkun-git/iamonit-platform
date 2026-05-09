# IAMONIT Platform

Multi-tenant logistics task management SaaS platform connecting transporters and car pullers.

## Tech Stack
- Next.js
- NestJS
- PostgreSQL
- Supabase
- Tailwind CSS

## Monorepo Structure

```txt
iamonit-platform/
├── apps/
│   ├── web/
│   └── api/
├── packages/
├── infra/
└── docs/
```

## Development

```bash
pnpm install
pnpm --filter web dev
pnpm --filter api start:dev
```

## Vision
IAMONIT aims to become the operating system for logistics task execution and field workforce coordination.
