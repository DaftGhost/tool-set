# Repository Guidelines

## Project Structure & Modules

This repository hosts independent tools that may use different languages and frameworks. `catalog/` contains the site catalog, `scripts/` contains the site builder and its tests, and `tools/<tool-name>/` owns each tool’s source, README, configuration, dependencies, and `tool.json` registration. Put cross-tool product or operations material in `docs/`. The root package coordinates catalog builds and tests; `site/` is generated output, so make changes in source directories instead. Keep each tool’s lockfile and build commands with that tool. Add shared packages only when multiple tools need the same implementation.

## Build, Test, and Development Commands

Use Node.js 24.x and Corepack; the root package pins pnpm 12.7.0.

- `corepack pnpm run test` runs the site-builder and catalog tests.
- `corepack pnpm run build` builds the catalog and all registered browser tools into `site/`.
- `corepack pnpm run serve` serves the built site locally at `http://localhost:9527/`.
- For the calculator, run `cd tools/llm-api-cost-calculator && corepack pnpm install && corepack pnpm run dev`; use `corepack pnpm run typecheck` there for its TypeScript/Vue check.

## Coding Style & Naming

Use TypeScript (`.ts`/`.tsx`) for catalog and tool implementation code. Reject JavaScript (`.js`/`.jsx`) for new modules; migrate an existing JavaScript module to TypeScript before changing its behavior. Root Node build/server scripts and tests remain `.mjs` for the current Node runner. Use two-space indentation and semicolon-free style. Use camelCase for functions and module files, PascalCase for Vue components, and kebab-case for tool directory names (for example, `llm-api-cost-calculator`). Keep tool-specific formatting and linting choices local to that tool; the repository has no global formatter or linter.

## Testing Guidelines

Root tests use Node’s built-in `node:test` and `node:assert/strict`; name test files `*.test.mjs` and describe observable behavior in each test name. Run the root suite after changes to the builder or catalog, and run the affected tool’s own checks after changing it. No repository-wide coverage threshold is configured.

## Commits and Pull Requests

Recent history mostly uses Conventional Commit prefixes, including `feat:`, `fix(<scope>):`, and `chore(<scope>):`. Use a short imperative summary and scope tool-specific changes, such as `fix(llm-api-cost-calculator): handle empty input`. PRs should explain the change and affected tool, list the checks actually run, link a related issue when applicable, and include screenshots for visible UI changes.

## Security and Configuration

Keep credentials and local environment files out of version control. Use placeholders in `.env.example` when documenting required configuration; never commit real secrets.
