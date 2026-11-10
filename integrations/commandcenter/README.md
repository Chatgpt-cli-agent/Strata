# CommandCenter integration (M:\)

Strata is the **runtime and Harness** for Koda’s command center on **M:\CommandCenter**.

## Models (Strata-owned)

Weights and catalog are **inside Strata** — install configs under `%LOCALAPPDATA%\Strata\install\`, data under `Documents\Strata`. CommandCenter does **not** ship or point at its own GGUFs for daily use.

```text
strata models list
strata models inspect <install-id>
```

## Slot + align (any model)

`development-main-slot.yaml` uses `selection: live_probe`. **`strata_runtime.py`** reads whichever model Strata has loaded and syncs Koda + CommandCenter state. Automatic while ToolHive runs; manual:

```text
python M:\CommandCenter\Tools\align_with_strata.py
```

## Policy docs (CommandCenter)

- Integration map: `M:\CommandCenter\Brain\commandcenter-strata.md`
- Compaction: `M:\CommandCenter\Brain\strata-and-compaction.md`
- Harness runbook: `M:\CommandCenter\Harness\README.md`

## Tools and MCP

`Documents\Strata\local-integrations.json` — **koda-catalog**, CommandCenter skill roots. See `M:\CommandCenter\Brain\toolhive-for-strata.md`.
