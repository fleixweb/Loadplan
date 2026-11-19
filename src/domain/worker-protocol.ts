/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import type {
  Cargo,
  Container,
  PackingResult,
  FleetOptions,
  FleetResult,
} from "./types";
import type { ComparisonRun } from "./comparison";
import type { SuiteEntry } from "./cases";

export type PackingRequest =
  | { task?: "pack"; container: Container; cargo: Cargo[] }
  | { task: "compare"; container: Container; cargo: Cargo[] }
  | { task: "suite" }
  | { task: "fleet"; options: FleetOptions; cargo: Cargo[] };
export type PackingResponse =
  | {
      result: PackingResult;
      runs?: never;
      suite?: never;
      error?: never;
      fleet?: never;
      progress?: never;
    }
  | {
      runs: ComparisonRun[];
      result?: never;
      suite?: never;
      error?: never;
      fleet?: never;
      progress?: never;
    }
  | {
      suite: SuiteEntry[];
      result?: never;
      runs?: never;
      error?: never;
      fleet?: never;
      progress?: never;
    }
  | {
      error: string;
      result?: never;
      runs?: never;
      suite?: never;
      fleet?: never;
      progress?: never;
    }
  | {
      fleet: FleetResult;
      result?: never;
      runs?: never;
      suite?: never;
      error?: never;
      progress?: never;
    }
  | {
      progress: { done: number; total: number };
      result?: never;
      runs?: never;
      suite?: never;
      error?: never;
      fleet?: never;
    };
