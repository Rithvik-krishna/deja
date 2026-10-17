import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";

// Mock ForceGraph2D for jsdom environment
vi.mock("react-force-graph-2d", () => {
  return {
    default: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        d3ReheatSimulation: vi.fn(),
        d3Force: vi.fn(() => ({
          strength: vi.fn().mockReturnThis(),
          distance: vi.fn().mockReturnThis(),
          distanceMax: vi.fn().mockReturnThis(),
        })),
        centerAt: vi.fn(),
        zoom: vi.fn(),
        zoomToFit: vi.fn(),
      }));
      return (
        <div data-testid="mock-force-graph">
          <div data-testid="nodes-count">{props.graphData?.nodes?.length ?? 0}</div>
          {/* Button to simulate node click */}
          <button
            data-testid="simulate-node-click"
            onClick={() => {
              const targetNode = props.graphData?.nodes?.find((n: any) => n.id === "payments-api");
              if (targetNode && props.onNodeClick) {
                props.onNodeClick(targetNode);
              }
            }}
          >
            Click payments-api
          </button>
        </div>
      );
    }),
  };
});

describe("LandingPage", () => {
  it("renders the hero headline, narrative, and core sections", () => {
    const handleLaunch = vi.fn();
    render(<LandingPage onLaunchApp={handleLaunch} />);

    // Check Eyebrow & Hero Title
    expect(
      screen.getByText("INCIDENT INTELLIGENCE FOR ENGINEERING TEAMS")
    ).toBeInTheDocument();
    expect(screen.getByText(/Every incident leaves a trail/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Déjà connects services, deployments, incidents/i)
    ).toBeInTheDocument();

    // Check Core Capabilities Headings
    expect(screen.getByText("CORE CAPABILITIES")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
    expect(screen.getByText("Evidence Shock")).toBeInTheDocument();
    expect(screen.getByText("Historical Context")).toBeInTheDocument();
    expect(screen.getByText("Investigation Workflow")).toBeInTheDocument();

    // Check Architecture Section
    expect(screen.getByText("INVESTIGATION ARCHITECTURE")).toBeInTheDocument();
    expect(screen.getByText("Connect the evidence")).toBeInTheDocument();
    expect(screen.getByText("Investigate relationships")).toBeInTheDocument();
    expect(screen.getByText("Challenge the explanation")).toBeInTheDocument();

    // Check Final CTA
    expect(screen.getByText("Make the next incident less unfamiliar.")).toBeInTheDocument();
  });

  it("toggles light and dark themes on click", () => {
    const handleLaunch = vi.fn();
    render(<LandingPage onLaunchApp={handleLaunch} />);

    const themeToggleBtn = screen.getByRole("button", {
      name: /switch to light mode|switch to dark mode/i,
    });
    expect(themeToggleBtn).toBeInTheDocument();

    // Click toggle
    fireEvent.click(themeToggleBtn);
    const themeAttr = document.documentElement.getAttribute("data-theme");
    expect(themeAttr === "light" || themeAttr === "dark").toBe(true);
  });

  it("navigates demo steps forward and backward", () => {
    const handleLaunch = vi.fn();
    render(<LandingPage onLaunchApp={handleLaunch} />);

    // Step 1 initially
    expect(screen.getByText(/Step 1 of 7: System Overview/i)).toBeInTheDocument();

    // Click Next
    const nextBtn = screen.getByRole("button", { name: "Next step" });
    fireEvent.click(nextBtn);

    // Should now be Step 2
    expect(screen.getByText(/Step 2 of 7: Incident Detected/i)).toBeInTheDocument();

    // Click Prev
    const prevBtn = screen.getByRole("button", { name: "Previous step" });
    fireEvent.click(prevBtn);

    // Should return to Step 1
    expect(screen.getByText(/Step 1 of 7: System Overview/i)).toBeInTheDocument();
  });

  it("clicking a node opens the node details inspection card", () => {
    const handleLaunch = vi.fn();
    render(<LandingPage onLaunchApp={handleLaunch} />);

    // Simulate clicking payments-api
    const clickNodeBtn = screen.getByTestId("simulate-node-click");
    fireEvent.click(clickNodeBtn);

    // Inspection card should display payments-api details
    expect(screen.getAllByText("payments-api").length).toBeGreaterThan(0);
    expect(screen.getByText("Risk Score:")).toBeInTheDocument();
    expect(screen.getAllByText("33.0").length).toBeGreaterThan(0);
    expect(screen.getByText("Deselect")).toBeInTheDocument();
  });

  it("calls onLaunchApp when clicking Explore demo in navbar or CTA", () => {
    const handleLaunch = vi.fn();
    render(<LandingPage onLaunchApp={handleLaunch} />);

    const exploreBtns = screen.getAllByRole("button", { name: /explore/i });
    expect(exploreBtns.length).toBeGreaterThan(0);

    fireEvent.click(exploreBtns[0]);
    expect(handleLaunch).toHaveBeenCalledTimes(1);
  });
});
