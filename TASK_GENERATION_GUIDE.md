Instructions for ChatGPT: Generate Motion API Task JSON
With Aggressive Batching, Traceability, and Triage Routing
Your Task

Generate properly formatted Motion API JSON using either:

Option 1: One NEW project definition + tasks

Option 2: Tasks for an EXISTING project (projectId)

Optimize for Motion auto-rescheduling and focused work sessions using aggressive conditional batching.

REQUIRED OUTPUT SECTIONS (ORDER MATTERS)

Coverage Map (Human-Readable, Outside JSON)

Motion API JSON (valid JSON only; no commentary inside JSON)

JSON Structure Required
Option 1: Create a NEW project with tasks
{
  "project": {
    "name": "Project Name Here",
    "description": "Detailed project description (HTML accepted)",
    "priority": "HIGH",
    "dueDate": "2026-01-31T23:59:59.000Z"
  },
  "tasks": []
}

Option 2: Add tasks to an EXISTING project
{
  "projectId": "proj_abc123",
  "tasks": []
}

Field Requirements & Rules
Project Fields (Option 1 only)

name (required)

description (optional)

priority (optional): "ASAP" | "HIGH" | "MEDIUM" | "LOW"

dueDate (optional): ISO 8601 Zulu

Task Fields

name (required)

description (optional): GitHub-flavored Markdown

dueDate (required): ISO 8601 Zulu

duration (required): integer minutes

priority (optional)

labels (optional): DO NOT add unless explicitly requested

autoScheduled (required for every task):

startDate (required)

deadlineType (required): default to "SOFT"

schedule (required): "Work Hours"

GLOBAL RULES (DO NOT VIOLATE)

Output must be valid JSON; escape quotes.

All dates must be ISO 8601 with .000Z.

Every task must include autoScheduled with all three subfields.

Prefer "SOFT" deadlines unless truly non-negotiable.

Create dependencies using autoScheduled.startDate after prerequisite dueDates.

Do not include labels unless explicitly requested.

OWNERSHIP RULE

Only create tasks for the user (“I”).

Ignore tasks assigned to others.

If ownership is unclear and important, create:
Clarify ownership for: <topic> (30m, LOW)

TRIAGE ROUTING (UPDATED)

There is an existing Motion project named triage.

Route tasks to triage if either:

The task is Personal, OR

The task has no clear associated project (i.e., it’s ambiguous/general/inbox-like), even if other tasks belong to a main project.

Implementation requirement

If any tasks must go to triage, output them as a separate JSON block using Option 2 for triage.

(If the user provides the triage projectId, use it. If not provided, assume you will output Option 2 with a placeholder and clearly label it as the triage block.)

PROJECT ASSOCIATION RULE (IMPORTANT)

Only associate a task with a non-triage project when the project is explicit (e.g., user says “in my project X…”) or it’s unambiguously part of that workstream.

If it’s not explicit/unambiguous → treat as no associated project → route to triage.

AGGRESSIVE CONDITIONAL BATCHING
Goal

Prefer scheduling work sessions (45–120m) with checklist subtasks.

When to Batch

Batch aggressively when tasks are:

≤15–20 minutes, OR

Similar context (admin/comms/review/follow-ups), OR

Same workstream follow-ups

Default bias: batch unless clearly deep work.

What NOT to Batch

Do not batch if:

Deep work / core deliverable

High-stakes single outcome

60 minutes by itself

Batch Task Description Format

Use Markdown checklists:

- [ ] (10m) subtask

Batch Duration

Sum estimates → round to nearest 15m

Min 30m; target 45–120m

Split >120m into (#1), (#2) tasks

PRIORITY GUIDELINES

ASAP > HIGH > MEDIUM > LOW.

DEFAULT DATES

Unless specified:

startDate: next business day 09:00 UTC

dueDate:

ASAP/HIGH: 2–5 business days

MEDIUM: 1–2 weeks

LOW: 3–6 weeks

TRACEABILITY REQUIREMENT

Before JSON, output a Coverage Map that:

Lists each original note item

Shows which task/batch captured it

Notes if it went to main project vs triage

Briefly says why batched vs standalone

Nothing is dropped silently.

INPUT

Now generate tasks for:

[PASTE NOTES / PROJECT CONTEXT HERE]