import { companionFocusRegistrationValues, createCompanionCatalogue } from "../../src/webserver/api/companion_catalogue";

export async function runCompanionCatalogueTests(): Promise<void> {
  const configuredFocus = companionFocusRegistrationValues(
    [
      { sensor: "url." + encodeURIComponent("https://example.com/docs?q=1#intro") },
      { entity: "webapp.google-docs" },
    ],
    { 2: { buttons: [{ sensor: "url." + encodeURIComponent("https://example.net/" ) }, { entity: "webapp.notion" }] } },
  );
  if (configuredFocus.urls.join("|") !== "https://example.com/docs?q=1#intro|https://example.net/" ||
      configuredFocus.webAppIDs.join("|") !== "google-docs|notion") {
    throw new Error("Initial and nested URL and Web App cards must be discovered for active-tab focus registration");
  }
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let definitionId = "example";
  let emptyDefinitions = false;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/companion/definitions") {
      return new Response(JSON.stringify({ definitions: emptyDefinitions ? [] : [
        { kind: "application", definition: { appId: "org.example.Editor" } },
        { kind: "webapp", definition: { id: definitionId } },
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
  definitionId = "updated";
  const refreshed = await catalogue.loadDefinitions(true);
  if (refreshed.webApplications[0]?.id !== "updated") throw new Error("A requested refresh must replace cached Companion definitions");
  emptyDefinitions = true;
  let rejectedEmpty = false;
  try { await catalogue.loadDefinitions(true); } catch { rejectedEmpty = true; }
  if (!rejectedEmpty || (await catalogue.loadDefinitions()).webApplications[0]?.id !== "updated") {
    throw new Error("An empty offline response must preserve the last valid Companion definitions");
  }
  await catalogue.saveFocusRegistrations({ urls: ["https://example.com/docs?q=1#intro", "invalid"], webAppIDs: ["example", "example"] });
  const request = calls.find((call) => call.url === "/companion/focus-targets");
  if (request?.init?.method !== "POST" || typeof request.init.body !== "string") {
    throw new Error("Configured URL cards must be posted to the paired display");
  }
  const payload = JSON.parse(request.init.body) as { targets: Array<{ id: string; url: string }>; webAppIDs: string[] };
  if (payload.targets.length !== 1 || !/^urlcard\.[0-9a-f]{16}$/.test(payload.targets[0]?.id || "") ||
      payload.targets[0]?.url !== "https://example.com/docs?q=1#intro" || payload.webAppIDs.join("|") !== "example") {
    throw new Error("Only valid URL cards should be registered using stable configured URL IDs");
  }
}
