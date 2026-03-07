# Project-Arch UI & Feature Pitch

Based on the analysis of `project-arch` (a deterministic architecture CLI tracking Phases, Milestones, Tasks, and Decisions) and the existing `testProject/apps/arch` (a ReactFlow-based visualization), here is a pitch for the optimal Developer Experience (DX) for exploring and managing repository architecture.

## 🎯 The Vision

To transform `project-arch` from a simple map viewer into an **Interactive Architecture Workspace**—a single pane of glass where developers can effortlessly navigate codebases, understand complex dependencies, track project milestones, and review architectural decisions (ADRs).

## 📍 Implementation Scope

- Primary implementation target: `testProject` (especially `testProject/apps/arch` and related local data/APIs).
- Do not implement redesign changes in CLI/templates during this phase.
- After `testProject` is complete and validated, sync changes into CLI scaffolding/templates as a separate follow-up phase.

---

## 🏗️ Proposed UI Layout (The "IDE-like" Experience)

To provide the best DX, the UI should mimic the familiarity of an IDE, offering high information density without feeling cluttered.

### 1. **Left Sidebar: Navigation & Unified Explorer**

- **Views Toggle:** Switch between "Architecture Map", "Decisions (ADRs)", "Tasks/Roadmap", and "Repository Docs".
- **Tree Explorer:** A hierarchical view of Domains -> Sub-domains -> Modules to quickly jump around.
- **Filters & Toggles:** Quick toggles for showing/hiding node types (Domains, Modules, Tasks, Decisions), statuses (e.g., Hide Completed Tasks), and edge types (Data flow vs. Dependency).

### 2. **Main Content Area (Flexible Workspace)**

- **The Graph Canvas:** The primary ReactFlow graph.
  - **Smart Grouping:** Display "Tasks" inside "Milestones" inside "Phases" as nested nodes (subflows).
  - **Minimap & Controls:** Essential for large repositories.
- **Split-Pane Support:** Ability to view the Graph side-by-side with a Document (e.g., viewing an ADR while seeing its impact on the graph).

### 3. **Right Sidebar: Deep Inspector**

- Context-sensitive panel that opens when a user clicks a node in the graph or tree.
- **For a Task:** Shows description, linked files (modules), status, and blocked/blocks relationships.
- **For a Decision (ADR):** Shows the full markdown content, status (Accepted/Proposed/Rejected), and influenced domains.
- **For a Module/File:** Shows file path, size, imported-by, and imports-from.

### 4. **Top Bar: Global Search & Context**

- **Omnibar (Command Palette):** `Cmd/Ctrl + K` to instantly search for any Task, Decision, or Domain across the repository.
- **Breadcrumbs:** To show current context (e.g., `Phase 1 > Auth Milestone > Setup OAuth Task`).

---

## ✨ High-Impact Feature List

### 1. Interactive Dependency Tracing ("Focus Mode")

- **Feature:** When a user selects a node (e.g., a Module or Task), the graph fades out unrelated nodes and heavily highlights upstream/downstream dependencies.
- **Why?** It instantly answers: "If I change this module, what else might break?" or "What needs to be done before this task can start?"

### 2. Time-Travel / Roadmap View

- **Feature:** A slider or timeline toggle that allows users to see the architecture as it currently is, vs. how it will look after a specific Phase/Milestone is completed.
- **Why?** Helps teams visualize the transition from current state to future state.

### 3. Bi-directional Docs Integration

- **Feature:** When reading Repo Docs (Markdown) that reference an architecture component (e.g., `[[AuthDomain]]`), clicking it highlights the component in the Graph Canvas. Vice versa, clicking a domain in the graph suggests related documentation.
- **Why?** Keeps documentation deeply connected to the actual architecture model.

### 4. Auto-Layout and Clustering Options

- **Feature:** Provide different layout algorithms (Dagre, Cola, or Force-directed) and grouping mechanisms (e.g., group by `Domain` vs group by `Phase`).
- **Why?** Different questions require different views. A developer fixing a bug needs a module-dependency view; a PM tracking progress needs a milestone-task view.

### 5. Architectural Health Indicators

- **Feature:** Visual cues (colors, badges) on the graph indicating health metrics. For example, modules with high complexity or missing tests could have a warning badge. Tasks that are past due could be highlighted in red.
- **Why?** Turns the architecture map into an actionable dashboard for tech debt and project health.

### 6. Actionable Graph Nodes

- **Feature:** Right-click context menus on nodes to take actions. (e.g., Right-click a Task -> "Open associated markdown file", Right-click a module -> "Find in GitHub/IDE").
- **Why?** Reduces friction between visualizing the architecture and actually writing code or updating tracking documents.

---

## 🛠️ Implementation Task Plan

Comprehensive implementation tasks are organized by work domain in:

- [Proposed UI Layout Tasks](./tasks/proposed-ui-layout/implementation-tasks.md)
- [High-Impact Feature Tasks](./tasks/high-impact-feature-list/implementation-tasks.md)
