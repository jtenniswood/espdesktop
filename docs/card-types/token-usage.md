# Token Usage

Show your weekly ChatGPT (Codex), Claude, or OpenCode Go allowance on a paired display. Each card shows one service with its icon, the percentage remaining, and the time until its next reset. Add a card for each service to see multiple services.

1. Pair the display with the EspDesktop Mac app.
2. Open the Mac app’s **Settings** and find **Token Usage** on the connection page.
3. For ChatGPT (Codex), install the official Codex CLI, sign in with ChatGPT, and turn on sharing.
4. For Claude, install Claude Code, sign in with your Claude subscription, and turn on sharing. Your weekly plan limit must be visible in Claude Code’s `/usage` panel. API-key sessions do not include a subscription allowance.
5. For OpenCode Go, run `/connect` in OpenCode, select **OpenCode Go**, and enter your Go API key. Turn on OpenCode Go sharing in EspDesktop. The Mac uses your saved OpenCode login to read the weekly allowance. The key stays on the Mac and is sent only to OpenCode’s usage endpoint.
6. In the panel’s web editor, add **Token Usage**, select a service, and apply the layout.

The Mac app refreshes enabled services in the background every few minutes while sharing is enabled, including when the provider apps are closed. EspDesktop must be running on your Mac. The panel hides the reset countdown when the reading is stale or the reset time is unknown. It shows **Unavailable** until it has a weekly reading.
