"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Search, Calendar, Ship, Cpu } from "lucide-react";
import type { AlertItem } from "@/lib/types/alerts";

/**
 * Left panel: Alerts – Figma frame 9140-64961 (FUEL-SENSE-VXD-2).
 * Real alerts from alerts module (e.g. hull POOR); design as-is.
 */

const HULL_AGENT = { name: "Hull", color: "#A78BFA" };

function AlertCard({
  alert,
  isSelected,
}: {
  alert: AlertItem;
  isSelected?: boolean;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderWidth: isSelected ? 2 : 1,
        borderStyle: isSelected ? "dashed" : "solid",
        borderColor: isSelected ? "var(--figma-Alert-selected-border)" : "var(--figma-Surface-Card-stroke)",
        backgroundColor: isSelected ? "var(--figma-Alert-selected-bg)" : "var(--figma-Grey-02)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(34, 197, 94, 0.15)" }}
          >
            <Ship className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
          </div>
          <span
            className="text-xs font-bold truncate"
            style={{ color: "var(--figma-Text-Title)" }}
            title={alert.vesselName}
          >
            {alert.vesselName}
          </span>
        </div>
        <span className="text-xs shrink-0" style={{ color: "var(--figma-Text-Subtitles)" }} title={alert.date}>
          {alert.date}
        </span>
      </div>
      <p className="text-xs mt-2 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--figma-Text-Subtitles)" }}>
        <span>Agent:</span>
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3 w-3" style={{ color: HULL_AGENT.color }} />
          {HULL_AGENT.name}
        </span>
      </p>
      <p className="text-xs mt-1 leading-snug" style={{ color: "var(--figma-Text-Subtitles)" }}>
        {alert.metric != null ? (
          <>
            {alert.message}{" "}
            <span className="font-bold" style={{ color: "var(--figma-Status-Error)" }}>
              {Number(alert.metric).toFixed(1)}%
            </span>
          </>
        ) : (
          alert.message
        )}
      </p>
    </div>
  );
}

function filterAlertsByVessel(alerts: AlertItem[], searchQuery: string): AlertItem[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return alerts;
  return alerts.filter((a) => a.vesselName.toLowerCase().includes(q));
}

export interface AlertsPanelFigmaProps {
  onRequestHullAnalysis?: (vesselName: string) => void;
}

export function AlertsPanelFigma(props: AlertsPanelFigmaProps) {
  const { onRequestHullAnalysis } = props;
  const [activeTab, setActiveTab] = React.useState<"active" | "monitoring" | "wip">("active");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAlerts = React.useMemo(
    () => filterAlertsByVessel(alerts, searchQuery),
    [alerts, searchQuery]
  );

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/hull");
      const data = await res.json();
      const list = Array.isArray(data?.alerts) ? data.alerts : [];
      setAlerts((prev) => {
        const byId = new Map(prev.map((a) => [a.id, a]));
        for (const a of list) byId.set(a.id, a);
        return Array.from(byId.values());
      });
    } catch (err) {
      console.warn("[AlertsPanel] Hull fetch failed:", err);
      setAlerts((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const activeCount = alerts.length;
  const displayedCount = filteredAlerts.length;

  return (
    <div
      className="w-[25%] flex-shrink-0 min-w-0 flex flex-col overflow-hidden ml-2 rounded-lg border"
      style={{
        backgroundColor: "var(--figma-Grey-01)",
        borderColor: "var(--figma-Surface-Card-stroke)",
      }}
    >
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border px-3 py-2"
            style={{
              borderColor: "var(--figma-Surface-Grey-BG-1-Stroke)",
              backgroundColor: "var(--figma-Grey-03)",
            }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: "var(--figma-Text-Icon)" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Vessel Name, Alert type, & date"
              className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder-[var(--figma-Text-Subtitles)]"
              style={{ color: "var(--figma-Text-Title)" }}
              aria-label="Search alerts by vessel name"
            />
          </div>
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
            style={{
              backgroundColor: "var(--figma-Primary-Dark-Blue)",
              color: "var(--figma-Grey-01)",
            }}
            aria-label="Date filter"
          >
            <Calendar className="h-5 w-5" />
          </button>
        </div>

        <div
          className="flex gap-6 mt-3 border-b"
          style={{ borderColor: "var(--figma-Surface-Grey-BG-1-Stroke)" }}
        >
          <button
            type="button"
            className="pb-2 pt-1 -mb-px border-b-2 text-sm font-bold transition-colors"
            style={{
              color: "var(--figma-Text-Title)",
              borderColor: activeTab === "active" ? "var(--figma-Status-Error)" : "transparent",
            }}
            onClick={() => setActiveTab("active")}
          >
            Active <span className="font-normal" style={{ color: "var(--figma-Text-Subtitles)" }}>({searchQuery.trim() ? displayedCount : activeCount})</span>
          </button>
          <button
            type="button"
            className="pb-2 pt-1 -mb-px border-b-2 border-transparent text-sm font-normal transition-colors"
            style={{ color: activeTab === "monitoring" ? "var(--figma-Text-Title)" : "var(--figma-Text-Subtitles)" }}
            onClick={() => setActiveTab("monitoring")}
          >
            Monitoring (0)
          </button>
          <button
            type="button"
            className="pb-2 pt-1 -mb-px border-b-2 border-transparent text-sm font-normal transition-colors"
            style={{ color: activeTab === "wip" ? "var(--figma-Text-Title)" : "var(--figma-Text-Subtitles)" }}
            onClick={() => setActiveTab("wip")}
          >
            WIP (0)
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-2">
        {loading && alerts.length === 0 ? (
          <p className="text-xs py-4" style={{ color: "var(--figma-Text-Subtitles)" }}>
            Loading hull alerts…
          </p>
        ) : activeTab === "active" ? (
          filteredAlerts.length === 0 ? (
            <p className="text-xs py-4" style={{ color: "var(--figma-Text-Subtitles)" }}>
              {alerts.length === 0 ? "No active alerts" : "No alerts match your search"}
            </p>
          ) : (
            filteredAlerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className="w-full text-left"
                onClick={() => {
                  setSelectedId((id) => (id === alert.id ? null : alert.id));
                  if (alert.vesselName && alert.source === "hull") {
                    onRequestHullAnalysis?.(alert.vesselName);
                  }
                }}
              >
                <AlertCard alert={alert} isSelected={selectedId === alert.id} />
              </button>
            ))
          )
        ) : (
          <p className="text-xs py-4" style={{ color: "var(--figma-Text-Subtitles)" }}>
            No alerts in this tab
          </p>
        )}
      </div>
    </div>
  );
}
