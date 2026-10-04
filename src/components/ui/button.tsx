import type { ButtonHTMLAttributes, Ref, SyntheticEvent } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/sound";

const VARIANT = {
  default: "bg-fg text-bg hover:bg-fg/90",
  primary: "bg-fg text-bg hover:bg-fg/90",
  secondary: "border border-border bg-bg text-fg hover:brightness-105",
  sea: "bg-sea-ink text-white hover:brightness-90",
  accent: "bg-accent-ink text-white hover:brightness-90",
  outline: "border border-fg/30 bg-transparent text-fg hover:bg-fg/5",
  ghost: "bg-transparent text-fg hover:bg-fg/5",
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

// Build bible 3.4: 8 px corners, press scales to 0.97 for 80 ms.
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
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[8px] font-medium transition-[transform,filter,background-color] duration-[80ms] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
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
