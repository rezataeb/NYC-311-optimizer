---
name: delegate
description: Split a larger coding or implementation effort into multiple parallel Codex background threads, each in its own project worktree. Use when acting as a chief-of-staff or orchestrator, when the user asks to delegate work, spin up worktrees, parallelize implementation phases, create Codex threads, or divide a project into independent branches. Each delegated thread must work in a dedicated worktree branch and commit its completed work before reporting back.
---

# Delegate

## Workflow

Use Codex thread tools rather than doing implementation in the orchestration thread. If thread tools are not already available, call tool discovery for `create_thread`, `list_threads`, `read_thread`, `send_message_to_thread`, and thread title tools.

1. Inspect the current repo state.
   - Record the project root, current branch, and whether the tree is clean.
   - Do not delegate from an unknown or unstable base without calling that out.
   - If local uncommitted changes are relevant to the delegated work, either commit/stash only with user approval or start worktrees from the current working tree when that is explicitly intended.

2. Decompose the work.
   - Split by low-conflict ownership boundaries: backend API, data model/migration, frontend shell, frontend component internals, tests, docs, integration QA.
   - Prefer two to four parallel threads. Use fewer when files will overlap heavily.
   - Assign each thread a clear branch name, expected files or modules, validation commands, and a narrow definition of done.

3. Create one project worktree thread per work package.
   - Use `target.type = "project"`.
   - Use the current project root as `projectId`.
   - Use `environment.type = "worktree"`.
   - Start from the current base branch unless the user asked to start from the working tree.
   - Give each thread a branch name that makes ownership obvious, usually `codex/<short-scope>`.

4. Write strong delegation prompts.
   - Tell the worker to read local repo instructions and relevant feature docs.
   - Tell the worker to create or switch to its assigned branch.
   - Tell the worker to keep scope narrow and avoid unrelated refactors.
   - Tell the worker to run targeted validation and `git diff --check`.
   - Tell the worker to commit its work with a clear message.
   - Tell the worker not to merge back to the base branch.
   - Tell the worker to report branch, commit SHA, changed files, validation, and risks.

5. Track the delegation.
   - Rename each thread with a concise title.
   - Pin threads when the work is important or long-running.
   - Keep a local checklist of thread id, worktree path, branch, scope, status, and expected merge order.
   - Share a short status with the user after creation.

## Prompt Template

```text
You are working in a dedicated worktree for <project>. Create/switch to branch `<branch>` from `<base>`, then implement <scope>.

Context:
- The orchestrator branch is `<base>`.
- Read repo instructions before changing code.
- Read these feature/design references: <paths>.

Scope:
- <specific ownership>
- <specific exclusions>
- Preserve existing contracts unless explicitly required.

Validation:
- Run <targeted commands>.
- Always run `git diff --check`.
- Commit your work on `<branch>` with a clear message.
- Do not merge back to `<base>`.

Report back with branch name, commit SHA, files changed, tests run, and integration risks.
```

## Guardrails

- Keep orchestration and implementation separate unless the user explicitly asks otherwise.
- Avoid assigning two threads to the same files unless the second thread is only testing or reviewing.
- Do not ask worker threads to push unless the user asked for remote branches.
- Do not leave a delegated thread with uncommitted successful implementation work.
- If a thread is blocked, steer it with a follow-up prompt before taking the work back locally.
