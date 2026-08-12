# MPW Pickleball UI/UX Guidelines

Last updated: 2026-08-12

## Core Principle

The flexible tournament engine is intentional. The UI must make that flexibility understandable without making administrators feel like they are editing database rows.

Tournament-day screens should answer:

- Which division or operational area am I editing?
- What is its current state?
- What needs attention?
- What can I safely change?
- What is protected because play has started?

## Admin Information Architecture

Admin navigation is grouped by operational purpose:

- Operate: Control, Tournament Setup, Player Pool
- Engagement: Voting Codes
- Testing: Simulation
- Recovery / System: Checkpoints, Audit Logs, Reset Data

Recovery and destructive tools should remain visually distinct from ordinary tournament-day operations.

## Tournament Setup Pattern

Tournament Setup should behave like a tournament operations console:

- show one selected division as the main workspace;
- keep division switching obvious;
- show summary metrics before editable fields;
- surface readiness checks and warnings;
- keep common settings first;
- hide slugs, sort order, long guide notes, and uncommon fields under Advanced;
- make group, team, and matchup actions contextual;
- show protected/locked state for matchups with recorded play.

Do not restore an always-visible "create division" form that competes with the selected division workspace.

## Player Pool Pattern

The Player Pool is attendance-first:

- players may remain unassigned;
- statuses must be scannable before editing;
- filters should support search, participation, division eligibility, and assignment;
- adding a candidate is secondary and may be collapsed;
- Quick Pair Unit remains prominent when confirmed unassigned players exist.

Statuses should use text labels, not color alone:

- Pool
- Confirmed
- Assigned
- Unavailable
- Withdrawn
- Inactive

## Form Conventions

- Use explicit save/submit for structural changes.
- Use pending button labels for meaningful actions.
- Keep common tournament-day controls visible.
- Put technical fields in Advanced sections.
- Avoid squeezing forms into too many columns on desktop.
- Forms must stack naturally on mobile.
- Inputs should have visible labels.

## Destructive Actions

Destructive actions must be visually and semantically separated:

- reset tools belong in Recovery / System;
- group/team/matchup removal actions should say "unplayed" or "future" where that is the actual safety boundary;
- the server remains the source of truth for historical protection;
- UI copy should explain when recorded play prevents deletion or movement.

## Responsive Behavior

Admin pages must work on phones and tablets:

- horizontal scrolling is allowed only for explicit navigation strips or wide data tables;
- primary action rows must wrap;
- division selectors should become horizontal on narrow screens and sidebar-like on desktop;
- forms should collapse to one column when needed;
- buttons must remain tappable and visible.

## Loading and Error States

Public routes use skeletons where slow transitions are likely. Admin pages should avoid excessive skeletons but must provide clear pending states for mutations.

Public errors should use neutral application screens and must not expose Prisma, database, or environment details.

## Visual Style

Keep the MPW application institutional, operational, and sports-oriented:

- prefer clear typography, badges, tabs, and concise controls;
- avoid generic SaaS hero language;
- avoid large decorative cards nested inside cards;
- use color for hierarchy, but pair it with text;
- keep copy direct and government-office appropriate.

## Future Codex Rules

Before changing admin setup or player-pool UX:

- preserve the selected-division workflow;
- preserve readiness/status summaries;
- preserve advanced disclosure for technical fields;
- preserve backend historical protections;
- do not hardcode Open/Executive counts, names, or formats.
## Tournament-day status language

Use consistent labels across manager, admin, and public operational views:

- Ongoing — play is active.
- Ready to play — both valid lineups are complete and games are ready.
- Pending lineup — one or both sides still need lineup work.
- Scheduled — teams are assigned but play is not lineup-ready yet.
- Completed — normal result is final.
- Forfeited — result was decided by official forfeit/default.
- Interrupted — game started but is temporarily stopped.

For Team Leaders, prefer manager-specific action copy when it is more useful than the raw matchup state: “Needs your lineup,” “Complete your lineup,” or “Waiting for opponent.”

Lineup screens should make player usage visible without opening dropdowns. A manager should be able to identify selected players, their game number, unpaired eligible players, unavailable players, and protected/played assignments at a glance.

