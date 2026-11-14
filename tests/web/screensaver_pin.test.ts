import { clearScreensaverPinForRestore } from "../../src/webserver/application/screensaver_pin";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runScreensaverPinTests(): Promise<void> {
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => { queueMicrotask(callback); return 0; }) as typeof setTimeout;
  try {
    const cases = [
      { statuses: [200], supported: false, reads: 0, writes: 0 },
      { statuses: [404, 503, 200], supported: true, reads: 1, writes: 1 },
      { statuses: [200], supported: true, readStatus: 404, reads: 1, writes: 0 },
      { statuses: [200], supported: true, writeStatus: 500, reads: 1, writes: 1, fails: true },
      { statuses: [404, 404, 404, 404], reads: 0, writes: 0 },
      { statuses: [503, 503, 503, 503], reads: 0, writes: 0, fails: true },
    ];
    for (const testCase of cases) {
      let attempts = 0, reads = 0, writes = 0;
      const request = (async (url: string, options: RequestInit) => {
        assert(options.credentials === "include" && options.cache === "no-store", "authenticated uncached requests");
        if (url === "/api/v1/capabilities") {
          const status = testCase.statuses[attempts++];
          assert(status !== undefined, "capability discovery stays within its retry limit");
          return status === 200 ? Response.json({ screensaver_pin: testCase.supported ? { version: 1 } : undefined })
            : new Response("Not ready", { status });
        }
        assert(url === "/api/v1/screensaver-pin", "use the legacy device-local PIN API");
        if (options.method === "POST") {
          writes++;
          const settings = JSON.parse(String(options.body));
          assert(settings.enabled === false && settings.pin === "", "restore clears the old PIN and disables protection");
          if (testCase.writeStatus) return new Response("Failed", { status: testCase.writeStatus });
          return Response.json({ enabled: false, has_pin: false });
        }
        reads++;
        if (testCase.readStatus) return new Response("Not found", { status: testCase.readStatus });
        return Response.json({ enabled: true, has_pin: true });
      }) as typeof fetch;
      let failed = false;
      try { await clearScreensaverPinForRestore(request); } catch (error) {
        if (!(error instanceof Error) || !/^Could not (read PIN support|save or read PIN settings)/.test(error.message)) throw error;
        failed = true;
      }
      assert(attempts === testCase.statuses.length, "startup errors use bounded retries");
      assert(reads === testCase.reads && writes === testCase.writes, "restore uses the PIN API only on supporting firmware");
      assert(failed === !!testCase.fails, "persistent read or write failures remain visible");
    }
  } finally { globalThis.setTimeout = originalTimeout; }
}
