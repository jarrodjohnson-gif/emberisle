import { Component, type ErrorInfo, type ReactNode } from "react";
import { savedSeat, useGame } from "@/lib/game/store";

type Props = { children: ReactNode; code: string; synced: number };

class RecoveryBoundary extends Component<Props> {
  state = { failed: false, code: this.props.code, pending: false, message: "" };
  timer?: number;

  static getDerivedStateFromProps(props: Props, state: RecoveryBoundary["state"]) {
    return state.failed ? null : { code: props.code };
  }

  static getDerivedStateFromError() {
    return { failed: true, pending: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (!this.state.pending) window.clearTimeout(this.timer);
    // A welcome alone is not enough: remount only after the rejoined game state arrives.
    if (this.state.pending && this.props.code === this.state.code && previous.synced !== this.props.synced)
      this.setState({ failed: false, pending: false, message: "" });
  }

  componentWillUnmount() {
    window.clearTimeout(this.timer);
  }

  rejoin = () => {
    if (this.state.pending) return;
    if (savedSeat()?.code !== this.state.code) {
      this.setState({ message: "This browser no longer has the saved seat for this table." });
      return;
    }
    this.setState({ pending: true, message: "" });
    // The host may be unreachable. Keep another explicit attempt available without an automatic retry loop.
    this.timer = window.setTimeout(() => this.setState({ pending: false, message: "Could not reach your table. Try Rejoin again." }), 15_000);
    try {
      if (useGame.getState().rejoinTable()) return;
    } catch {
      // A broken client connection must not take down the independent recovery surface.
    }
    this.setState({ pending: false, message: "Your saved seat is unavailable." });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const { code, pending, message } = this.state;
    return (
      <div role="alert" data-testid="table-recovery" className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-bg p-5">
        <div className="w-full max-w-sm rounded-sheet bg-surface p-6 text-fg">
          <h1 className="font-display text-2xl">Your table hit a snag</h1>
          {code && <p className="mt-3">Room <strong data-testid="recovery-code">{code}</strong></p>}
          <p className="mt-3 text-sm text-muted">Your game stays at the table.</p>
          <button type="button" disabled={pending} onClick={code ? this.rejoin : () => location.reload()} className="mt-5 min-h-11 w-full rounded-control bg-fg px-4 font-medium text-bg disabled:opacity-50">
            {pending ? "Rejoining…" : code ? "Rejoin" : "Reload"}
          </button>
          {message && <p className="mt-3 text-sm">{message}</p>}
        </div>
      </div>
    );
  }
}

export function TableRecoveryBoundary({ children }: { children: ReactNode }) {
  const code = useGame((s) => s.mode === "online" && !s.spectator ? s.code : "");
  const synced = useGame((s) => s.synced);
  return <RecoveryBoundary code={code} synced={synced}>{children}</RecoveryBoundary>;
}
