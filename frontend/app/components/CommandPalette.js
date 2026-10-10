"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";

import { useFocusTrap } from "../lib/hooks";

/**
 * Ctrl/Cmd+K palette. Every journey in the app is reachable from here without a
 * mouse: arrows move, Enter runs, Escape closes and focus returns to the opener.
 *
 * The parent mounts this only while open, so query and cursor reset naturally
 * instead of being cleared by an effect.
 */
export default function CommandPalette({ onClose, commands }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef(null);
  const trapRef = useFocusTrap(true);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.group} ${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Clamped rather than corrected in an effect, so filtering can never point at
  // a row that no longer exists.
  const active = Math.min(cursor, Math.max(0, matches.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (command) => {
    onClose();
    command.run();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(matches.length ? (active + 1) % matches.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(matches.length ? (active - 1 + matches.length) % matches.length : 0);
    } else if (e.key === "Enter" && matches[active]) {
      e.preventDefault();
      run(matches[active]);
    }
  };

  let lastGroup = null;

  return (
    <div
      className="palette-wrap"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <input
          className="palette-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands, runs and settings…"
          aria-label="Search commands"
          aria-controls="palette-results"
          autoComplete="off"
        />
        <div className="palette-list" id="palette-results" role="listbox" ref={listRef}>
          {matches.length === 0 ? (
            <p className="palette-group">No matching command</p>
          ) : (
            matches.map((command, index) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              return (
                <div key={command.id}>
                  {showGroup ? <div className="palette-group">{command.group}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    className="palette-item"
                    onMouseMove={() => setCursor(index)}
                    onClick={() => run(command)}
                  >
                    {command.icon ? <command.icon size={16} aria-hidden="true" /> : null}
                    <span>{command.label}</span>
                    {command.hint ? <kbd className="kbd">{command.hint}</kbd> : null}
                    {index === active && !command.hint ? (
                      <CornerDownLeft size={14} className="kbd" aria-hidden="true" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
