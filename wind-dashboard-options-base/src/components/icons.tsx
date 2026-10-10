import type { ReactNode } from "react";
function Icon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export function PanelLeftOpen({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16m4-12 4 4-4 4" />
    </Icon>
  );
}
export function PanelLeftClose({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16m8-12-4 4 4 4" />
    </Icon>
  );
}
export function ChartNoAxesCombined({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 4v17h18M5 7l4 7 5 2 7 1" />
    </Icon>
  );
}
export function GitBranch({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="4" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 6v6H5v5m7-5h7v5" />
    </Icon>
  );
}
export function Grid2X2({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M12 3v18M3 12h18" />
    </Icon>
  );
}
export function Split({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 21V12L5 4m7 8 7-8M3 8V3h5m8 0h5v5" />
    </Icon>
  );
}
export function ArrowLeft({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m10 5-7 7 7 7M3 12h18" />
    </Icon>
  );
}
export function Maximize({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
    </Icon>
  );
}
export function Minimize({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5" />
    </Icon>
  );
}
export function Info({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v.01" />
    </Icon>
  );
}
export function ChevronLeft({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m15 5-7 7 7 7" />
    </Icon>
  );
}
export function ChevronRight({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}
