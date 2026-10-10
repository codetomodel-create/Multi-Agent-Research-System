"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api";

const STALL_MS = 20000;
const POLL_MS = 1500;

const TERMINAL = new Set(["success", "failed", "cancelled"]);

/**
 * Live run state for one task.
 *
 * SSE is the primary channel; polling is the automatic fallback when the stream
 * errors or the connection stalls. `stalled` drives the reconnect banner — it
 * is a UI signal, never a reason to silently drop the run.
 */
export function useRunStream(taskId, { onFinish } = {}) {
  // State carries the id it belongs to, so switching runs shows a clean slate
  // without an effect having to reset it.
  const [state, setState] = useState({ id: null, progress: null, error: "", stalled: false });

  const sseRef = useRef(null);
  const pollRef = useRef(null);
  const stallRef = useRef(null);
  const finishRef = useRef(null);

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  const teardown = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (stallRef.current) clearTimeout(stallRef.current);
    stallRef.current = null;
  }, []);

  const armStallTimer = useCallback((id) => {
    if (stallRef.current) clearTimeout(stallRef.current);
    stallRef.current = setTimeout(
      () => setState((s) => (s.id === id ? { ...s, stalled: true } : s)),
      STALL_MS,
    );
  }, []);

  const poll = useCallback(
    async (id) => {
      try {
        const data = await api.progress(id);
        setState({ id, progress: data, error: "", stalled: false });
        armStallTimer(id);
        if (TERMINAL.has(data.status)) {
          teardown();
          finishRef.current?.(data.status, id);
        }
      } catch (err) {
        if (err?.status === 404) {
          teardown();
          setState({ id, progress: null, error: "This run no longer exists.", stalled: false });
        } else {
          setState((s) => ({ ...s, id, error: err.message, stalled: true }));
        }
      }
    },
    [armStallTimer, teardown],
  );

  const startPolling = useCallback(
    (id) => {
      if (pollRef.current) clearInterval(pollRef.current);
      poll(id);
      pollRef.current = setInterval(() => poll(id), POLL_MS);
    },
    [poll],
  );

  const reconnect = useCallback(() => {
    if (!taskId) return;
    teardown();
    startPolling(taskId);
  }, [taskId, teardown, startPolling]);

  useEffect(() => {
    if (!taskId) {
      teardown();
      return undefined;
    }

    // Seed from the polling endpoint so a reload mid-run paints immediately,
    // even before the stream connects.
    poll(taskId);

    let es;
    try {
      es = new EventSource(api.streamUrl(taskId));
    } catch {
      startPolling(taskId);
      return () => teardown();
    }
    sseRef.current = es;
    armStallTimer(taskId);

    es.onmessage = (event) => {
      armStallTimer(taskId);
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        // A malformed frame must not kill the stream; the next one may be fine.
        return;
      }

      setState((s) => {
        const prev = s.id === taskId ? s.progress : null;
        if (payload.type === "snapshot") {
          return { id: taskId, progress: payload.data, error: "", stalled: false };
        }
        if (payload.type === "progress") {
          return {
            id: taskId,
            error: "",
            stalled: false,
            progress: {
              ...(prev ?? {}),
              status: payload.status,
              stages: payload.stages?.length ? payload.stages : prev?.stages ?? [],
              totals: payload.totals ?? prev?.totals,
              logs: [...(prev?.logs ?? []), payload.entry],
            },
          };
        }
        return { ...s, id: taskId, stalled: false };
      });

      if (payload.type === "report_ready" || TERMINAL.has(payload.status)) {
        const status = payload.status ?? "success";
        teardown();
        finishRef.current?.(status, taskId);
      }
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      startPolling(taskId);
    };

    return () => teardown();
  }, [taskId, poll, startPolling, teardown, armStallTimer]);

  useEffect(() => teardown, [teardown]);

  const current = state.id === taskId ? state : { progress: null, error: "", stalled: false };

  return {
    progress: current.progress,
    error: current.error,
    stalled: current.stalled,
    reconnect,
    refresh: () => taskId && poll(taskId),
  };
}
