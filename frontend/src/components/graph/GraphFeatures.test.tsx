import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import ServiceInspector from "./ServiceInspector";
import { drawNode, drawLink, getNodeKind } from "./renderers";
import type { VisualNode, VisualEdge } from "./types";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    owner: vi.fn(),
  },
}));

describe("Graph Node & Link Visual Renderers", () => {
  it("correctly identifies node kinds", () => {
    expect(getNodeKind("Service")).toBe("Service");
    expect(getNodeKind("Incident")).toBe("Incident");
    expect(getNodeKind("Deploy")).toBe("Deploy");
    expect(getNodeKind("Evidence")).toBe("Evidence");
    expect(getNodeKind("UnknownLabel")).toBe("Unknown");
  });

  it("draws Service node with outer focus aura when selected and dims when unrelated", () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      roundRect: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      globalAlpha: 1.0,
      shadowColor: "",
      shadowBlur: 0,
      lineWidth: 1,
      strokeStyle: "",
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    const focusedNode: VisualNode = {
      id: "svc:payments-api",
      label: "Service",
      name: "payments-api",
      props: { tier: "Tier 2", team: "Payments" },
      highlight: true,
      isFocused: true,
      score: 7.5,
      animScore: 7.5,
      kind: "Service",
    };

    drawNode(focusedNode, mockCtx, 1.0, true, 1.0);

    // Save and restore called
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
    // Arc called for main circle and focus ring
    expect(mockCtx.arc).toHaveBeenCalled();

    // Dimmed node test
    const dimmedNode: VisualNode = {
      id: "svc:orders",
      label: "Service",
      name: "orders",
      props: {},
      highlight: false,
      isFocused: false,
      kind: "Service",
    };

    drawNode(dimmedNode, mockCtx, 1.0, true, 1.0);
    // ctx.globalAlpha should be set to dim (0.22)
    expect(mockCtx.globalAlpha).toBe(0.22);
  });

  it("draws ghost evidence node with dashed red strikethrough", () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      roundRect: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      globalAlpha: 1.0,
      shadowColor: "",
      shadowBlur: 0,
      lineWidth: 1,
      strokeStyle: "",
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    const ghostNode: VisualNode = {
      id: "ev:deploy:payments-api",
      label: "Evidence",
      name: "deploy-evidence",
      props: { removed: true, source: "cicd-deploy-log" },
      highlight: false,
      isFocused: false,
      isGhost: true,
      kind: "Evidence",
    };

    drawNode(ghostNode, mockCtx, 1.0, false, 1.0);
    expect(mockCtx.setLineDash).toHaveBeenCalledWith([3, 3]);
    // Strikethrough line
    expect(mockCtx.moveTo).toHaveBeenCalled();
    expect(mockCtx.lineTo).toHaveBeenCalled();
  });

  it("draws ATTEMPTED link with visible status badge", () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 35 }),
      globalAlpha: 1.0,
      lineWidth: 1,
      strokeStyle: "",
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    const edge: VisualEdge = {
      id: "att:1",
      source: { id: "inc:1", x: 0, y: 0, kind: "Incident" } as VisualNode,
      target: { id: "fix:restart", x: 100, y: 100, kind: "Fix" } as VisualNode,
      type: "ATTEMPTED",
      props: { status: "FAILED" },
      highlight: false,
      isGhost: false,
    };

    drawLink(edge, mockCtx, 1.0, false, 1.0);
    expect(mockCtx.fillText).toHaveBeenCalledWith(expect.stringContaining("FAILED"), 50, 50);
  });
});

describe("ServiceInspector Component", () => {
  it("renders service details, dependencies, and heuristic label", async () => {
    const mockOwnerApi = vi.mocked(api.owner);
    mockOwnerApi.mockResolvedValue({
      service: "payments-api",
      owner: "Asha",
      date: "2026-10-17",
      valid_from: "2026-01-01",
      valid_to: null,
      history: [],
    });

    const mockNode = {
      id: "svc:payments-api",
      name: "payments-api",
      label: "Service",
      highlight: true,
      score: 7.5,
      props: { tier: "Tier 1", team: "Core Payments", description: "Handles debit and card processing" },
    };

    const mockEdges = [
      {
        id: "e1",
        source: "svc:payments-api",
        target: "svc:auth-provider",
        type: "DEPENDS_ON",
        props: {},
        highlight: false,
      },
      {
        id: "e2",
        source: "svc:checkout",
        target: "svc:payments-api",
        type: "DEPENDS_ON",
        props: {},
        highlight: false,
      },
    ];

    const onFocus = vi.fn();
    const onAskChat = vi.fn();
    const onViewOwners = vi.fn();
    const onStressTest = vi.fn();
    const onClose = vi.fn();

    render(
      <ServiceInspector
        serviceName="payments-api"
        node={mockNode}
        edges={mockEdges}
        onFocus={onFocus}
        onAskChat={onAskChat}
        onViewOwners={onViewOwners}
        onStressTest={onStressTest}
        onClose={onClose}
      />
    );

    // Verify service name and tags
    expect(screen.getByText("payments-api")).toBeInTheDocument();
    expect(screen.getByText("Tier 1")).toBeInTheDocument();
    expect(screen.getByText("Core Payments")).toBeInTheDocument();

    // Verify heuristic label exists verbatim
    expect(screen.getByText("* heuristic, not a probability")).toBeInTheDocument();
    expect(screen.getByText("7.5")).toBeInTheDocument();

    // Verify owner loaded from API
    await waitFor(() => {
      expect(screen.getByText("Asha")).toBeInTheDocument();
      expect(screen.getByText("Effective since 2026-01-01")).toBeInTheDocument();
    });

    // Verify upstream and downstream dependencies
    expect(screen.getByText("auth-provider")).toBeInTheDocument();
    expect(screen.getByText("checkout")).toBeInTheDocument();

    // Verify action buttons
    const centerBtn = screen.getByRole("button", { name: /Center/i });
    fireEvent.click(centerBtn);
    expect(onFocus).toHaveBeenCalledWith("payments-api");

    const chatBtn = screen.getByRole("button", { name: /Ask in Copilot Chat/i });
    fireEvent.click(chatBtn);
    expect(onAskChat).toHaveBeenCalledWith(expect.stringContaining("payments-api"));

    const ownersBtn = screen.getByRole("button", { name: /Owners/i });
    fireEvent.click(ownersBtn);
    expect(onViewOwners).toHaveBeenCalledWith("payments-api");

    const stressBtn = screen.getByRole("button", { name: /Stress-test in Shock Lab/i });
    fireEvent.click(stressBtn);
    expect(onStressTest).toHaveBeenCalled();

    const closeBtn = screen.getByRole("button", { name: /Clear service selection/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("handles missing owner and null score gracefully", async () => {
    const mockOwnerApi = vi.mocked(api.owner);
    mockOwnerApi.mockRejectedValue(new Error("Network failure"));

    const mockNode = {
      id: "svc:unknown-service",
      name: "unknown-service",
      label: "Service",
      highlight: false,
      score: null,
      props: {},
    };

    render(
      <ServiceInspector
        serviceName="unknown-service"
        node={mockNode}
        edges={[]}
      />
    );

    expect(screen.getByText("unknown-service")).toBeInTheDocument();
    // No heuristic score card when score is null
    expect(screen.queryByText("* heuristic, not a probability")).not.toBeInTheDocument();

    // Handles failed owner lookup
    await waitFor(() => {
      expect(screen.getByText("Ownership not recorded")).toBeInTheDocument();
    });
  });
});
