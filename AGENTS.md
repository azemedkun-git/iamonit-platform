# Repository Guidelines

## Project Structure & Module Organization

IAMONIT is a pnpm workspace. The NestJS API is under `apps/api`; the future Excel-driven task agent belongs under `packages/task-agent`. Backend features are grouped by domain in `apps/api/src/modules/<feature>/`. Cross-cutting backend code belongs in `apps/api/src/common`, runtime configuration in `apps/api/src/config`, reusable libraries in `packages/`, deployment resources in `infra/`, and documentation in `docs/`.

## Project-Control Sources

The authoritative planning workbook is `planning/IAMONIT_Full_Project_Control_Workbook.xlsx`. The `Backlog` sheet is the authoritative source for project-task status. `IntelliJ Coding Tasks` contains file-level implementation work.

Process only one coding task per execution. Skip tasks whose status is `Done`, `In Progress`, `Blocked`, or `Review`. A `Todo` task is eligible only when every dependency is `Done` in the Backlog. Stop and report any conflicting task statuses between sheets. Never invent or modify task IDs. Successful automated work moves to `Review`, never directly to `Done`.

## Build, Test, and Development Commands

Run commands from the repository root:

- `pnpm install` installs all workspace dependencies.
- `pnpm dev:api` starts the API in watch mode (port `4000` by default).
- `pnpm dev:web` starts the web application once its package is configured.
- `pnpm build` builds every workspace package that defines a build script.
- `pnpm lint` runs each package's linter; the API lint script applies automatic fixes.
- `pnpm test` runs all workspace test suites.
- `pnpm --filter api test:cov` generates API Jest coverage.
- `pnpm --filter api test:e2e` runs API end-to-end tests when `test/jest-e2e.json` is present.

Formatting and lint commands may modify files. Do not run them during a read-only inspection.

## Coding Style & Naming Conventions

Use strict TypeScript and pnpm, following the existing Prettier/ESLint setup. Current code uses two-space indentation, single quotes, and semicolons. Name files in kebab case with NestJS role suffixes, such as `tasks.controller.ts`; use PascalCase for classes and camelCase for methods and variables. Keep domain logic in services and HTTP concerns in controllers.

## Testing Guidelines

The API uses Jest with `ts-jest`; unit tests should be colocated under `src` and named `*.spec.ts`. Add tests for new behavior and regressions, keeping tests focused on public outcomes. No numeric coverage threshold is currently enforced, but avoid reducing meaningful coverage.

## Commit & Pull Request Guidelines

Every Git commit must begin with the exact related task ID from the authoritative workbook, such as `IAM-071 Establish agent rules`. Never commit or push unless explicitly instructed, and never push directly to `main`. Keep commits focused. Pull requests should explain the change, verification performed, configuration or migration impacts, and link the relevant task.

Never commit secrets, `.env` files, generated output (`dist/`, `.next/`, `coverage/`), or Excel lock files such as `~$*.xlsx`. Update `.env.example` when introducing environment variables.
