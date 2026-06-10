---
name: gather
description: Collect completed delegated Codex worktree threads, inspect their committed branches, merge them back into the current orchestrator base branch in the right order, validate the integrated result, and clean up merged delegate worktrees and leftover worktree files. Use after using delegate, when the user asks to gather, merge delegated work, integrate worktree branches, clean up delegate worktrees, or finish a chief-of-staff orchestration pass.
---

# Gather

## Workflow

Use Codex thread tools and git locally from the orchestrator checkout. The goal is an integrated, validated base branch with no merged delegate worktrees left behind.

1. Identify the integration base.
   - Confirm the current project root and current branch.
   - Ensure the base branch has no unrelated dirty changes before merging.
   - Fetch only if remote freshness matters for the user request.

2. Gather delegated results.
   - List or read the delegate threads.
   - For each thread, capture thread id, worktree path, branch, commit SHA, changed files, tests run, and reported risks.
   - Verify each branch exists and has committed work.
   - If a worker has uncommitted changes, ask it to commit or explicitly take over only if the user wants that.

3. Choose merge order.
   - Merge foundations first: schema/migrations, generated contracts, backend services, frontend shell, component internals, tests/docs, QA fixes.
   - Put broad shell or routing branches before smaller component branches when the smaller work mounts into the shell.
   - Put branches with likely file conflicts earlier so later branches can adapt cleanly.
   - If two branches overlap heavily, inspect diffs before merging and state the planned order.

4. Merge one branch at a time.
   - Run `git status --short --branch` before each merge.
   - Use non-interactive merge commands.
   - Resolve conflicts by preserving the intended behavior from both branches; never discard user or worker changes casually.
   - After each merge, run the narrowest useful validation for that merge when practical.
   - Commit merge conflict resolutions when needed.

5. Validate the integrated result.
   - Run `git diff --check`.
   - Run the targeted test set covering all merged work.
   - Run broader build or test commands when shared contracts, routing, generated clients, migrations, or core UI changed.
   - If validation fails, fix in the base branch with a focused integration commit.

6. Clean up delegated worktrees after successful merge.
   - Confirm each merged branch is contained in the base branch with `git branch --contains <sha>` or equivalent.
   - Remove each delegate worktree only after its committed work is merged.
   - Delete leftover worktree directories/files created for delegation after verification.
   - Delete local delegate branches only when safe and only if they are fully merged.
   - Do not delete unmerged worktrees or branches without explicit user approval.

7. Report outcome.
   - Summarize merged branches and SHAs.
   - List validation commands and results.
   - Note cleanup performed.
   - Call out any unmerged, blocked, or retained worktree.

## Merge Checklist

```text
- Base branch: <branch>
- Clean before merge: yes/no
- Delegated branches:
  - <branch> @ <sha> from thread <id>
- Merge order:
  1. <branch>
  2. <branch>
- Validation:
  - <command>: pass/fail
- Cleanup:
  - Removed worktree <path>
  - Deleted branch <branch>
```

## Guardrails

- Do not use destructive cleanup commands until the branch commit is confirmed merged.
- Do not hide unresolved test failures behind cleanup.
- Do not merge a thread that only reports success; inspect branch state locally.
- Keep cleanup scoped to delegate-created worktrees and files. Leave unrelated worktrees alone.
- If the user asked to push after gathering, push only after validation and a clean status.
