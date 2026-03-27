# Setup Planning Tranches

This document defines the reusable, project-agnostic planning lanes that setup milestone templates should seed before discovery expands the work.

## Purpose

- make setup milestone templates more granular than the older umbrella-task pattern
- move recurring setup work into planned structure rather than discovery churn
- preserve discovery for genuine project-specific expansion, reconciliation, and edge cases

## Core Position

Setup milestones should seed planning tranches, not domain nouns.

The tranches below are reusable because they describe types of planning work that recur across many repositories, even when the project subject matter is different.

## Reusable Planning Tranches

### 1. Project Framing

Capture project meaning, goals, scope, and user-facing intent.

Typical outputs:

- project overview
- goals and success criteria
- user journey or operator journey framing
- scope and non-scope boundaries

### 2. Taxonomy And Authority

Define the document structure, source-of-truth rules, and authority hierarchy early enough that later setup work lands in coherent locations.

Typical outputs:

- directory taxonomy decisions
- read order and authority rules
- legacy-to-canonical migration notes when needed

### 3. Lifecycle And State Modeling

Define how important lifecycle stages, state boundaries, persistence concerns, or time-based flows should be modeled.

Typical outputs:

- state models
- lifecycle definitions
- persistence and recovery boundaries
- versioning or archival assumptions

### 4. Capability And System Modeling

Define major systems, capabilities, workflows, or subsystem interactions required by the initial project shape.

Typical outputs:

- major system definitions
- boundary and interaction rules
- capability-level workflow descriptions

### 5. Ownership And Interface Boundaries

Clarify module ownership, domain responsibility, package boundaries, and interaction constraints before implementation starts.

Typical outputs:

- module model
- domain ownership definitions
- interface or dependency rules

### 6. Documentation Structure And Authoring Model

Define how architecture information will be organized, authored, and maintained so later milestones do not sprawl into flat or duplicated documentation.

Typical outputs:

- architecture directory organization guidance
- authoring format decisions
- content and template placement guidance

### 7. Taxonomy Normalization And Reconciliation

Reserve planned space for normalizing names, resolving collisions, and standardizing recurring terminology during setup.

Typical outputs:

- naming normalization rules
- terminology reconciliation notes
- schema or taxonomy alignment guidance

### 8. Validation And Cleanup

Close setup with validation, synthesis, and cleanup work rather than treating them as accidental late discoveries.

Typical outputs:

- synthesis or finalization tasks
- consistency sweeps
- validation checks and cleanup notes

## Tranche Rules

- These tranches are planning lanes, not mandatory one-file-per-tranche outputs.
- A setup milestone may combine or split tasks within a tranche as long as the tranche remains represented.
- Setup templates should stay project-agnostic and avoid subject-matter-specific naming.
- Discovery should not be the first place these recurrent planning lanes appear.

## Discovery Boundary

Discovery should still be used for:

- project-specific edge cases
- reconciliation driven by real contradictions found during setup
- expansions that only become visible after planned tranches are worked through
- newly surfaced risks or opportunities that are not generic setup categories

## Reuse Contract

Later setup-template work should use these tranches as the reusable vocabulary for shaping planned setup tasks before discovery begins to branch the work further.
