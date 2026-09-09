/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import type { Cargo, Container, PackingResult } from "./types";
import type { ComparisonRun } from "./comparison";
import type { SuiteEntry } from "./cases";

export type PackingRequest =
  | { task?: "pack"; container: Container; cargo: Cargo[] }
  | { task: "compare"; container: Container; cargo: Cargo[] }
  | { task: "suite" };
export type PackingResponse =
  | { result: PackingResult; runs?: never; suite?: never; error?: never }
  | { runs: ComparisonRun[]; result?: never; suite?: never; error?: never }
  | { suite: SuiteEntry[]; result?: never; runs?: never; error?: never }
  | { error: string; result?: never; runs?: never; suite?: never };
