"use client";

import { Bell, Search, Calendar, Ship } from "lucide-react";

/**
 * Left panel: Alerts – Figma frame 9140-67964 (FUEL-SENSE-VXD).
 * Implemented as-is from Figma with all content, buttons, and list items as placeholders.
 * Uses tokens from Figma MCP get_variable_defs (Surface/Card, Text/Title, Status/Error, etc.).
 */
const ALERT_CARD_PLACEHOLDER = {
  vessel: "MV Blue Ocean",
  date: "Date: 12 Jan",
  alertType: "Hull Condition",
  message: "Fuel consumption abnormal 15.5% above expected range",
};

function AlertCard({ isSelected }: { isSelected?: boolean }) {
  return (
    <div
      className="rounded-xl border p-3 shadow-sm"
      style={{
        borderWidth: isSelected ? 2 : 1,
        borderStyle: isSelected ? "dashed" : "solid",
        borderColor: isSelected ? "var(--figma-Alert-selected-border)" : "var(--figma-Surface-Card-stroke)",
        backgroundColor: isSelected ? "var(--figma-Alert-selected-bg)" : "var(--figma-Surface-Card)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--figma-Surface-Teal-BG-1)" }}
          >
            <Ship className="h-3.5 w-3.5" style={{ color: "var(--figma-Primary-Teal)" }} />
          </div>
          <span
            className="text-xs font-bold truncate"
            style={{ color: "var(--figma-Text-Title)" }}
          >
            {ALERT_CARD_PLACEHOLDER.vessel}
          </span>
        </div>
        <span className="text-xs shrink-0" style={{ color: "var(--figma-Text-Subtitles)" }}>
          {ALERT_CARD_PLACEHOLDER.date}
        </span>
      </div>
      <p className="text-xs mt-1.5" style={{ color: "var(--figma-Text-Subtitles)" }}>
        Alert type: <span className="font-bold" style={{ color: "var(--figma-Text-Title)" }}>{ALERT_CARD_PLACEHOLDER.alertType}</span>
      </p>
      <p className="text-xs mt-1 leading-snug" style={{ color: "var(--figma-Text-Title)" }}>
        Fuel consumption abnormal{" "}
        <span className="font-semibold" style={{ color: "var(--figma-Status-Error)" }}>15.5%</span> above expected range
      </p>
    </div>
  );
}

export function AlertsPanelFigma() {
  return (
    <div
      className="w-[25%] flex-shrink-0 min-w-0 flex flex-col overflow-hidden ml-2 rounded-lg border"
      style={{
        backgroundColor: "var(--figma-Surface-Card)",
        borderColor: "var(--figma-Surface-Card-stroke)",
      }}
    >
      {/* Header: Alerts icon + title, Watch-list button with red badge (placeholder) */}
      <div
        className="shrink-0 px-4 pt-3 pb-2 border-b flex items-center justify-between gap-2"
        style={{ borderColor: "var(--figma-Surface-Card-stroke)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--figma-Surface-Teal-BG-1)" }}
          >
            <Bell className="h-4 w-4" style={{ color: "var(--figma-Primary-Teal)" }} />
          </div>
          <h2 className="text-sm font-bold truncate" style={{ color: "var(--figma-Text-Title)" }}>
            Alerts <span className="font-normal" style={{ color: "var(--figma-Text-Subtitles)" }}>(25)</span>
          </h2>
        </div>
        <button
          type="button"
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm font-medium shrink-0"
          style={{
            borderColor: "var(--figma-Border-Main-Divider)",
            backgroundColor: "var(--figma-Surface-Card)",
            color: "var(--figma-Text-Title)",
          }}
        >
          Watch-list
          <span
            className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-xs font-bold"
            style={{ backgroundColor: "var(--figma-Status-Error)" }}
          >
            3
          </span>
        </button>
      </div>

      {/* Search bar + calendar button (placeholder) */}
      <div className="shrink-0 px-4 pt-2 pb-2">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{
            borderColor: "var(--figma-Border-Main-Divider)",
            backgroundColor: "var(--figma-Grey-03)",
          }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--figma-Text-Icon)" }} />
          <input
            type="text"
            placeholder="Search by Vessel Name, Alert type, & date"
            readOnly
            className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none cursor-default"
            style={{
              color: "var(--figma-Text-Title)",
            }}
          />
          <button
            type="button"
            className="p-1 rounded shrink-0"
            style={{ color: "var(--figma-Text-Icon)" }}
            aria-label="Date filter"
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs: Active (15), Monitoring (5), WIP (5) – placeholder */}
        <div
          className="flex gap-4 mt-2 border-b"
          style={{ borderColor: "var(--figma-Border-Main-Divider)" }}
        >
          <span
            className="text-xs font-bold pb-2 pt-1 -mb-px border-b-2"
            style={{
              color: "var(--figma-Text-Title)",
              borderColor: "var(--figma-Status-Error)",
            }}
          >
            Active <span className="font-normal" style={{ color: "var(--figma-Text-Subtitles)" }}>(15)</span>
          </span>
          <span
            className="text-xs font-normal pb-2 pt-1 -mb-px border-b-2 border-transparent"
            style={{ color: "var(--figma-Tab-Unselected)" }}
          >
            Monitoring (5)
          </span>
          <span
            className="text-xs font-normal pb-2 pt-1 -mb-px border-b-2 border-transparent"
            style={{ color: "var(--figma-Tab-Unselected)" }}
          >
            WIP (5)
          </span>
        </div>
      </div>

      {/* Alert list: 7 placeholder cards (Figma as-is), second card selected */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <AlertCard />
        <AlertCard isSelected />
        <AlertCard />
        <AlertCard />
        <AlertCard />
        <AlertCard />
        <AlertCard />
      </div>
    </div>
  );
}
