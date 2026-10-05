import { useEffect } from "react";

// SheetsFailed's twin for the fortune tray: the next press of Fortunes mounts it again and tries the network again.
export function TrayFailed({ close }: { close: () => void }) {
  useEffect(close, [close]);
  return null;
}
