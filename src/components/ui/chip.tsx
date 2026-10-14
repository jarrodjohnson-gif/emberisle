import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// The one control shape (docs/design/direction.md): a paper chip with a 1 px ink outline and a soft shadow.
// `as` picks the element; a "button" chip is pressable, a "div" chip is a static label.
const BASE =
  "inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-outline bg-paper px-3.5 py-2.5 font-bold text-ink shadow-chip sm:min-h-10";
const PRESS =
  "cursor-pointer transition-[transform,background-color,box-shadow] duration-(--duration-press) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink active:translate-y-px active:bg-paper-2 active:shadow-[0_2px_0_rgb(34_49_47/0.18)]";
const OFF = "pointer-events-none border-outline/50 bg-paper-2 text-ink-2 shadow-none";
const PRIMARY = "bg-yes text-yes-text active:bg-yes";

export interface ChipProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  as?: "button" | "div";
  primary?: boolean;
  disabled?: boolean;
  // Held down, e.g. a toggle that is on: the pressed look.
  pressed?: boolean;
  // The 20 px icon slot, left of the label.
  icon?: ReactNode;
  type?: "button" | "submit" | "reset";
  children?: ReactNode;
}

export function Chip({ as = "button", primary, disabled, pressed, icon, type = "button", className, children, ...props }: ChipProps) {
  const cls = cn(
    BASE,
    as === "button" && PRESS,
    primary && PRIMARY,
    pressed && !primary && "translate-y-px bg-paper-2 shadow-[0_2px_0_rgb(34_49_47/0.18)]",
    disabled && OFF,
    className,
  );
  const body = (
    <>
      {icon && <span className="inline-flex size-5 shrink-0 items-center justify-center">{icon}</span>}
      {children}
    </>
  );
  if (as === "div") {
    return (
      <div className={cls} aria-disabled={disabled || undefined} {...props}>
        {body}
      </div>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled} aria-pressed={pressed} {...props}>
      {body}
    </button>
  );
}

// A chip with the card radius and shadow that holds chips.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-outline bg-paper p-3.5 text-ink shadow-card sm:p-4", className)} {...props} />;
}
