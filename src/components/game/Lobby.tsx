import { chunk } from "@/lib/lazy";

const lobby = chunk(() => import("@/components/game/LobbyView"));
void lobby.prefetch();
export const Lobby = lobby.pick(m => m.LobbyView);
