# Architecture

## Phase 1 system shape

AgroNova is a pnpm TypeScript monorepo. Its deployable applications are isolated from one another,
and cross-application contracts live in focused shared packages.

| Component                   | Responsibility                                                          | Direct dependencies                 |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| `apps/web`                  | Responsive operator interface and backend health presentation           | HTTP API only                       |
| `apps/api`                  | Backend boundary, health endpoint, and PostgreSQL connectivity check    | PostgreSQL                          |
| `apps/simulator`            | Future development telemetry source; idle in Phase 1                    | Shared telemetry contract           |
| `packages/telemetry-schema` | Versioned Zod validation, inferred TypeScript types, enums, and example | Zod                                 |
| TimescaleDB                 | Future durable telemetry and operational data store                     | API only                            |
| Eclipse Mosquitto           | Future MQTT transport for simulator and devices                         | Future API ingestion and publishers |

The repository is a modular monolith, not a collection of microservices. The API will gain bounded
domain modules as requirements arrive. A single backend keeps operations and consistency simple
until measured scale demonstrates a need to split it.

## Dependency boundaries

```text
Browser -> Next.js web -> NestJS/Fastify API -> PostgreSQL/TimescaleDB

Future telemetry path:
Simulator or ESP32 -> Mosquitto -> API ingestion -> shared validation -> TimescaleDB
```

- The browser never connects to PostgreSQL or MQTT.
- The web application treats the API as its only data boundary.
- The simulator and eventual ESP32 firmware must publish the same versioned payload shape to the
  same topic convention.
- The API is responsible for validating untrusted telemetry before persistence.
- Shared packages contain contracts, not application orchestration or infrastructure access.

## Health behavior

`GET /api/v1/health` reports the application state, current UTC server timestamp, application
version, and a real PostgreSQL connectivity status. A failed or absent database configuration makes
the response `degraded`; it is never replaced with a mock success. The endpoint remains HTTP 200 so
operators and the Phase 1 UI can inspect component status even when a dependency is down.

## Telemetry contract decisions

Schema version 1 uses a UUID message identity, device identity, monotonic sequence number, and a UTC
capture time. Raw and filtered readings remain separate. Nullable readings preserve the difference
between absent data and a numeric zero. Quality and calibration use explicit enums.

MQ-5 data is deliberately limited to raw ADC, filtered ADC, ADC voltage, relative percentage, and
quality/calibration status. No ppm representation is permitted before certified reference-gas
calibration.

When ingestion is implemented, the backend will add and preserve `received_at` in UTC. Device
online/offline state will be derived from `last_seen_at`, not trusted from a device payload.

## Infrastructure

Docker Compose supplies a PostgreSQL 16-compatible TimescaleDB image and Eclipse Mosquitto 2. Both
have health checks, a private project network, configurable host ports, restart policies, and
explicitly named persistent volumes. Mosquitto permits anonymous access only for Phase 1 local
development and must not be exposed to an untrusted network. Authentication and TLS belong in a
later integration/security phase.

Database changes will be applied through migrations once the persistence model is introduced; no
application is allowed to mutate schema ad hoc.
