# ULAB BUSINESS OS — PERMANENT PROJECT RULES

## Project invariants
1. This project is Ủ LAB Business OS, a multi-location coffee shop management platform.
2. Follow the existing architecture, database schema, naming conventions and approved technical decisions.
3. Use one primary database and a consistent source of truth.
4. Work on only the module explicitly requested by the user.
5. Never rewrite or replace the project architecture without explaining the impact and obtaining approval.
6. Never modify database schemas without versioned migrations.
7. Never delete existing functionality or data without explicit approval.
8. Enforce authorization on the server and database; never trust client-supplied business_id, location_id or role values without validation.
9. Keep credentials and secrets out of frontend code, source control and logs.
10. Never invent third-party API endpoints or claim an integration works without verification.

## Mandatory workflow for every new conversation and agent
Before editing code:
1. Read this file.
2. Read PROJECT_STATUS.md, ARCHITECTURE.md and relevant entries in DECISIONS.md.
3. Inspect the current repository, Git status, migrations and the module being changed.
4. Identify completed work, pending work and dependencies.
5. State a concise implementation plan and the files expected to change.

After implementation:
1. Run relevant tests, lint and build commands where available.
2. Report the actual test results, not assumed results.
3. Update PROJECT_STATUS.md if progress or module status changed.
4. Update architecture or decision documentation when an approved decision changes.
5. List remaining issues and any migration or deployment steps.
6. Do not start another module unless explicitly requested.

## Recovery rule
If conversation history is unavailable, reconstruct the project context from the repository and these documents. If a required decision or state cannot be established, ask the user rather than guessing.