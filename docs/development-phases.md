# Development phases

Work must remain inside the active phase. Each phase should finish with tests, documentation, and a
review of sensor-data integrity rules before the next begins.

## Phase 1 — Project foundation (current)

- pnpm TypeScript monorepo and consistent quality tooling
- Next.js web shell with honest backend health rendering
- NestJS/Fastify API with PostgreSQL-aware health endpoint
- Version 1 telemetry contract, validation, example, and tests
- Idle simulator application
- TimescaleDB and Mosquitto local infrastructure
- Architecture, workflow, and permanent engineering rules

No telemetry ingestion, persistence schema, authentication, alerts, exports, or physical device
integration is part of this phase.

## Phase 2 — Simulated telemetry ingestion

- Finalize MQTT topic naming and delivery semantics
- Publish schema-versioned data from the simulator
- Subscribe and validate payloads in an API ingestion module
- Add migration tooling and an initial TimescaleDB telemetry schema
- Preserve `captured_at` and backend-generated `received_at`
- Track sequence gaps, validation failures, `last_seen_at`, and derived device availability
- Add unit and integration coverage for ingestion and persistence

Recommended entry point: agree on the MQTT topic contract and database migration tool, then design
the ingestion transaction around the existing shared schema.

## Phase 3 — Live and historical monitoring

- Current environmental summaries and device state
- Time-range APIs and efficient TimescaleDB queries
- Responsive historical charts with explicit missing/stale states
- Farm, house, and device organization
- Observability for ingestion lag and malformed messages

## Phase 4 — Alerting and operations

- Versioned threshold policies and alert lifecycle
- Acknowledgement and audit history
- In-application notification workflows
- CSV exports with UTC source timestamps and explicit display timezone
- Role-based access and production-ready authentication

WhatsApp integration remains out of scope until a separately approved phase.

## Phase 5 — ESP32 integration and production hardening

- Real hardware publishing through the same schema and MQTT topic contract as the simulator
- Device provisioning, per-device credentials, MQTT TLS, and credential rotation
- Calibration workflow and traceable calibration records
- Store-and-forward behavior, reconnect testing, and clock-drift handling
- Backups, recovery exercises, security review, deployment automation, and load testing

MQ-5 ppm values remain prohibited until calibration with certified reference gas is completed and
the resulting conversion is reviewed and documented.
