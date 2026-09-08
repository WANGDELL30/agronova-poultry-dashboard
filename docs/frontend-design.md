# Frontend design

## Frontend Phase F1

F1 establishes a responsive, bilingual dashboard shell and a fully composed overview using
deterministic simulated telemetry. It does not connect to MQTT, read operational telemetry from the
backend, submit calibration, export files, control hardware, or perform prediction.

## Layout

The interface uses the project's existing global CSS architecture and a light agricultural-technology
palette. Desktop layouts use a persistent sidebar and a content workspace with a sticky application
header. At tablet widths, the sidebar collapses to an icon rail. Below 768px, the sidebar is replaced
with a fixed bottom navigation bar and a touch-friendly More panel.

The application header presents:

- current page title;
- KKG Layer Farm and House A selectors;
- `AGRONOVA-ESP32-01` device context;
- current Asia/Jakarta time;
- simulation/live mode and scenario;
- last-update age;
- persistent ID/EN language controls; and
- a non-functional operator avatar placeholder.

## Component structure

- `AppShell`, `Sidebar`, `MobileNavigation`, and `DashboardHeader` define navigation and global context.
- `OverviewDashboard` only composes feature sections and handles top-level data-source states.
- `SummaryCard`, `SensorCard`, and `SensorUnavailableCard` present operational and research values.
- `StatusBadge` and `CalibrationBadge` combine icon, text, and color for every status.
- `AlertPanel` and `AlertItem` behavior provide local mock acknowledgement.
- `TrendChart` uses Recharts for a responsive 24-hour preview with metric tabs, filtered/raw series,
  tooltip, legend, unit-aware axes, and a screen-reader table.
- `DeviceHealthCard` presents ESP32 connectivity and sensor readiness.
- `LoadingSkeleton`, `EmptyState`, and `ErrorState` cover loading, empty, unavailable, and unexpected
  error conditions.
- `PlaceholderModule` keeps future navigation routes visually consistent without implementing their
  later-phase functionality.

## Status presentation

Status is never conveyed using color alone. Each badge includes a Lucide icon and localized text.

| Status                                  | Visual treatment |
| --------------------------------------- | ---------------- |
| `VALID` / normal                        | Green            |
| warning/elevated relative state         | Amber            |
| `DISCONNECTED` / critical connectivity  | Red              |
| `CALIBRATING` / calibration in progress | Blue             |
| `STALE` / `DEVICE_OFFLINE`              | Gray             |
| `INVALID`                               | Purple           |
| `NOT_INSTALLED` / `UNKNOWN`             | Neutral gray     |

Unavailable sensors display an em dash and `NOT_INSTALLED`; their null values are never rendered as
zero. MQ-5 is labeled as a relative gas level and exposes only raw ADC, filtered ADC, ADC voltage,
relative percentage, quality, and calibration state. Its information control explains why ppm is
unavailable.

## Responsive behavior

- **Desktop (approximately 1440px):** full sidebar, four summary columns, up to four sensor columns,
  and a split alerts/device-health row.
- **Tablet (approximately 768px):** collapsed icon sidebar, wrapped header controls, two-column cards,
  and stacked lower panels.
- **Mobile (approximately 390px):** no sidebar, bottom navigation with a More panel, compact header,
  two-column summaries, single-column sensor cards, horizontally scrollable chart tabs, and stacked
  alerts/actions.

All grids and chart containers use `min-width: 0` or bounded overflow to prevent horizontal page
overflow. Controls use visible focus states and mobile navigation targets are at least 44px high.
Motion is minimized when `prefers-reduced-motion` is enabled.

## Internationalization

`LanguageProvider` uses a typed flat dictionary in `lib/i18n/translations.ts`. Indonesian is the
server and client default. Selecting English stores `en` under `agronova-language` in local storage;
the provider restores it on later visits and updates the document language.

Navigation, headings, sensor labels, statuses, alerts, actions, timestamps, tooltips, scenarios, and
empty/error states use translation keys. Technical identifiers and units remain unchanged. All
timestamps stay as UTC ISO strings in data and are formatted only for display using Asia/Jakarta.

## Data-source boundary

Dashboard components access telemetry only through `TelemetryProvider` and `useTelemetry`.

```text
Dashboard components -> typed hook -> TelemetrySource
                                      |- MockTelemetrySource (F1)
                                      `- ApiTelemetrySource (future placeholder)
```

`NEXT_PUBLIC_DATA_MODE=mock|api` selects the implementation. Mock mode is the default.
`MockTelemetrySource` uses predictable trigonometric functions rather than uncontrolled randomness,
keeps raw and filtered readings separate, increments sequence numbers, and advances both
`captured_at` and `received_at` UTC timestamps. Its start/stop methods are idempotent and the provider
unsubscribes and stops timers on unmount.

Scenarios are selected with `NEXT_PUBLIC_MOCK_SCENARIO`:

- `normal`
- `warning`
- `sensor-not-installed`
- `device-offline`

`ApiTelemetrySource` deliberately returns an unavailable error in F1. A later implementation can use
REST and WebSocket without changing dashboard components. No browser-side MQTT dependency exists.

## Frontend roadmap

1. **F1 — shell and simulated overview:** current phase.
2. **F2 — backend telemetry transport:** implement `ApiTelemetrySource` over REST/WebSocket after
   backend ingestion exists; keep mock mode for repeatable development and tests.
3. **F3 — live and historical modules:** complete routed pages, time-range queries, chart exploration,
   and explicit stale/missing-data behavior.
4. **F4 — alert, device, calibration, and export workflows:** implement only after backend contracts,
   authorization, and audit requirements are approved.
5. **F5 — production accessibility and performance:** automated accessibility review, representative
   device testing, bundle monitoring, and operator usability validation.
