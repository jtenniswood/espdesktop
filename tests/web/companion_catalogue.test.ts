import { companionURLCardTargetValues, createCompanionCatalogue } from "../../src/webserver/api/companion_catalogue";

export async function runCompanionCatalogueTests(): Promise<void> {
  const configuredURLs = companionURLCardTargetValues(
    [{ sensor: "url." + encodeURIComponent("https://example.com/docs?q=1#intro") }],
    { 2: { buttons: [{ sensor: "url." + encodeURIComponent("https://example.net/" ) }] } },
  );
  if (configuredURLs.join("|") !== "https://example.com/docs?q=1#intro|https://example.net/") {
    throw new Error("Initial and nested URL cards must be discovered for active-tab focus registration");
  }
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/companion/definitions") {
      return new Response(JSON.stringify({ definitions: [
        { kind: "application", definition: { appId: "org.example.Editor" } },
        { kind: "webapp", definition: { id: "example" } },
        { kind: "webapp", definition: null },
        { kind: "other", definition: { id: "ignored" } },
      ] }), { status: 200 });
    }
    if (url === "/companion/focus-targets") return new Response('{"saved":true}', { status: 200 });
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  const catalogue = createCompanionCatalogue(fetchImpl);
  const definitions = await catalogue.loadDefinitions();
  if (definitions.applications.length !== 1 || definitions.webApplications.length !== 1 ||
      definitions.webApplications[0]?.id !== "example") {
    throw new Error("Remote Companion templates must retain only recognized native and Web App definitions");
  }
  await catalogue.saveURLFocusTargets(["https://example.com/docs?q=1#intro", "invalid"]);
  const request = calls.find((call) => call.url === "/companion/focus-targets");
  if (request?.init?.method !== "POST" || typeof request.init.body !== "string") {
    throw new Error("Configured URL cards must be posted to the paired display");
  }
  const payload = JSON.parse(request.init.body) as { targets: Array<{ id: string; url: string }> };
  if (payload.targets.length !== 1 || !/^urlcard\.[0-9a-f]{16}$/.test(payload.targets[0]?.id || "") ||
      payload.targets[0]?.url !== "https://example.com/docs?q=1#intro") {
    throw new Error("Only valid URL cards should be registered using stable configured URL IDs");
  }
}
