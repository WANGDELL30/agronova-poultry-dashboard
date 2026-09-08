# AgroNova Poultry AI IoT

Project foundation and Frontend Phase F1 for an IoT monitoring dashboard for laying-hen farms. The
repository is a strict TypeScript monorepo with a responsive bilingual Next.js dashboard, a
NestJS/Fastify API, telemetry simulator placeholder, shared Zod schema, and local TimescaleDB plus
MQTT infrastructure.

This phase does **not** ingest MQTT telemetry, persist sensor readings or alert acknowledgements,
operate real ESP32 devices, deliver notifications, or export CSV files.

## Repository layout

```text
apps/
  api/                      NestJS API using the Fastify adapter
  simulator/                Non-publishing telemetry simulator placeholder
  web/                      Next.js App Router frontend
packages/
  telemetry-schema/         Versioned telemetry types, validation, example, and tests
infrastructure/
  mosquitto/config/         Local MQTT broker configuration
docs/
  architecture.md           Components, boundaries, and intended data flow
  development-phases.md     Phased delivery roadmap
  frontend-design.md        Frontend components, states, and responsive behavior
docker-compose.yml          TimescaleDB/PostgreSQL and Eclipse Mosquitto
```

## Prerequisites

- Node.js 22 or later
- Corepack (included with the supported Node.js installation)
- Docker Desktop or Docker Engine with Compose v2 for local infrastructure

The repository pins pnpm through the `packageManager` field and lockfile. The following command does
not require a global pnpm shim:

```bash
corepack pnpm install --frozen-lockfile
```

If `corepack enable` has already completed successfully, plain `pnpm` commands work as well.

## Environment setup

Create local files from the tracked examples and replace the example database password with the
same local-only value in both the root and API files.

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/simulator/.env.example apps/simulator/.env
```

Bash:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/simulator/.env.example apps/simulator/.env
```

No environment file containing credentials should be committed.

## Run locally

Start TimescaleDB and Mosquitto, then start all applications:

```bash
corepack pnpm infra:up
corepack pnpm dev
```

The applications use these configurable defaults:

| Service    | URL / address                         | Configuration                   |
| ---------- | ------------------------------------- | ------------------------------- |
| Web        | `http://localhost:3000`               | `PORT` in `apps/web/.env.local` |
| API        | `http://localhost:4000`               | `API_HOST`, `API_PORT`          |
| Health     | `http://localhost:4000/api/v1/health` | API environment                 |
| PostgreSQL | `localhost:5432`                      | `POSTGRES_PORT`, `DATABASE_URL` |
| MQTT       | `mqtt://localhost:1883`               | `MQTT_PORT`, `MQTT_BROKER_URL`  |

The API remains available when PostgreSQL is unavailable, but its health response truthfully reports
`degraded` and `database.status` as `disconnected` or `not_configured`.

If a default host port is already occupied, change `POSTGRES_PORT` or `MQTT_PORT` in the root `.env`.
When changing `POSTGRES_PORT`, update the port in the API's `DATABASE_URL` as well.

Stop local infrastructure without deleting its named volumes:

```bash
corepack pnpm infra:down
```

### Run only the frontend

Infrastructure and the backend are not required when the frontend uses its default mock data source:

```bash
corepack pnpm --filter @agronova/telemetry-schema build
corepack pnpm --filter @agronova/web dev
```

Open `http://localhost:3000`. The root route redirects to `/overview`.

### Frontend data mode and scenarios

Configure the frontend in `apps/web/.env.local`, then restart the Next.js development server:

```env
NEXT_PUBLIC_DATA_MODE=mock
NEXT_PUBLIC_MOCK_SCENARIO=normal
NEXT_PUBLIC_MOCK_INTERVAL_MS=5000
```

`NEXT_PUBLIC_DATA_MODE` supports `mock` and `api`; `mock` is the F1 default. API mode intentionally
renders an unavailable state because real backend telemetry belongs to a later phase.

Available deterministic mock scenarios are:

- `normal`
- `warning`
- `sensor-not-installed`
- `device-offline`

The frontend never connects directly to MQTT. Future API mode will use backend REST and WebSocket
interfaces behind the existing typed data-source boundary.

### Frontend routes

| Route          | F1 state                               |
| -------------- | -------------------------------------- |
| `/overview`    | Complete responsive overview dashboard |
| `/live`        | Polished future-module placeholder     |
| `/history`     | Polished future-module placeholder     |
| `/alerts`      | Polished future-module placeholder     |
| `/devices`     | Polished future-module placeholder     |
| `/calibration` | Polished future-module placeholder     |
| `/exports`     | Polished future-module placeholder     |
| `/settings`    | Polished future-module placeholder     |

## Checks and builds

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm build
docker compose config
```

Run an individual workspace when needed:

```bash
corepack pnpm --filter @agronova/api dev
corepack pnpm --filter @agronova/web dev
corepack pnpm --filter @agronova/simulator start
corepack pnpm --filter @agronova/telemetry-schema test
```

The simulator currently prints an idle startup message and exits successfully. It deliberately does
not connect to MQTT or publish telemetry in Phase 1.

## Environment variable reference

| Variable                       | Purpose                                         | Default / requirement           |
| ------------------------------ | ----------------------------------------------- | ------------------------------- |
| `POSTGRES_DB`                  | Compose database name                           | `agronova`                      |
| `POSTGRES_USER`                | Compose database user                           | `agronova`                      |
| `POSTGRES_PASSWORD`            | Compose database password                       | Required; local secret          |
| `POSTGRES_PORT`                | Host PostgreSQL port                            | `5432`                          |
| `MQTT_PORT`                    | Host MQTT port                                  | `1883`                          |
| `API_HOST`                     | API bind address                                | `0.0.0.0`                       |
| `API_PORT`                     | API port                                        | `4000`                          |
| `APP_VERSION`                  | Version reported by health                      | `0.1.0`                         |
| `WEB_ORIGIN`                   | Comma-separated allowed browser origins         | `http://localhost:3000`         |
| `DATABASE_URL`                 | PostgreSQL connection string used by API health | Omit to report `not_configured` |
| `DATABASE_CONNECT_TIMEOUT_MS`  | Health-query connection timeout                 | `3000`                          |
| `PORT`                         | Next.js web port                                | `3000`                          |
| `NEXT_PUBLIC_API_BASE_URL`     | Browser-visible API base URL                    | `http://localhost:4000`         |
| `NEXT_PUBLIC_DATA_MODE`        | Frontend telemetry source: `mock` or `api`      | `mock`                          |
| `NEXT_PUBLIC_MOCK_SCENARIO`    | Deterministic frontend simulation scenario      | `normal`                        |
| `NEXT_PUBLIC_MOCK_INTERVAL_MS` | Mock snapshot interval in milliseconds          | `5000`                          |
| `MQTT_BROKER_URL`              | Future simulator broker URL                     | `mqtt://localhost:1883`         |
| `MQTT_TELEMETRY_TOPIC`         | Future shared simulator/device topic template   | example file value              |
| `SIMULATOR_DEVICE_ID`          | Future simulator device identity                | `AGRONOVA-SIM-01`               |

See [the architecture document](docs/architecture.md) for boundaries and data-flow decisions, and
[the phased roadmap](docs/development-phases.md) before extending the system.
