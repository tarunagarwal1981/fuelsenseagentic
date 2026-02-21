import * as React from "react"

import { cn } from "@/lib/utils"

const cardVariants = {
  default: "bg-card border border-border rounded-xl shadow-sm",
  elevated: "bg-card border border-border rounded-xl shadow-md",
  "accent-teal": "bg-card border border-border border-l-4 border-l-teal-500 rounded-xl shadow-sm",
  "accent-orange": "bg-card border border-border border-l-4 border-l-orange-500 rounded-xl shadow-sm",
  warning: "bg-card border border-status-warning rounded-xl shadow-sm",
  danger: "bg-card border border-status-error rounded-xl shadow-sm",
  ghost: "bg-grey-01 border-0 rounded-xl shadow-none",
} as const

type CardVariant = keyof typeof cardVariants

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: CardVariant }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "text-card-foreground flex flex-col gap-6 py-6",
        cardVariants[variant],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-icon"
      className={cn(
        "w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-teal-500",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-poppins font-semibold text-xl text-foreground", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm font-sans", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-6 border-t border-border bg-grey-01 [.border-t]:pt-6",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardIcon,
  cardVariants,
}
