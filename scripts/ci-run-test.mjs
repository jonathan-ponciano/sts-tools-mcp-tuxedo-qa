#!/usr/bin/env bun
// Entry point for a GitHub Actions self-hosted runner (repository_dispatch)
// to trigger a tuxedo-qa test run directly — no MCP/chat in the loop.
//
// Deliberately does NOT check the `validated` sandbox flag the way the
// scheduler does: a webhook-triggered CI run is an explicit, human-wired
// action (someone set up the workflow on purpose), the same trust level as
// a manual "Rodar" click in the dashboard or a chat-driven run_tests call —
// both of which already run regardless of validated status today. Nothing
// about the existing sandbox gate (scheduler auto-pickup, webhook
// notifications for unvalidated tests) changes; this just adds one more
// legitimate way to trigger the same run_tests path.
//
// Usage:
//   TUXEDO_QA_PROJECT=<slug-or-empty> TUXEDO_CI_TEST=<file-or-empty> bun scripts/ci-run-test.mjs
//
// Env vars:
//   TUXEDO_QA_PROJECT  which project's tests (matches the -e used when this
//                      project was registered via install.sh). Omit for the
//                      default/unnamespaced project.
//   TUXEDO_CI_TEST     specific test file to run (e.g. "login-checkout" or
//                      "login-checkout.spec.ts"). Omit to run every enabled
//                      test for the project.
//
// Exit code is 0 only if every test that ran passed — this is what makes
// the GitHub Actions job itself show green/red correctly.

import { runTests } from '../src/tools/run-tests.js';
import { readLastRun } from '../src/lib/results-store.js';
import { lastRunFor } from '../src/lib/paths.js';

const project = process.env.TUXEDO_QA_PROJECT || null;
const testFile = process.env.TUXEDO_CI_TEST || undefined;

const message = await runTests({ test_file: testFile, wait_for_result: true }, project);
console.log(message);

const summary = readLastRun(lastRunFor(project));
if (!summary) {
  console.error('Nenhum resumo de execução encontrado — tratando como falha.');
  process.exit(1);
}

console.log(`\n${summary.passed} passou, ${summary.failed} falhou, ${summary.skipped} pulado.`);
process.exit(summary.failed > 0 ? 1 : 0);
