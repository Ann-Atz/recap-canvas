PRD — Recap Canvas
Header
•	Project name: Recap Canvas
•	Date: 26 Jan 2026
•	Author: Ann
•	Version: v1.0 (Draft)
•	Short pitch:
A spatial, canvas-based AI tool that lets UX designers cluster messy design artifacts and generate grounded, handover-ready summaries of their design thinking from a single selection—optimized for low-friction handovers and design recall, without turning documentation into a maintenance burden.
•	Relevant links:
o	(Prototype repo / demo link – TBD)
o	(Course: Vibe Coding for UX Designers)
 
1) Core Context
Problem
Design reasoning is frequently lost during handovers or when revisiting work after time has passed.
Key decisions, constraints, and assumptions are scattered across tools (Figma, FigJam, Slack, Docs), forcing teams to reconstruct the “why” behind designs from memory or partial evidence.
This leads to:
•	Significant time spent re-gathering context.
•	Misunderstood decisions and avoidable rework.
•	Over-reliance on verbal explanations that do not scale.
Solution
Recap Canvas provides a lightweight, spatial canvas where designers:
•	Drop existing artifacts without restructuring them.
•	Select clusters of related items.
•	Generate a structured, evidence-grounded summary of design reasoning using AI.
The tool focuses on recovering design thinking, not enforcing ongoing documentation.
Target Users
•	Primary: Mid-level UX designers (2–5 years experience) working in product teams.
o	Delivery-focused.
o	Familiar with Figma, FigJam, Slack, Jira, Google Docs.
o	Limited bandwidth for maintaining separate documentation systems.
Primary Use Cases
•	Create a clear handover explanation when the original designer will not be present.
•	Reconstruct context when returning to a design area weeks or months later.
•	Copy a concise design rationale into handover docs, Jira tickets, Slack threads, or reviews.
North-Star Metric
•	Time from scattered artifacts to usable handover summary ≤ 2 minutes
o	“Usable” = structured explanation that can be pasted into a handover document.
Non-Goals
•	Automatic ingestion from external tools (Figma, Slack, Jira).
•	Continuous or mandatory documentation workflows.
•	AI critique, evaluation, or strategic recommendations.
•	Multi-user collaboration or real-time syncing (V1).
 
2) UX Foundations
Personas
Personas are implicit. UX decisions optimize for:
•	Practicing UX designers in active product delivery.
•	Users who already “know how” to explain decisions but lack time and continuity.
Experience Principles
•	Low friction by default — no setup ceremony or forced structure.
•	Spatial thinking over linear workflows — canvas first, not forms.
•	Trust before cleverness — grounded summaries over generative flourish.
•	AI as assistant, not author — summarize and surface uncertainty.
Accessibility & Inclusion Requirements
•	Keyboard-accessible canvas interactions (selection, actions).
•	Readable contrast and text sizing.
•	No critical information conveyed by color alone.
High-Level Journey
1.	Open canvas → drop existing artifacts
2.	Spatially cluster related items
3.	Drag-select an area
4.	Generate AI summary
5.	Copy summary into handover context
 
3) Scope & Priorities
MVP (V1) Goals
P0 features:
•	Infinite canvas with draggable blocks:
o	Text blocks
o	Image blocks (with captions)
o	Link blocks (label + URL)
•	Marquee (rectangle) selection of multiple blocks.
•	AI-generated summary block:
o	Based only on selected blocks.
o	Structured output.
o	Explicit evidence references.
Out of Scope (V1)
•	❌ Automatic ingestion from Figma/Slack/Jira.
•	❌ Image understanding beyond captions.
•	❌ Versioning or history of summaries.
•	❌ Multi-user collaboration.
Assumptions & Risks
•	Designers will manually place artifacts they already have.
•	AI hallucination is a critical trust risk.
•	Over-engineering would undermine adoption more than missing features.
 
4) Tech Overview
Frontend
•	React + TypeScript
•	Minimal CSS (no heavy design system)
Backend
•	None (client-side only for V1)
State & Persistence
•	localStorage for canvas state and blocks.
AI Integration
•	AI summarization function:
o	Initially mocked or API-backed.
o	Receives only explicitly selected content.
Deployment
•	Local prototype or static deployment (course scope).
Security / Privacy
•	No analytics in V1.
•	No background data ingestion.
•	AI receives no hidden or inferred context.
 
5) Feature Modules
Module 1 — Canvas & Blocks (P0)
User Story:
As a UX designer, I want to freely place artifacts on a canvas so I can spatially organize design context.
Acceptance Criteria
•	Canvas supports free placement and dragging.
•	Blocks have visible IDs.
•	Supported block types: text, image, link.
 
Module 2 — Area Selection (P0)
User Story:
As a designer, I want to select related artifacts together so I can summarize a design area holistically.
Acceptance Criteria
•	Click-drag marquee selection.
•	Selected blocks are visually highlighted.
•	Mixed block types can be selected together.
 
Module 3 — AI Summary Block (P0)
User Story:
As a designer, I want a structured summary of selected artifacts so I can explain design decisions during handover.
Acceptance Criteria
•	“Summarize this area” action appears after selection.
•	Summary block appears adjacent to the selected cluster.
•	Output structure:
o	What this area is about
o	Key decisions
o	Constraints
o	Assumptions / open questions
•	Claims reference block IDs as evidence.
•	Summary text is selectable and copyable.
 
6) AI Design
AI Input
The AI receives only:
•	Text from selected text blocks.
•	Captions from image blocks.
•	Labels and URLs from link blocks.
AI Must NOT
•	Invent decisions or rationale.
•	Judge whether decisions were good or bad.
•	Make recommendations or strategic suggestions.
•	Infer unstated stakeholder intent.
Error Handling & Trust
•	Hallucinations are problematic, not acceptable.
•	If input is insufficient, the AI must:
o	Explicitly state uncertainty.
o	Surface open questions instead of guessing.
 
7) IA, Flows & UI
Main Screens
•	Single canvas view (V1).
Key Flows
•	Add artifacts → select area → generate summary → copy output.
Components
•	Draggable blocks.
•	Marquee selection overlay.
•	Summary block with structured sections and references.
 
8) Iteration & Workflow
Sprint Rhythm
•	Short, feature-focused iterations.
Development Approach
•	One feature per prompt (Vibe Coding).
•	Acceptance criteria included in each coding prompt.
•	Frequent commits to avoid regression.
Review
•	Self-review against PRD + demo criteria.
 
9) Quality
Testing Requirements
•	Canvas interactions (drag, select).
•	Summary generation from selected blocks.
•	Copy/paste of summary output.
Accessibility Checks
•	Keyboard navigation for selection and actions.
•	Contrast and readability checks.
Performance Expectations
•	Feels immediate and lightweight.
•	No noticeable delay for small selections.
 
10) Metrics & Analytics
V1
•	No analytics instrumentation.
Validation Method
•	Manual demo against North-Star Metric:
o	≥3 artifacts
o	Drag-select
o	Generate structured summary
o	Copy into handover doc
o	≤2 minutes total
 
11) Launch & Operations
Environment
•	Single prototype environment.
Rollout
•	Demo-driven evaluation for course submission.
Maintenance
•	None beyond prototype scope.

