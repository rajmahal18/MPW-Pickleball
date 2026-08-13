# MPW Pickleball UI/UX Guidelines

Last updated: 2026-08-13

## Core Principle

The flexible tournament engine is intentional. The UI must make that flexibility understandable without making administrators feel like they are editing database rows.

Tournament-day screens should answer:

- Which division or operational area am I editing?
- What is its current state?
- What needs attention?
- What can I safely change?
- What is protected because play has started?

Use **match / matches** in user-facing tournament language. Internal Prisma/domain identifiers may remain `Game`/`games` where changing them would require an unnecessary schema or route migration.

## Admin Information Architecture

Admin navigation prioritizes ordinary tournament-day operations:

- Overview / Control
- Tournament Setup
- Player Pool
- Voting
- Checkpoints and Audit

Testing/simulation and destructive maintenance routes may remain available for QA/recovery, but they should not add visual noise to the primary tournament-day navigation.

## Tournament Setup Pattern

Tournament Setup should behave like a tournament operations workflow:

- show one selected division as the main workspace and keep division switching obvious;
- show compact summary metrics before editing;
- order the main sections as **Division → Teams & Groups → Lineup Rules → Courts → Matchups**;
- manage team identity and group placement in one team area instead of duplicating placement in a second section;
- keep technical/bulk/developer helpers out of the normal setup flow;
- hide slugs, sort order, long guide notes, destructive actions, and uncommon fields under disclosure;
- make group, team, and matchup actions contextual;
- show protected/locked state for matchups with recorded play;
- present courts as horizontal court lanes with vertically stacked matchup blocks;
- update court count, queue assignment, court reassignment, queue reorder, and removal in place without a full-page refresh.

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

## Mobile-first tournament operations

Mobile screens are purpose-focused, not compressed desktop screens. Ease of access is the priority during tournament operations.

- Keep the primary action and current status visible before explanatory copy.
- Hide or collapse secondary guidance, legends, technical metadata, and advanced filters when they are not required to act.
- Use horizontally scrollable navigation/tab/chip strips for short operational choices instead of forcing them into multiple cramped rows.
- Convert wide admin tables into compact mobile cards when the user needs to act on individual records; retain the richer table on desktop.
- Keep live scoring controls for both sides visible at the same time. Do not force the scorer to scroll between teams for routine +1/−1 actions.
- Render the bracket as a vertical stage-by-stage list on phones instead of forcing the desktop connector canvas into a horizontal scroll area.
- Keep standings compact and readable with the official `Matches / W / L / NPD / TP` columns; Matches/W/L are decided pair-match totals, not team-matchup records.
- On Player Pool mobile views, expose search, attendance, and assignment first; put lower-frequency filters under **More filters**.
- Keep destructive/recovery operations explicit and confirmed even when their mobile presentation is simplified.
- Avoid horizontal page overflow. Horizontal scrolling is acceptable only inside deliberate controls such as nav strips, match chips, or data regions that cannot be represented more clearly as cards.

## Player recognition

Player photos are operational identity cues, not decoration. On MVP, Fan Favorite, team rosters, and match/live-match views:

- prioritize photo → player name → team/context → stats/actions;
- use the uploaded player photo whenever available and initials only as a fallback;
- keep portraits large enough to recognize on a phone;
- show pair headshots in match views when lineups are known instead of hiding them to save a few pixels;
- reduce dead whitespace before shrinking player identity elements.

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
- Ready to play — both valid lineups are complete and matches are ready.
- Pending lineup — one or both sides still need lineup work.
- Scheduled — teams are assigned but play is not lineup-ready yet.
- Completed — normal result is final.
- Forfeited — result was decided by official forfeit/default.
- Interrupted — a match started but is temporarily stopped.

For Team Leaders, prefer manager-specific action copy when it is more useful than the raw matchup state: “Needs your lineup,” “Complete your lineup,” or “Waiting for opponent.”

Lineup screens should make player usage visible without opening dropdowns. A manager should be able to identify selected players, their match number, unpaired eligible players, unavailable players, and protected/played assignments at a glance.
