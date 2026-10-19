import type { ComponentType, SVGProps } from "react";
import type { Resource } from "@/lib/game/types";

type Props = SVGProps<SVGSVGElement>;
const frame = { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function TimberSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="m9 2-4 6h2l-4 6h3l-3 5h12l-3-5h3l-4-6h2L9 2Z" fill="currentColor" stroke="none"/><path d="M9 18v4m9-17-3 5h2l-3 5h8l-3-5h2l-3-5Z"/><path d="M18 15v5"/></svg>;
}

export function ClaySymbol(props: Props) {
  return <svg {...frame} {...props}><rect x="7" y="3" width="10" height="6" rx=".7" fill="currentColor" stroke="none"/><rect x="1" y="11" width="10" height="7" rx=".7" fill="currentColor" stroke="none"/><rect x="13" y="11" width="10" height="7" rx=".7" fill="currentColor" stroke="none"/></svg>;
}

export function WoolSymbol(props: Props) {
  return (
    <svg {...frame} {...props}>
      <path d="M8.5 6.5c-1.8 0-3.2 1.2-3.5 2.8C3.6 9.8 3 11 3 12.5c0 2 1.6 3.5 3.5 3.5h10c1.7 0 3-1.2 3.4-2.8.6-.6 1.1-1.5 1.1-2.5 0-1.8-1.4-3.2-3.2-3.2-.3 0-.7.1-1 .2C16 6.6 14.7 6 13 6c-1 0-1.9.3-2.6.9-.5-.3-1.2-.4-1.9-.4Z" />
      <path d="M14.2 9c0-.8.7-1.5 1.6-1.5.7 0 1.4.5 1.7 1.2.6.2 1 .7 1 1.4 0 1-.7 1.8-1.7 1.8h-1.2c-.8 0-1.4-.6-1.4-1.4V9Z" fill="currentColor" stroke="none" />
      <path d="M14.2 9.3c-.8.2-1.3.7-1.3 1.3" />
      <path d="M7 16v4m7-4v4" />
    </svg>
  );
}

export function GrainSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="M7 22 17 2"/><path d="M13 7c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Z" fill="currentColor" stroke="none"/></svg>;
}

export function OreSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="m2 20 7-14 7 14H2Zm11 0-3-6 5-12 8 18H13Z" fill="currentColor" stroke="none"/></svg>;
}

export const RESOURCE_ICON: Record<Resource, ComponentType<Props>> = {
  timber: TimberSymbol,
  clay: ClaySymbol,
  wool: WoolSymbol,
  grain: GrainSymbol,
  ore: OreSymbol,
};
