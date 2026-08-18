# Odoc frontend

React/Vite frontend for Odoc. The local development application is served through the
Docker Compose stack in the sibling `odoc` repository.

## Local checks

From this directory, use Corepack's pinned pnpm release:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm api:check
corepack pnpm test:e2e
```

`openapi/odoc-v1.json` is the versioned backend contract snapshot. The generated
`src/generated/odoc-api.ts` file is never edited by hand; refresh both from the backend
contract as part of an explicitly coordinated API change.
`openapi/contract-manifest.json` pins its version and SHA-256, and
`pnpm api:check` verifies that checksum plus generated client drift. The frontend embeds
the pinned version in its API requests for correlation; a future release artifact/update
workflow will distribute this file without needing a sibling checkout.

`openapi/odoc-thin-slice-v1.json` and `src/generated/odoc-thin-slice-api.ts` are a
separate, profile-gated P0 test contract. They prove that the same transport and MSW
fixtures support an idempotent command without exposing that test route in the normal
production contract; `pnpm api:check` verifies their generated-code drift as well.

Once Odoc publishes immutable contract artifacts, manually dispatch **Sync published
OpenAPI contract** in GitHub Actions with the JSON artifact and matching manifest URLs.
It verifies both, regenerates the client, and opens a reviewable update PR; it has no
schedule and cannot change the repository unless an authorized maintainer runs it.

The MVP currently uses a development-only shared login. The next authentication milestone
introduces invite-only email/password accounts and secure sessions; OIDC/SSO providers
will be optional additions.

## Supported browser checks

Chromium is the fast local and CI smoke lane (`pnpm test:e2e`). Firefox and WebKit are
configured as the release-candidate compatibility lane (`pnpm test:e2e:all`). Install
the three pinned Playwright browser runtimes once with `pnpm test:e2e:install`; browser
artifacts are retained only when a test fails. The shared `e2e/fixtures.ts` session
fixture is the only browser-test boundary that knows about the temporary development
login, so it will move to secure cookie sessions in Phase 1.

`pnpm test:e2e:mock` serves the already-built production bundle and intercepts the
versioned API routes in the browser. It is the CI smoke lane because it proves the
frontend repository independently; `pnpm test:e2e` remains the real Docker Compose
integration lane.

## Component catalog

Run the frontend and open `/ui-preview` to review the project-owned accessible
primitives (including keyboard behavior) without relying on a feature screen.
Icon-only controls must have an accessible name and an adjacent tooltip; external
icon libraries are not adopted until their license, accessibility, and bundle
impact have been reviewed.

## License

Licensed under the [Apache License 2.0](LICENSE).
