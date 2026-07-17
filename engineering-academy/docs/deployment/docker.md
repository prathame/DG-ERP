---
sidebar_label: Docker
title: Docker — The Self-Host Parity Image
description: A line-by-line walkthrough of Dhandho's multi-stage Dockerfile — why it exists even though production runs on Render, not containers.
---

# Docker — The Self-Host Parity Image

:::info Why does a Render-deployed app have a Dockerfile?
Render doesn't require Docker for a Node web service — it builds directly from `package.json`. The `Dockerfile` exists for **local parity and self-hosting**: any customer or contributor who wants to run Dhandho outside Render (their own VPS, a private cloud, a CI smoke test) gets a known-good, reproducible build.
:::

## 1. The full Dockerfile, annotated

```dockerfile
# Multi-stage production image (self-host / local parity with Render)
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
RUN useradd --system --uid 1001 dhandho
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY public ./public
USER dhandho
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "server/index.ts"]
```

## 2. Why two stages

```mermaid
flowchart LR
  subgraph Stage1["Stage 1: build"]
    S1[npm ci — full deps incl. devDependencies]
    S1B[npm run build — Vite produces dist/]
  end
  subgraph Stage2["Stage 2: runner"]
    S2[npm ci --omit=dev — production deps only]
    S2B[Copy dist/, server/, public/ from stage 1 / source]
  end
  Stage1 -->|COPY --from=build /app/dist| Stage2
```

Stage 1 needs `vite`, `typescript`, `@tailwindcss/vite`, and other devDependencies to actually build the frontend. Stage 2 only needs `express`, `pg`, `jsonwebtoken`, etc. — the runtime dependencies to *serve* the already-built `dist/` and run `server/`. Separating them means the **final image never contains the build toolchain**, which is smaller, has a smaller attack surface, and avoids shipping source maps or dev-only code accidentally.

## 3. Security hardening choices, one by one

| Line | What it does | Why it matters |
|---|---|---|
| `RUN useradd --system --uid 1001 dhandho` + `USER dhandho` | Runs the container process as a non-root user | If the Node process is ever compromised, the attacker doesn't get root inside the container — standard container hardening |
| `npm ci --omit=dev && npm cache clean --force` | Installs only production deps, then deletes the npm cache | Smaller image size; no leftover cache layers with dev tooling artifacts |
| `COPY server ./server` (not `COPY . .`) | Only copies exactly the three directories the runtime needs (`dist`, `server`, `public`) | Avoids accidentally shipping `tests/`, `.env` files, `.git/`, or other source-tree cruft into the production image |
| `HEALTHCHECK` using Node's native `fetch` | No `curl`/`wget` dependency needed inside the slim image | One less package to install just for health checking |

## 4. The healthcheck, decoded

```js
node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

This calls the exact same `/api/health` endpoint Render's own health check hits — which itself does a real `SELECT 1` against Postgres (see [Deployment Overview](/deployment/overview)). `--start-period=40s` gives the app time to run `initSchema()` (which can take a moment on a cold/empty database) before the healthcheck starts counting failures against it; `--retries=3` at 5s timeout each means a container isn't marked unhealthy from one slow response.

## 5. Running it locally

```bash
docker build -t dhandho .
docker run -p 3001:3001 \
  -e DATABASE_URL=postgres://user:pass@host:5432/dg_erp \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ALLOWED_ORIGINS=http://localhost:3001 \
  -e SUPER_ADMIN_EMAIL=admin@example.com \
  -e SUPER_ADMIN_PASSWORD=$(openssl rand -base64 16) \
  dhandho
```

Note this container expects an **external** Postgres — it does not bundle `embedded-postgres` (that's exclusively an on-prem Electron concern, using a completely different code path in `electron/onprem/pg-manager.ts`, not this Dockerfile). If you need a fully self-contained single-command local stack, pair this with a `postgres:16` container via `docker-compose`.

## 6. What this image deliberately does NOT do

- **No `docker-compose.yml` checked in** — the team's actual dev workflow is `npm run dev:all` against a local or Render-hosted Postgres, not Docker Compose. This image exists for parity/self-host, not day-to-day development.
- **No multi-arch build pipeline wired into CI** (as of writing) — building and pushing this image is a manual/self-host concern, not part of the automated Render deploy path.
- **No embedded Postgres inside the container** — deliberately kept out, since bundling `embedded-postgres` inside a Docker image would be redundant (you'd just use a normal `postgres` image as a sidecar/service instead) and only makes sense for the Electron desktop distribution model where there's no "sidecar" concept.

## Hands-on exercise

1. Build the image locally and inspect its final size (`docker images dhandho`). Compare against a hypothetical single-stage build (mentally, or by actually trying `FROM node:20 ... RUN npm ci && npm run build` in one stage) — how much bigger would it be, and why?
2. Run the container with an intentionally weak `JWT_SECRET` (e.g. `"secret"`) and confirm the container exits immediately rather than starting — trace which specific `assertCriticalEnv` check caught it.
3. Exec into a running container (`docker exec -it <container> whoami`) and confirm it reports `dhandho`, not `root`.

## Debugging exercise

A self-hosting user reports their container keeps restarting in a crash loop. Given the `HEALTHCHECK` configuration and Docker's own restart policy interplay, walk through how you'd distinguish between three possible root causes: (a) the app genuinely crashes on boot due to `assertCriticalEnv`, (b) the app boots fine but can't reach the external Postgres, or (c) the app is healthy but the healthcheck itself is misconfigured (wrong port, wrong path). What's the first command you'd run in each case?

## Quiz

1. Why does the final image not include `vite` or `typescript`?
2. Why does the container run as a non-root user?
3. What would happen if `COPY . .` were used in the runner stage instead of the three explicit `COPY` lines?

<details>
<summary>Answers</summary>

1. Because those are devDependencies only needed to *build* the frontend bundle (stage 1); the runtime (stage 2) only serves the already-built `dist/` output and runs the Express server, so `npm ci --omit=dev` intentionally excludes them.
2. Standard container security hardening — if the Node process is ever compromised via a vulnerability, running as a non-privileged user limits what an attacker could do inside the container (no root-level file/process access).
3. It would copy the entire source tree into the final image, including `tests/`, `.git/`, any local `.env` files, and other artifacts never meant to ship in production — bloating the image and potentially leaking source/config that should stay out of a distributed artifact.

</details>

## Related pages

- [Deployment Overview](/deployment/overview)
- [Electron](/deployment/electron)
- [Env Vars](/deployment/env-vars)
- [CI/CD](/deployment/cicd)
- [Runbook: Deploy Rollback](/runbooks/deploy-rollback)
