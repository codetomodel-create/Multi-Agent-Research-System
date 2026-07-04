"use client";

import React from "react";

const AGENT_CONFIG = [
  { label: "Coordinator", color: "var(--primary)", x: 100, y: 100, labelY: 140 },
  { label: "Research Agent", color: "var(--accent)", x: 260, y: 50, labelY: 25 },
  { label: "Competitor Agent", color: "var(--accent)", x: 260, y: 150, labelY: 185 },
  { label: "Pricing Agent", color: "var(--accent)", x: 420, y: 50, labelY: 25 },
  { label: "Trends Agent", color: "var(--accent)", x: 420, y: 150, labelY: 185 },
  { label: "Report Writer", color: "var(--secondary)", x: 580, y: 100, labelY: 140 },
  { label: "Fact Checker", color: "var(--secondary)", x: 700, y: 100, labelY: 140 },
];

const BEAM_CONNECTIONS = [
  { from: 0, to: 1, id: "c-to-r" },
  { from: 0, to: 2, id: "c-to-c" },
  { from: 0, to: 3, id: "c-to-p" },
  { from: 0, to: 4, id: "c-to-t" },
  { from: 1, to: 5, id: "r-to-w" },
  { from: 2, to: 5, id: "co-to-w" },
  { from: 3, to: 5, id: "p-to-w" },
  { from: 4, to: 5, id: "t-to-w" },
  { from: 5, to: 6, id: "w-to-f" },
];

export default function AgentOrb({ activeStageIndex = 0, status = "running" }) {
  const getOrbState = (idx) => {
    if (status === "success") return { isActive: false, isCompleted: true };
    if (status === "failed" || status === "cancelled") return { isActive: false, isCompleted: false };

    const orbToStage = [0, 1, 1, 1, 1, 2, 3];
    const orbStage = orbToStage[idx];

    return {
      isActive: orbStage === activeStageIndex,
      isCompleted: orbStage < activeStageIndex,
    };
  };

  return (
    <div style={{ width: "100%", padding: "20px 0", display: "flex", justifyContent: "center" }}>
      <svg
        viewBox="0 0 800 200"
        style={{
          width: "100%",
          maxWidth: "800px",
          height: "auto",
          overflow: "visible",
        }}
      >
        <defs>
          <filter id="glow-primary" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-active" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComponentTransfer in="blur" result="glow">
              <feFuncA type="linear" slope="0.6" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Lines and Flow Packets */}
        {BEAM_CONNECTIONS.map((beam) => {
          const fromNode = AGENT_CONFIG[beam.from];
          const toNode = AGENT_CONFIG[beam.to];
          const fromState = getOrbState(beam.from);
          const toState = getOrbState(beam.to);
          
          const isBeamActive = fromState.isActive || toState.isActive || (fromState.isCompleted && toState.isCompleted);
          const isCompletedPath = fromState.isCompleted && toState.isCompleted;

          const pathD = `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`;

          return (
            <g key={beam.id}>
              <path
                d={pathD}
                stroke={isBeamActive ? (isCompletedPath ? "var(--accent)" : "var(--primary)") : "var(--glass-border)"}
                strokeWidth={isBeamActive ? 2 : 1}
                strokeOpacity={isBeamActive ? 0.6 : 0.2}
                fill="none"
                style={{ transition: "stroke 0.5s, stroke-width 0.5s" }}
              />
              {isBeamActive && (
                <circle r="4" fill={isCompletedPath ? "var(--accent)" : "var(--primary)"} filter="url(#glow-primary)">
                  <animateMotion
                    path={pathD}
                    dur={isCompletedPath ? "4s" : "2s"}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {AGENT_CONFIG.map((agent, i) => {
          const { isActive, isCompleted } = getOrbState(i);
          const nodeColor = isCompleted
            ? "var(--accent)"
            : isActive
            ? agent.color
            : "var(--text-dim)";
          
          return (
            <g key={agent.label} style={{ cursor: "default" }}>
              {isActive && (
                <circle
                  cx={agent.x}
                  cy={agent.y}
                  r="18"
                  fill="none"
                  stroke={agent.color}
                  strokeWidth="2"
                  opacity="0.6"
                >
                  <animate
                    attributeName="r"
                    values="14;24;14"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0;0.8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              <circle
                cx={agent.x}
                cy={agent.y}
                r={isActive ? "14" : "10"}
                fill={isActive ? "var(--bg-dark)" : nodeColor}
                stroke={nodeColor}
                strokeWidth={isActive ? "3" : "1.5"}
                filter={isActive ? "url(#glow-active)" : ""}
                style={{ transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />

              {isCompleted ? (
                <path
                  d={`M ${agent.x - 4} ${agent.y} L ${agent.x - 1} ${agent.y + 3} L ${agent.x + 4} ${agent.y - 3}`}
                  fill="none"
                  stroke="var(--bg-dark)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : isActive ? (
                <circle cx={agent.x} cy={agent.y} r="4" fill={agent.color} />
              ) : null}

              <text
                x={agent.x}
                y={agent.labelY}
                textAnchor="middle"
                fill={isActive ? "var(--text-main)" : "var(--text-muted)"}
                fontSize={isActive ? "12px" : "11px"}
                fontWeight={isActive ? "700" : "500"}
                fontFamily="var(--font-sans)"
                style={{ transition: "fill 0.3s, font-weight 0.3s" }}
              >
                {agent.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
