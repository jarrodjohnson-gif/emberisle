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

// #773 (docs/design/goods-cards-v1): a fleece cloud in the card's paper (--fleece; unfilled where none is set), a solid head
// with an ear, two legs and a pin of an eye.
export function WoolSymbol(props: Props) {
  const fleece = { fill: "var(--fleece, none)" };
  return <svg {...frame} {...props}><path d="M8.6 17.6v3.6M14.4 17.6v3.6" strokeWidth="2"/><path d="M6 17.6C3.1 17.6 2.3 13.9 4.5 12.7 3.4 10.4 5.9 8.2 8 9.3 8.6 6.5 12.5 6.2 13.5 8.6 15.9 7.4 18.8 9.5 17.9 12 20.3 13.2 19.6 16.9 16.9 17.6Z" style={fleece} strokeWidth="1.6"/><ellipse cx="18.9" cy="12.4" rx="3.3" ry="2.35" transform="rotate(-12 18.9 12.4)" fill="currentColor" stroke="none"/><path d="M16.1 10.8c-.4-1.3.3-2.2 1.6-2.2.4 1 0 2-1.6 2.2Z" fill="currentColor" stroke="none"/><circle cx="20.1" cy="11.8" r=".65" style={fleece} stroke="none"/></svg>;
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
