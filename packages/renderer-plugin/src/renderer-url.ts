export function isCodexChatRenderer(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "app:" || url.hostname !== "-" || url.port || url.username || url.password || url.hash ||
        !["/index.html", "/detached-window.html"].includes(url.pathname)) return false;
    if (!url.search) return true;
    if ([...url.searchParams.keys()].length !== 1 || !url.searchParams.has("initialRoute")) return false;
    const route = url.searchParams.get("initialRoute");
    if (!route?.startsWith("/") || route.startsWith("//") || route.includes("\\")) return false;
    return route.split(/[?#]/)[0] === (url.pathname === "/index.html" ? "/" : "/detached-window");
  } catch { return false; }
}
