"use client";

import { Anchor, Bell, FileText, Clock, User, LogOut, Sparkles } from "lucide-react";

/**
 * Nav sidebar – Figma frame 9140-67962 (FUEL-SENSE-VXD).
 * Dark vertical sidebar as-is: logo (anchor + teal + sparkles), notification bell with badge,
 * export/share, history, profile, logout. All buttons are placeholders.
 * Uses tokens from Figma MCP get_variable_defs for node 9140-67962.
 */
export function NavSidebarFigma() {
  return (
    <div
      className="w-16 flex-shrink-0 flex flex-col items-center py-4 rounded-l-lg shadow-md"
      style={{
        backgroundColor: "var(--figma-Primary-Dark-Blue)",
      }}
    >
      {/* Logo: anchor (orange) + teal circle/arrow + sparkles */}
      <div className="flex flex-col items-center gap-2 mb-6">
        <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--figma-Buttons-button-container-2)" }}
          >
            <Anchor className="h-5 w-5 relative z-10" style={{ color: "#f97316" }} />
          </div>
          <span className="absolute -top-0.5 -right-0.5 text-white">
            <Sparkles className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>

      {/* Nav: notification (teal bg + badge), document, clock */}
      <nav className="flex flex-col gap-1 flex-1">
        <button
          type="button"
          className="relative flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
          style={{ backgroundColor: "var(--figma-Buttons-button-container-2)" }}
        >
          <Bell className="h-5 w-5" style={{ color: "var(--figma-Grey-01)" }} />
          <span
            className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: "var(--figma-Status-Error)" }}
          >
            3
          </span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0 opacity-80 hover:opacity-100"
          style={{ color: "var(--figma-Grey-01)" }}
        >
          <FileText className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0 opacity-80 hover:opacity-100"
          style={{ color: "var(--figma-Grey-01)" }}
        >
          <Clock className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </nav>

      {/* Bottom: profile circle, logout */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2"
          style={{
            borderColor: "var(--figma-Grey-04)",
            backgroundColor: "var(--figma-Grey-04)",
          }}
        >
          <User className="h-5 w-5" style={{ color: "var(--figma-Text-Secondary)" }} />
        </div>
        <button
          type="button"
          className="p-2 rounded-lg opacity-80 hover:opacity-100"
          style={{ color: "var(--figma-Grey-01)" }}
          title="Log out"
        >
          <LogOut className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
