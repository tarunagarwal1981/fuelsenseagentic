"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Search, Calendar, Ship, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/lib/types/alerts";

/**
 * Left panel: Alerts – design system aligned.
 * Severity from metric: critical (≥25), warning (≥15), else info.
 */

const HULL_AGENT = { name: "Hull" };

function getSeverity(alert: AlertItem): 'critical' | 'warning' | 'info' | 'good' {
  const m = alert.metric;
  if (m == null) return 'info';
  if (m >= 25) return 'critical';
  if (m >= 15) return 'warning';
  if (m < 10) return 'good';
  return 'info';
}

function AlertCard({
  alert,
  isSelected,
}: {
  alert: AlertItem;
  isSelected?: boolean;
}) {
  const severity = getSeverity(alert);
  const stripeClass =
    severity === 'critical' ? 'border-l-4 border-status-error' :
    severity === 'warning' ? 'border-l-4 border-status-warning' :
    severity === 'good' ? 'border-l-4 border-status-success' :
    'border-l-4 border-teal-400';
  const badgeVariant =
    severity === 'critical' ? 'critical' :
    severity === 'warning' ? 'warning' :
    severity === 'good' ? 'compliant' : 'info';

  return (
    <div
      className={cn(
        "rounded-xl border border-border p-3",
        stripeClass,
        isSelected ? "border-teal-500 bg-teal-50" : "bg-grey-01"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
            isSelected ? "text-orange-500" : "text-brand-teal"
          )}>
            <Ship className="h-3.5 w-3.5" />
          </div>
          <span
            className={cn(
              "text-xs font-bold truncate",
              isSelected ? "text-teal-600" : "text-foreground"
            )}
            title={alert.vesselName}
          >
            {alert.vesselName}
          </span>
        </div>
        <span className="text-xs shrink-0 text-muted-foreground" title={alert.date}>
          {alert.date}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <Badge variant={badgeVariant} className="text-[10px]">
          {HULL_AGENT.name}
        </Badge>
      </div>
      <p className="text-xs mt-1 leading-snug text-muted-foreground">
        {alert.metric != null ? (
          <>
            {alert.message}{" "}
            <span className="font-bold text-status-error">
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
    <div className="w-[25%] flex-shrink-0 min-w-0 flex flex-col overflow-hidden ml-2 rounded-xl border border-border bg-card">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 focus-within:ring-2 focus-within:ring-orange-300 focus-within:border-orange-400">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Vessel Name, Alert type, & date"
              className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder-muted-foreground text-foreground"
              aria-label="Search alerts by vessel name"
            />
          </div>
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0 bg-brand-navy text-card"
            aria-label="Date filter"
          >
            <Calendar className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-6 mt-3 border-b border-border">
          <button
            type="button"
            className={cn(
              "pb-2 pt-1 -mb-px border-b-2 text-sm font-bold transition-colors",
              activeTab === "active" ? "border-status-error text-foreground" : "border-transparent"
            )}
            onClick={() => setActiveTab("active")}
          >
            Active <span className="font-normal text-muted-foreground">({searchQuery.trim() ? displayedCount : activeCount})</span>
          </button>
          <button
            type="button"
            className={cn(
              "pb-2 pt-1 -mb-px border-b-2 border-transparent text-sm font-normal transition-colors",
              activeTab === "monitoring" ? "text-foreground" : "text-muted-foreground"
            )}
            onClick={() => setActiveTab("monitoring")}
          >
            Monitoring (0)
          </button>
          <button
            type="button"
            className={cn(
              "pb-2 pt-1 -mb-px border-b-2 border-transparent text-sm font-normal transition-colors",
              activeTab === "wip" ? "text-foreground" : "text-muted-foreground"
            )}
            onClick={() => setActiveTab("wip")}
          >
            WIP (0)
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-2">
        {loading && alerts.length === 0 ? (
          <p className="text-xs py-4 text-muted-foreground">
            Loading hull alerts…
          </p>
        ) : activeTab === "active" ? (
          filteredAlerts.length === 0 ? (
            <p className="text-xs py-4 text-muted-foreground">
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
          <p className="text-xs py-4 text-muted-foreground">
            No alerts in this tab
          </p>
        )}
      </div>
    </div>
  );
}
