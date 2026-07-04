"use client";

import React from "react";

/**
 * StatsCard — A premium, flat card with a subtle hover zoom and glow effect.
 * Pure CSS-driven transitions for performance.
 *
 * @param {object} props
 * @param {React.ReactNode} props.icon — The Lucide icon component
 * @param {string|number} props.value — The stat value
 * @param {string} props.label — The stat label
 * @param {string} props.glowColor — CSS color for the glow effect
 */
export default function StatsCard3D({ icon, value, label, glowColor = "var(--primary)" }) {
  return (
    <div
      className="stats-card glass-panel stats-card-flat"
      style={{
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease",
      }}
    >
      <div 
        className="stats-card-glow" 
        style={{ 
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(circle at 50% 50%, ${glowColor}10 0%, transparent 65%)`,
          pointerEvents: "none",
          transition: "opacity 0.25s ease",
        }} 
      />
      
      <div className="stats-card-icon" style={{ opacity: 0.8, marginBottom: "16px", color: glowColor }}>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
