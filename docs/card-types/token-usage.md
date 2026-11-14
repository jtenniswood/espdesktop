# Token Usage

Show a weekly or monthly allowance on a paired display. Each card shows one service, the percentage remaining, and the time until its next reset. Add a card for each service to see multiple services.

1. Pair the display with the EspDesktop Mac app.
2. For ChatGPT (Codex), install the official Codex CLI and sign in with ChatGPT.
3. For Claude, install Claude Code and sign in with your Claude subscription. Your weekly plan limit must be visible in Claude Code’s `/usage` panel. API-key sessions do not include a subscription allowance.
4. For OpenCode Go, run `/connect` in OpenCode, select **OpenCode Go**, and enter your Go API key. The Mac uses your saved OpenCode login to read the account’s current Go limits directly from OpenCode. Select **Weekly** or **Monthly** under **Time period** on the card. Existing cards use Weekly. The card shows percentage remaining and the reset countdown for the chosen limit. The key stays on the Mac and is sent only to OpenCode’s usage endpoint.
5. In the panel’s web editor, add **Token Usage**, select a service, and apply the layout.

The Mac app automatically refreshes usage in the background every few minutes when a compatible display is connected. The provider apps can be closed. EspDesktop must be running on your Mac. The panel hides the reset countdown when the reading is stale or the reset time is unknown. It shows **Unavailable** until it has a reading for the selected limit.

New ChatGPT and Claude app shortcut pages place the matching Token Usage card just after Back. To add it to an existing page, open the app card’s settings and save. If the layout has no room before its shortcuts, you can add or move the card in the subpage editor.
