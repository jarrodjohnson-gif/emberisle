import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

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
  ref?: Ref<HTMLButtonElement>;
}

// Build bible 3.4: press scales to 0.97 for 80 ms. Corners are 12 px (docs/design/polish.md, Jarrod 2026-10-04).
export function Button({ variant = "default", size = "default", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control font-medium transition-[transform,filter,background-color] duration-(--duration-press) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-ink active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
