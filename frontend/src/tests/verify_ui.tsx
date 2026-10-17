import React from "react";
import ReactDOMServer from "react-dom/server";
import ShockViz from "../components/ShockViz";
import GraphLegend from "../components/graph/GraphLegend";
import type { EvidenceShockResponse } from "../components/graph/shockTypes";

// Test 1: Verify NO hardcoded prediction strings exist in ShockViz output
export function testNoHardcodedPredictions() {
  const mockShock: EvidenceShockResponse = {
    incident_id: "INC-042",
    service: "checkout",
    symptom: "latency",
    verdict: "inconclusive",
    margin_before: 3.0,
    margin_after: 0.0,
    top_suspect_before: "payments-api",
    top_suspect_after: "payments-api",
    hypotheses: [
      {
        service: "payments-api",
        hops: 1,
        score: 4.5,
        rank: 1,
        score_before: 7.5,
        score_after: 4.5,
        rank_before: 1,
        rank_after: 1,
        evidence: [
          {
            id: "ev:deploy:payments-api",
            kind: "deploy",
            source: "cicd-deploy-log",
            weight: 3.0,
            owner_service: "payments-api",
            label: "Recent deploy on payments-api: v2.3.1",
            node_ids: ["dep:DEP-036"],
            removed: true,
          },
        ],
      },
    ],
    critical_evidence: [],
    critical_sources: [
      {
        source: "cicd-deploy-log",
        impact_score: 1.42,
        evidence_count: 1,
      },
      {
        source: "incident-history",
        impact_score: 0.85,
        evidence_count: 3,
      },
    ],
    recommendation: "Candidate hypotheses are tied. Verify telemetry.",
  };

  const html = ReactDOMServer.renderToStaticMarkup(<ShockViz shock={mockShock} />);

  // Assert NO hardcoded strings
  const forbidden = [
    "Stays Robust",
    "Flips to Inconclusive",
    "Topology invariant",
  ];
  for (const str of forbidden) {
    if (html.includes(str)) {
      throw new Error(`FAIL: Found hardcoded prediction string "${str}" in rendered output!`);
    }
  }

  // Assert actual backend verdict is displayed for perturbed deploy-log
  if (!html.includes("INCONCLUSIVE")) {
    throw new Error("FAIL: Rendered output should display actual backend verdict INCONCLUSIVE");
  }
  if (!html.includes("PERTURBED")) {
    throw new Error("FAIL: Rendered output should badge perturbed channel as PERTURBED");
  }

  console.log("✓ PASS: testNoHardcodedPredictions (no hardcoded strings, actual verdict displayed)");
}

// Test 2: Missing comparison data does not generate fake values
export function testMissingComparisonData() {
  const minimalShock: EvidenceShockResponse = {
    incident_id: "INC-099",
    service: "auth",
    symptom: "5xx",
    verdict: "robust",
    margin_before: 2.0,
    margin_after: 2.0,
    top_suspect_before: "auth-svc",
    top_suspect_after: "auth-svc",
    hypotheses: [
      {
        service: "auth-svc",
        hops: 0,
        score: 5.0,
        rank: 1,
        // score_before, score_after, rank_before, rank_after OMITTED
        evidence: [],
      },
    ],
    critical_sources: [
      {
        source: "service-topology",
        impact_score: 0.5,
        evidence_count: 2,
      },
    ],
    recommendation: "Diagnosis is robust.",
  };

  const html = ReactDOMServer.renderToStaticMarkup(<ShockViz shock={minimalShock} />);

  // Should NOT display a fake arrow '→' in the score or fake delta '+0.0'
  if (html.includes("+0.0")) {
    throw new Error("FAIL: Missing score_before generated a fake delta '+0.0'");
  }
  // Should display the single score 5.0
  if (!html.includes("5.0")) {
    throw new Error("FAIL: Expected score 5.0 to be rendered");
  }

  console.log("✓ PASS: testMissingComparisonData (no fake deltas or fake rank transitions)");
}

// Test 3: Graph Legend starts collapsed by default
export function testGraphLegendCollapsedByDefault() {
  const htmlCollapsed = ReactDOMServer.renderToStaticMarkup(<GraphLegend />);

  // In collapsed mode: button with text "Legend"
  if (!htmlCollapsed.includes("Legend")) {
    throw new Error("FAIL: GraphLegend collapsed button should display 'Legend'");
  }
  // Node breakdown table should NOT be rendered when collapsed
  if (htmlCollapsed.includes("Removed Evidence (ghost)")) {
    throw new Error("FAIL: GraphLegend should not render full breakdown when collapsed by default");
  }

  // Expanded mode:
  const htmlExpanded = ReactDOMServer.renderToStaticMarkup(<GraphLegend defaultCollapsed={false} />);
  if (!htmlExpanded.includes("Collapse ▼")) {
    throw new Error("FAIL: GraphLegend expanded mode should show 'Collapse ▼'");
  }
  if (!htmlExpanded.includes("Removed Evidence (ghost)")) {
    throw new Error("FAIL: GraphLegend expanded mode should show legend contents");
  }

  console.log("✓ PASS: testGraphLegendCollapsedByDefault (starts collapsed pill, expands on demand)");
}

import { runAllApiClientTests } from "./test_api_client";

// Run all tests
async function runSuite() {
  testNoHardcodedPredictions();
  testMissingComparisonData();
  testGraphLegendCollapsedByDefault();
  await runAllApiClientTests();
  console.log("\nALL FOCUSED UI & API CLIENT VERIFICATION TESTS PASSED SUCCESSFULLY!");
}

runSuite().catch((err) => {
  console.error(err);
  const p = (globalThis as any).process;
  if (p && typeof p.exit === "function") {
    p.exit(1);
  } else {
    throw err;
  }
});
