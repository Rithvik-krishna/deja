/**
 * Focused tests for Deja API client ProofOps / Evidence Shock Lab v1.1 methods.
 * Tests request paths, methods, serialization, error handling, and component integration.
 */
import { api } from "../api/client";
import type {
  EvidenceShockRequest,
  EvidenceShockResponse,
  HypothesisResponse,
} from "../api/client";
import React from "react";
import ReactDOMServer from "react-dom/server";
import ShockViz from "../components/ShockViz";

// Helper to intercept global fetch
let originalFetch: typeof globalThis.fetch;
let interceptedRequests: { url: string; init?: RequestInit }[] = [];

function setupFetchMock(mockResponse: (url: string, init?: RequestInit) => { status: number; body: any }) {
  originalFetch = globalThis.fetch;
  interceptedRequests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    interceptedRequests.push({ url, init });
    const { status, body } = mockResponse(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Bad Request",
      json: async () => body,
    } as Response;
  }) as typeof globalThis.fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

export async function testHypothesesEndpoint() {
  const mockHypothesesResp: HypothesisResponse = {
    incident_id: "INC-042",
    service: "checkout",
    symptom: "latency",
    hypotheses: [
      {
        service: "payments-api",
        hops: 1,
        score: 7.5,
        rank: 1,
        owner: "Asha Menon",
        evidence: [
          {
            id: "ev:deploy:payments-api",
            kind: "deploy",
            source: "cicd-deploy-log",
            weight: 3.0,
            owner_service: "payments-api",
            label: "Recent deploy on payments-api: v2.3.1",
            node_ids: ["dep:DEP-036"],
            removed: false,
          },
        ],
      },
    ],
    graph: { nodes: [], edges: [] },
  };

  setupFetchMock((url, init) => {
    if (url.includes("/insights/hypotheses/INC-042") && (!init || init.method === undefined || init.method === "GET")) {
      return { status: 200, body: mockHypothesesResp };
    }
    return { status: 404, body: { detail: "Incident not found" } };
  });

  try {
    const result = await api.hypotheses("INC-042");
    if (result.incident_id !== "INC-042") throw new Error("Expected incident_id to be INC-042");
    if (result.hypotheses.length !== 1) throw new Error("Expected 1 hypothesis");
    if (result.hypotheses[0].service !== "payments-api") throw new Error("Expected payments-api hypothesis");

    // Verify intercepted request
    const lastReq = interceptedRequests[0];
    if (!lastReq.url.endsWith("/insights/hypotheses/INC-042")) {
      throw new Error(`Unexpected URL: ${lastReq.url}`);
    }
    if (lastReq.init?.method && lastReq.init.method !== "GET") {
      throw new Error(`Expected GET, got ${lastReq.init.method}`);
    }

    console.log("✓ PASS: testHypothesesEndpoint (GET /insights/hypotheses/{incident_id})");
  } finally {
    restoreFetch();
  }
}

export async function testEvidenceShockSerialization() {
  const mockShockResp: EvidenceShockResponse = {
    incident_id: "INC-042",
    service: "checkout",
    symptom: "latency",
    verdict: "inconclusive",
    margin_before: 3.0,
    margin_after: 0.0,
    top_suspect_before: "payments-api",
    top_suspect_after: "payments-api",
    hypotheses: [],
    critical_evidence: [],
    critical_sources: [],
    recommendation: "Test recommendation",
    graph: { nodes: [], edges: [] },
  };

  setupFetchMock((url, init) => {
    if (url.includes("/insights/evidence-shock") && init?.method === "POST") {
      return { status: 200, body: mockShockResp };
    }
    return { status: 400, body: { detail: "Bad request" } };
  });

  try {
    // 1. Object request syntax
    const reqObj: EvidenceShockRequest = {
      incident_id: "INC-042",
      remove_sources: ["cicd-deploy-log"],
      remove_evidence_ids: ["ev:deploy:payments-api"],
    };
    const res1 = await api.evidenceShock(reqObj);
    if (res1.verdict !== "inconclusive") throw new Error("Expected inconclusive verdict");

    const req1 = interceptedRequests[0];
    const body1 = JSON.parse(req1.init?.body as string);
    if (body1.incident_id !== "INC-042") throw new Error("Failed to serialize incident_id");
    if (!body1.remove_sources.includes("cicd-deploy-log")) throw new Error("Failed to serialize remove_sources");
    if (!body1.remove_evidence_ids.includes("ev:deploy:payments-api")) throw new Error("Failed to serialize remove_evidence_ids");

    // 2. Request with partial options
    interceptedRequests = [];
    const res2 = await api.evidenceShock({ incident_id: "INC-042", remove_sources: ["incident-history"] });
    if (res2.incident_id !== "INC-042") throw new Error("Request with partial options failed");

    const req2 = interceptedRequests[0];
    const body2 = JSON.parse(req2.init?.body as string);
    if (body2.incident_id !== "INC-042" || !body2.remove_sources.includes("incident-history")) {
      throw new Error("Partial options serialization mismatch");
    }

    console.log("✓ PASS: testEvidenceShockSerialization (POST /insights/evidence-shock with optional fields)");
  } finally {
    restoreFetch();
  }
}

export async function testErrorHandling404And400() {
  setupFetchMock((url, init) => {
    if (url.includes("INC-999")) {
      return { status: 404, body: { detail: "unknown incident 'INC-999'" } };
    }
    if (init?.body && String(init.body).includes("INVALID")) {
      return { status: 400, body: { detail: "mismatched service or symptom" } };
    }
    return { status: 200, body: {} };
  });

  try {
    // 404 test
    let err404Caught = false;
    try {
      await api.hypotheses("INC-999");
    } catch (e: any) {
      err404Caught = true;
      if (!e.message.includes("404") || !e.message.includes("unknown incident")) {
        throw new Error(`Expected 404 error message, got: ${e.message}`);
      }
    }
    if (!err404Caught) throw new Error("Expected 404 to throw");

    // 400 test
    let err400Caught = false;
    try {
      await api.evidenceShock({ incident_id: "INVALID" });
    } catch (e: any) {
      err400Caught = true;
      if (!e.message.includes("400") || !e.message.includes("mismatched service")) {
        throw new Error(`Expected 400 error message, got: ${e.message}`);
      }
    }
    if (!err400Caught) throw new Error("Expected 400 to throw");

    console.log("✓ PASS: testErrorHandling404And400 (consistent 400/404 exception raising)");
  } finally {
    restoreFetch();
  }
}

export async function testStressPanelWithApiResponse() {
  const mockShock: EvidenceShockResponse = {
    incident_id: "INC-042",
    service: "checkout",
    symptom: "latency",
    verdict: "robust",
    margin_before: 3.0,
    margin_after: 2.5,
    top_suspect_before: "payments-api",
    top_suspect_after: "payments-api",
    hypotheses: [
      {
        service: "payments-api",
        hops: 1,
        score: 7.5,
        rank: 1,
        score_before: 7.5,
        score_after: 7.0,
        rank_before: 1,
        rank_after: 1,
        owner: "Asha Menon",
        evidence: [
          {
            id: "ev:deploy:payments-api",
            kind: "deploy",
            source: "cicd-deploy-log",
            weight: 3.0,
            owner_service: "payments-api",
            label: "Recent deploy on payments-api: v2.3.1",
            node_ids: ["dep:DEP-036"],
            removed: false,
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
    ],
    recommendation: "Diagnosis is robust. Remediate payments-api.",
  };

  // Render ShockViz with this API response
  const html = ReactDOMServer.renderToStaticMarkup(<ShockViz shock={mockShock} />);
  if (!html.includes("VERDICT: ROBUST")) {
    throw new Error("Expected ShockViz to render VERDICT: ROBUST");
  }
  if (!html.includes("heuristic, not a probability")) {
    throw new Error("Expected ShockViz to include 'heuristic, not a probability' notice");
  }

  console.log("✓ PASS: testStressPanelWithApiResponse (ShockViz renders actual API response)");
}

export async function runAllApiClientTests() {
  await testHypothesesEndpoint();
  await testEvidenceShockSerialization();
  await testErrorHandling404And400();
  await testStressPanelWithApiResponse();
  console.log("\nALL API CLIENT TESTS PASSED SUCCESSFULLY!");
}
