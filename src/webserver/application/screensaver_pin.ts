// Keep clearing the destination PIN on older firmware when restoring a backup.
export async function clearScreensaverPinForRestore(request: typeof fetch): Promise<void> {
  const options: RequestInit = { credentials: "include", cache: "no-store" };
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await request("/api/v1/capabilities", options);
    if ((response.status === 404 || response.status === 503) && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }
    if (response.status === 404) return;
    if (!response.ok) throw new Error("Could not read PIN support. Check the connection and try again.");
    const capabilities = await response.json();
    if (capabilities?.screensaver_pin?.version !== 1) return;

    const endpoint = "/api/v1/screensaver-pin";
    const current = await request(endpoint, options);
    if (current.status === 404) return;
    await checkPinResponse(current);
    const cleared = await request(endpoint, {
      ...options,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false, pin: "" }),
    });
    await checkPinResponse(cleared);
    return;
  }
}

async function checkPinResponse(response: Response): Promise<void> {
  if (!response.ok) throw new Error("Could not save or read PIN settings. Check the connection and try again.");
  const info = await response.json();
  if (typeof info?.enabled !== "boolean" || typeof info?.has_pin !== "boolean") {
    throw new Error("Invalid PIN settings response.");
  }
}
