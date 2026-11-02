# Local skills, tools and chat continuity

This fork reads an optional `local-integrations.json` in Strata's data directory. No file means no external import. The user configuration enables `continuity`, `lazyTools`, a list of `skillRoots`, and stdio `servers` using the standard command/args/env/cwd fields.

Imported skills remain in their original folders. The Skills page lists them; enabled entries are indexed into `agent/local-skill-catalog.json`. The agent sees one library skill and searches the catalog before reading original instructions and supporting files. Identical skill files are deduplicated. Changes to source skills are picked up by the Skills reload action or app restart. Disabling a skill removes it from the available catalog. App skill folders are authoritative, preventing the Harness from silently loading the shared catalog again.

Large local tool servers expose find_tools (five schemas per page) and run_tool. The underlying server validates calls. Existing Strata permission modes still apply to connected tools. Remote servers retain their ordinary connection path. Codex-only app connectors and private Node REPL transport cannot be transferred as local tools.

Continuity mode adds a task checkpoint instruction to every summary, including chunked summaries. It preserves outstanding requests, constraints, decisions, verified work, blockers and next actions. The existing Harness retains recent history, persists the session and handles automatic compaction and overflow recovery. This is not a port of OpenCode's background precomputation or provider-native compaction. Full original context cannot be guaranteed by a lossy summary.

Validation uses the installed Harness and a scripted model to test long chats, overflow recovery, manual compaction and summary instructions. The local tool adapter is tested against a real stdio fixture. REA and Librarian also passed read-only initialization and tool discovery probes.

## Large-output follow-up (2026-10-29)

The user's real 64K chat compacted twice within 24 model steps. The recorded tool-result envelopes reached about 99 KB; continuation summaries grew from about 7.6 KB to 11.4 KB. This was progress interrupted by repeated compaction, not a lost session ID.

With continuity enabled, file reads now default to and cap at 200 lines per call, other large tool output uses the Harness's existing recoverable spill store with 1,536 inline tokens, summaries get 2,048 output tokens with an under-600-word instruction, and recent verbatim retention drops from the Harness default 16% to 8%. The trigger and model answer budget remain unchanged. Full spilled output stays available through the returned file reference; read subsequent file ranges when necessary.

Real-Harness regression checks verify a 1,500-line file does not enter the prompt in full and a large PowerShell result is stored with a bounded preview. Long-chat compaction and close/reopen of the same durable session also pass. These are scripted-model checks, not a claim that every real workload will avoid frequent compaction.
