# Development Framework

## Communication
- Use simple, non-technical language. Keep descriptions minimal.
- Notify what you're doing in plain words, not code jargon.

## Permissions
- Read, Glob, and Grep are always safe to run without asking.
- Before any Write or Edit, briefly explain **what** file is being changed and **why** — so the developer can approve with context.

---

## Spec Is Source of Truth
- `docs/SPEC.md` is the authoritative reference for the project. Code conforms to the spec — never the other way around.
- If implementation reveals the spec needs updating, **stop and ask the developer** before changing either the spec or the code. The spec is never silently overridden by implementation drift.
- All docs files work together — DECISIONS, TODO, ERRORS, and others stay in sync with the spec. The spec is the anchor; everything else supports it.

## Plan Before Code
- Never write code without a plan first.
- Use plan mode for anything non-trivial.
- Write the plan to `docs/TODO.md` before touching any code.
- Get the developer's approval on the plan before executing.
- Planning closes the context gap between developer intent and Claude's interpretation. A plan is how alignment is confirmed before work begins.

## Testing as Self-Healing
For every function or feature built:
1. **User acceptance test** — checks if the feature works as the developer expects.
2. **Regression test** — checks that existing features still work after the change.
3. **Test script** — a runnable script that executes both and reports pass/fail.

Tests live in a `tests/` folder. Each test file matches the feature it covers.

The testing loop is: **change → test → fix → verify**. This acts as CI/QA inside the agent workflow. It's a feedback loop, not traditional TDD.

### Validation Before Moving On
- After completing a task, run its related tests before marking it done.
- Never move to the next task if tests are failing.
- If a test fails, fix the issue first, then re-run.

---

## Project Files

### Versioning
Every docs file has a version header at the top:
```
<!-- version: 1.0 | updated: YYYY-MM-DD -->
```
- Increment the version each time the file is updated (1.0 → 1.1 → 1.2, etc.)
- Major changes bump the first number (1.x → 2.0)
- Update the date to the current date

### Progressive File Creation
Don't create all files upfront. Start with only what's needed and create others when they earn their place:

| File | Created when |
|------|-------------|
| `docs/SPEC.md` | Project start — always first |
| `docs/TODO.md` | Project start — always second |
| `docs/DECISIONS.md` | First non-trivial decision is made |
| `docs/ERRORS.md` | First error is encountered |
| `docs/STRUCTURE.md` | Project has enough files to warrant a map |
| `docs/CHANGELOG.md` | First session ends |
| `docs/MENU.md` | Developer customizes actions (until then, use defaults) |
| `docs/references/` | Developer provides external documents |
| `tests/` | First feature is built |

### docs/SPEC.md — Source of Truth
The authoritative document describing the project:
- What's being built
- How it works
- Key features and requirements
- Architecture and structure
- Updated only with developer approval when the project evolves

### docs/TODO.md — Lightweight Ticket List
A simple task list. Nothing more.
- Each task has an **open** or **done** status
- The developer manages the list — decides what to add, reorder, or prioritize
- Claude does **not** add, reorder, or reprioritize tasks without the developer's direction
- When a task is marked done, update other docs files as needed to keep everything in sync

### docs/DECISIONS.md
A running log of every non-trivial decision. Each entry:
- **What** was decided
- **Why** it was chosen
- **Date**
- **Alternatives considered** (if any)

### docs/ERRORS.md — Knowledge Base
Not a bug log. A pattern library for short-circuiting repeated research.

Each entry is structured as:
```
### [Short label]
**Pattern:** What the error looks like (message, symptom, behavior)
**Cause:** What triggers it
**Fix:** What resolves it
```

- No narrative context about when/where it happened
- Prune entries when they're no longer relevant to the project
- Before debugging any issue, check this file first

### docs/STRUCTURE.md
A map of the project's folder layout:
- What each folder and key file does
- Updated when files are added, moved, or removed

### docs/CHANGELOG.md
A session-by-session log of what changed, in plain language:
- What was added, changed, or removed
- Grouped by session/date

### docs/MENU.md
A saved list of actions the developer can run. Each item has a number, name, and what it does.
- Persists across sessions
- Managed by the developer with commands (see Menu System below)

### docs/references/
A folder for external reference documents provided by the developer.
- Save reference docs here when provided
- Use these to build knowledge and feed into the spec

---

## Docs-Code Sync Validation
Actively verify that documentation matches reality:
- **STRUCTURE.md vs file tree:** When updating STRUCTURE.md, compare it against the actual project files. Flag any drift — missing files, extra files, or outdated descriptions.
- **SPEC.md vs code:** When completing a task, check that the implementation matches what the spec describes. If they've drifted apart, flag it to the developer rather than silently letting it accumulate.
- Sync is maintained through the interplay of all docs files. Completing a TODO item triggers updates to DECISIONS, SPEC, STRUCTURE, and CHANGELOG as needed.

---

## Rules Command
When the developer types **"rules"**, show the current framework rules from `~/.claude/CLAUDE.md` and ask what they want to add or change.
- **rules** — Show a summary of current rules and ask what to add or edit
- **rules add [rule]** — Add a new rule to the framework
- **rules edit [section]** — Edit an existing section of the framework

After any change, update `~/.claude/CLAUDE.md` and log the change in `docs/DECISIONS.md` (create it if it doesn't exist yet).

## Menu System
When the developer types **"menu"**, show the current menu from `docs/MENU.md` using AskUserQuestion so they can pick an action to run. If `MENU.md` doesn't exist yet, show the defaults.

### Menu Commands
- **menu** — Show the menu and let developer pick an action
- **menu add [name]: [description]** — Add a new item to the menu
- **menu move [number] to [number]** — Reorder an item
- **menu delete [number]** — Remove an item from the menu

### Menu Item Format
- Typing the **number** runs it on everything (e.g. `2` runs all tests)
- Typing the **number + description** runs it on something specific (e.g. `2 login feature` runs tests for login only)

### Default Menu Items
1. **Save progress** — Write current work to all existing docs files
2. **Run tests** — Execute all test scripts and show results
3. **Run project** — Install dependencies, build, and start the project

The last item is always:
- **Framework Help** — Show a short introduction and overview of the framework: what it does, the key rules, available commands (menu, rules), and how docs files work. This item always stays at the bottom, even when the developer adds new items above it.

---

## Git Discipline
- Commit after each completed task with a clear message tied to the TODO item.
- Keep commits small and focused — one task per commit.
- Always show the commit message to the developer before committing. Don't commit silently.

## Checkpoints
- Before making a big or risky change, log a checkpoint in `docs/DECISIONS.md`.
- Describe the current state so it's easy to know where to roll back if something goes wrong.

## Prompt Templates
- If the developer repeats a request often, suggest adding it as a menu item.
- Common workflows should become one-click menu actions, not retyped prompts.

---

## Context Budget

### On Session Start / Context Clear / Compact
1. Read `docs/TODO.md` first — the next open task determines what context to load
2. Read `docs/SPEC.md` — load sections relevant to the current task in full, summarize the rest
3. Read other existing docs files — load compressed/summarized versions
4. Read relevant files in `docs/references/` if they relate to the current task
5. Show a short summary of the last session: what was done, what's next, and any open questions
6. Pick up where the last session left off

### During Work
- Suggest relevant menu actions when they'd help (e.g. "You might want to run `1` to save progress before this big change")
- Update `docs/TODO.md` only when the developer directs it
- Log decisions to `docs/DECISIONS.md` as they're made (create if needed)
- Flag spec drift to the developer — don't silently update `docs/SPEC.md`
- Log error patterns to `docs/ERRORS.md` when issues are solved (create if needed)
- Update `docs/STRUCTURE.md` when files are added or moved (create if needed)
- Commit after each completed task

### Before Session End / Context Gets Large / Auto-Compact
**Always save progress before the system auto-compacts.** If context is getting large, proactively save without being asked.
- Save all working state to existing docs files
- Create `docs/CHANGELOG.md` (if it doesn't exist) and log what happened this session
- Make sure TODO reflects actual progress (with developer's confirmation)
- Log any pending decisions or open questions
- Commit any uncommitted work
- Leave enough context for the next session to continue smoothly

---

## New Projects
When starting a new project:
1. Create `docs/` folder
2. Write `docs/SPEC.md` based on what the developer describes
3. Write `docs/TODO.md` with the initial plan
4. Get the developer's approval on the spec and plan
5. Only then start building
6. Create other docs files progressively as they become needed

## Reference Documents
When the developer provides an external document (URL, file, or pasted text):
1. Create `docs/references/` if it doesn't exist
2. Save the document with a clear name
3. Read and extract key information
4. Update `docs/SPEC.md` with relevant details (with developer approval)
5. Log in `docs/DECISIONS.md` that a reference was added and what it covers
