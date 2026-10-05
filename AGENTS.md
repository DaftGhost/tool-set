# Repository Guidelines

## Project Structure & Modules

This repository hosts independent tools that may use different languages and frameworks. `catalog/` contains the site catalog, `scripts/` contains the site builder and its tests, and `tools/<tool-name>/` owns each tool’s source, README, configuration, dependencies, and `tool.json` registration. Put cross-tool product or operations documentation in `docs/`. The root package coordinates catalog builds and tests; `site/` is generated output, so make changes in source directories instead. Keep each tool’s lockfile and build commands with that tool. Add shared packages only when multiple tools need the same implementation.

## Documentation and Test Artifacts

- Keep `docs/` for maintained documentation: requirements, plans, design decisions, research findings, and operating instructions.
- Store one-off test files, temporary test scripts, executable audit notebooks, screenshots, logs, raw outputs, and copied acceptance samples under the repository-root `./.test-result/<task>/`. Classify by purpose, even when an output uses `.md` or `.ipynb`.
- Keep reusable automated tests and their fixtures with the owning tool or root test suite. Keep application data and import checkpoints in the paths required by their runtime or data workflow.
- Keep `./.test-result/` ignored by Git and outside build inputs. Documentation may summarize results and link to local evidence; identify local-only evidence so a fresh clone does not imply it contains those files.
- When moving artifacts, preserve their contents and update every repository reference. Complete the cleanup when all one-off artifacts are in `./.test-result/`, `docs/` contains documentation, and updated links resolve.

## Adding a Browser Tool

Follow this sequence when adding a directory registered by `tools/<tool-name>/tool.json`:

1. Create a self-contained project under `tools/<kebab-case-name>/`. Keep its source, README, package manifest, lockfile, configuration, and tool-specific checks in that directory; choose a local stack. The project is ready when a developer can install and run it using its README.
2. Add `tool.json` with `schemaVersion: 1`, `kind: "browser"`, and non-empty `category`, `actionLabel`, `name`, and `summary` fields. Declare its `dev` and `build` commands. Before setting metadata, read `tools/llm-api-cost-calculator/tool.json` and the root README’s “开发服务元数据” section for the schema, placeholders, and HMR/watch behavior. The metadata is ready when it passes validation in `scripts/dev-site.mjs` and `scripts/build-site.mjs`.
3. Configure the development server to serve the tool at `/tools/<tool-directory-name>/`. Use `{port}` and `{basePath}` in the command; add `{host}` when the server needs an explicit bind address. For HMR, set `hmr: true` and pass `{rootPort}` to the tool’s HMR client configuration. Without HMR, set `hmr: false` and list the source paths in `dev.watch`. The dev integration is ready when `corepack pnpm dev` discovers the tool, lists it on `http://localhost:5173/`, and serves it at its tool route.
4. Set `build.outputDirectory` to a relative directory inside the tool project, and ensure that directory contains `index.html` after the build. Add the tool README link under the root README’s “工具说明” heading. The production integration is ready when `corepack pnpm run build` publishes it to `site/tools/<tool-directory-name>/` and the generated catalog entry links there.
5. Install the tool’s dependencies using the package manager documented by its README. Run `corepack pnpm run test` and `corepack pnpm run build`, then start development mode and open both `http://localhost:5173/` and `http://localhost:5173/tools/<tool-directory-name>/`. The addition is complete when both root commands pass and both pages load with the tool listed and usable.

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
