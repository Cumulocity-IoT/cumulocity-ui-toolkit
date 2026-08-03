# Operations Widget

A configurable dashboard widget that renders a set of action buttons for sending parameterised Cumulocity operations to the context device. Each button has its own label, icon, operation payload, and optional input fields.

## Features

- **Custom operation buttons** — Define any number of buttons, each mapping to a specific Cumulocity operation type and payload.
- **Parameterised operations** — Buttons can expose input fields (string, number, boolean, select) that the user fills in before sending; values are interpolated into the operation payload.
- **Icon picker** — Choose from the full Cumulocity icon set for each button.
- **Device context** — Automatically resolves the target device from the current dashboard context; supports explicit device override via config.
- **Import / export config** — Widget configuration can be exported and imported alongside the device context (uses `exportConfigWithDevice` / `importConfigWithDevice`).
- **Schema-driven config form** — The configuration panel is generated from a JSON schema (`OperationWidgetConfig`) for type-safe, maintainable form fields.

## Widget configuration

Open the configuration panel to:

1. **Add buttons** — Define one or more operation buttons with label, icon, operation type, and payload template.
2. **Add inputs** — For each button, add zero or more user-facing input fields with a label, field type, and payload path.
3. **Device override** — Optionally pin the widget to a specific device instead of using the dashboard context.

## Default widget size

| Width | Height |
|---|---|
| 6 columns | 4 rows |

## Module

`OperationsWidgetPluginConfigProviders` — exported from `./src/app/index.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `OperationsWidgetComponent` | Main widget — renders buttons and dispatches operations |
| `OperationsWidgetConfigComponent` | Schema-driven config form |
| `ButtonInstanceComponent` | Individual button with optional inline input fields |
| `OperationsEditorComponent` | JSON/form editor for operation payload values |
| `OperationsWidgetService` | Sends operations via `OperationService` and handles response toasts |
