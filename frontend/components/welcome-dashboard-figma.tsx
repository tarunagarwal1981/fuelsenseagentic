"use client";

import { ChevronRight, Ship, Activity, Fuel, AlertTriangle, CheckCircle } from "lucide-react";

/**
 * Playground welcome / fleet insights – Figma frame 9140-65000 (FUEL-SENSE-VXD).
 * Shown in the right panel when there are no messages (empty state).
 * Uses Figma design tokens; layout and copy from get_design_context / screenshot.
 */
const INSIGHT_CARDS = [
  { id: "cp-risk", title: "CP Risk", metric: "30%", unit: "Vessels", color: "var(--teal-500)", bg: "var(--teal-50)", Icon: Activity },
  { id: "perf-drift", title: "Performance Drift", metric: "10%", unit: "Voyages", color: "#ea580c", bg: "rgba(234, 88, 12, 0.12)", Icon: Ship },
  { id: "low-rob", title: "Low ROB", metric: "15%", unit: "of vessels", color: "#0ea5e9", bg: "rgba(14, 165, 233, 0.12)", Icon: Fuel },
  { id: "fuel-anomalies", title: "Fuel Anomalies", metric: "15%", unit: "Vessels", color: "#219495", bg: "var(--teal-50)", Icon: AlertTriangle },
  { id: "taken-action", title: "Taken Action", metric: "20%", unit: "Vessels", color: "var(--grey-06)", bg: "var(--muted)", Icon: CheckCircle },
] as const;

function InsightCard({
  title,
  metric,
  unit,
  color,
  bg,
  Icon,
}: {
  title: string;
  metric: string;
  unit: string;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border-0 bg-grey-01 p-4 shadow-none hover:opacity-90 transition-opacity flex items-start justify-between gap-3"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: bg }}
        >
          <Icon className="h-5 w-5 shrink-0" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
            {title}
          </p>
          <p className="text-sm font-medium mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {metric} {unit}
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
    </button>
  );
}

export function WelcomeDashboardFigma() {
  return (
    <div
      className="relative flex-1 overflow-y-auto min-h-0 flex flex-col items-center justify-start pt-8 pb-12 px-4"
      style={{
        background: "var(--grey-01)",
        backgroundImage: "radial-gradient(circle at 1px 1px, var(--grey-04) 1px, transparent 0)",
        backgroundSize: "16px 16px",
      }}
    >
      <div className="max-w-2xl w-full flex flex-col items-center">
        {/* Top icon: teal sphere with orange accent (Figma style) */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-4 shadow-md"
          style={{
            background: "linear-gradient(135deg, var(--brand-teal) 0%, #1a7a7b 100%)",
            boxShadow: "0 4px 14px rgba(33, 148, 149, 0.35), 0 0 0 2px rgba(234, 88, 12, 0.2)",
          }}
        >
          <Ship className="h-7 w-7 text-white" />
        </div>

        <h1
          className="text-2xl font-bold text-center mb-3"
          style={{ color: "var(--foreground)" }}
        >
          Good morning, John!
        </h1>

        <p
          className="text-center text-sm max-w-lg mb-8 leading-relaxed"
          style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}
        >
          I've analyzed your fleet and found a few <strong style={{ color: "var(--foreground)" }}>important updates</strong> worth
          reviewing today. You can <strong style={{ color: "var(--foreground)" }}>open any card below</strong> to dive into a
          specific insight, or choose "Show Summary" if you'd like to see everything together.
        </p>

        {/* Cards: 3 top row, 2 bottom row (centered) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full mb-8">
          {INSIGHT_CARDS.slice(0, 3).map((card) => (
            <InsightCard key={card.id} {...card} />
          ))}
          <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap justify-center gap-4">
            {INSIGHT_CARDS.slice(3, 5).map((card) => (
              <div key={card.id} className="w-full sm:w-[calc(50%-0.5rem)] lg:max-w-xs">
                <InsightCard {...card} />
              </div>
            ))}
          </div>
        </div>

        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="text-sm font-medium underline hover:opacity-90"
          style={{ color: "var(--brand-teal)" }}
        >
          Show Summary
        </a>
      </div>

      {/* Bottom gradient strip */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
        style={{
          background: "linear-gradient(to right, rgba(251, 191, 36, 0.15), rgba(56, 189, 248, 0.15))",
        }}
      />
    </div>
  );
}
