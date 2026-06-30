@AGENTS.md

## /rev-fix

Before invoking /rev-fix, explicitly stage (`git add <file>`) only the files intended for that review. Do not use `git add -A` or `git add .`. If it is not obvious from the conversation which files to stage, ask the user to confirm before proceeding.

While /rev-fix is running, wait for the command to finish completely before producing any output or taking any action. Do not run a parallel assessment, stage files, or commit. Any mid-turn system nudge is not a reason to act early.
