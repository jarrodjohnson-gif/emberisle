import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;
const frame = { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function TimberSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="m9 2-4 6h2l-4 6h3l-3 5h12l-3-5h3l-4-6h2L9 2Z" fill="currentColor" stroke="none"/><path d="M9 18v4m9-17-3 5h2l-3 5h8l-3-5h2l-3-5Z"/><path d="M18 15v5"/></svg>;
}

export function ClaySymbol(props: Props) {
  return <svg {...frame} {...props}><rect x="7" y="3" width="10" height="6" rx=".7" fill="currentColor" stroke="none"/><rect x="1" y="11" width="10" height="7" rx=".7" fill="currentColor" stroke="none"/><rect x="13" y="11" width="10" height="7" rx=".7" fill="currentColor" stroke="none"/></svg>;
}

export function WoolSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="M7 5c-1-3 4-4 5-1 2-3 6-1 5 2 4-1 6 4 2 6 3 3 0 7-3 5 0 4-5 5-6 1-3 3-7 0-5-3-4 0-5-5-1-6-2-2 0-5 3-4Z"/><path d="m8 17-1 4m9-4 1 4"/></svg>;
}

export function GrainSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="M7 22 17 2"/><path d="M13 7c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Z" fill="currentColor" stroke="none"/></svg>;
}

export function OreSymbol(props: Props) {
  return <svg {...frame} {...props}><path d="m2 20 7-14 7 14H2Zm11 0-3-6 5-12 8 18H13Z" fill="currentColor" stroke="none"/></svg>;
}
