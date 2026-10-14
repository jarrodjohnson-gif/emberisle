import type { ButtonHTMLAttributes, Ref, SyntheticEvent } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/sound";

// The chip look (docs/design/direction.md, ui/chip.tsx): paper, 1 px outline, shadow, 14 px corners; primary is the filled yes.
const VARIANT = {
  default: "border border-outline bg-paper text-ink shadow-chip active:bg-paper-2 active:shadow-[0_2px_0_rgb(34_49_47/0.18)]",
  primary: "border border-outline bg-yes text-yes-text shadow-chip active:shadow-[0_2px_0_rgb(34_49_47/0.18)]",
  secondary: "border border-outline bg-paper text-ink shadow-chip active:bg-paper-2 active:shadow-[0_2px_0_rgb(34_49_47/0.18)]",
  sea: "border border-outline bg-yes text-yes-text shadow-chip active:shadow-[0_2px_0_rgb(34_49_47/0.18)]",
  accent: "border border-outline bg-paper text-no shadow-chip active:bg-paper-2 active:shadow-[0_2px_0_rgb(34_49_47/0.18)]",
  outline: "border border-outline bg-paper text-ink shadow-chip active:bg-paper-2 active:shadow-[0_2px_0_rgb(34_49_47/0.18)]",
  ghost: "bg-transparent text-ink hover:bg-ink/5",
} as const;

const SIZE = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "size-9 p-0",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  // Close and Cancel press with ui_back instead of ui_click.
  back?: boolean;
  // For a button that plays its own sound.
  silent?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

// Pressed: the fill dips to paper-2, the shadow collapses to its 2 px line and the chip drops 1 px, over 80 ms.
export function Button({ variant = "default", size = "default", className, type = "button", back, silent, onPointerDown, onKeyDown, ...props }: ButtonProps) {
  // A disabled or aria-disabled button (an unaffordable build) refuses the press, so it stays quiet.
  const press = (e: SyntheticEvent<HTMLButtonElement>) => {
    const b = e.currentTarget;
    if (!silent && !b.disabled && b.getAttribute("aria-disabled") !== "true") play(back ? "ui_back" : "ui_click");
  };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[14px] font-bold transition-[transform,background-color,box-shadow] duration-(--duration-press) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink active:translate-y-px disabled:pointer-events-none disabled:border-outline/50 disabled:bg-paper-2 disabled:text-ink-2 disabled:shadow-none",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        press(e);
      }}
      // Enter and Space press without a pointer.
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) press(e);
      }}
      {...props}
    />
  );
}
