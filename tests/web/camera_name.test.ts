import { registerImageCardTypes } from "../../src/webserver/cards/image";
import { createConfigImageOptionsFeature } from "../../src/webserver/application/config_image_options";

export function runCameraNameTests(): void {
  function check(value: unknown, message: string) {
    if (!value) throw new Error(message);
  }
  const options = createConfigImageOptionsFeature({
    layout: { config: { imageSlotCapacity: 6 } },
    mediaOptions: { mediaEditorMode: () => "" },
    showBanner: () => {},
  } as any);
  let definition: any;
  registerImageCardTypes({ register: (_type: string, value: any) => { definition = value; } } as any, options);
  const previousDocument = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({}) } as any;
    for (const entity of ["camera.front", "image.driveway"]) {
      const camera = { type: "image", entity, label: "Front Door", icon: "Custom", sensor: "legacy", options: "image_label,image_modal_refresh_mode=activity,image_modal_refresh_trigger=event.doorbell,unknown=keep" };
      const before = JSON.stringify(camera);
      const children: any[] = [];
      definition.renderSettings({ appendChild: (child: any) => children.push(child) }, camera, 1, {});
      check(JSON.stringify(camera) === before, "Opening retired cards must retain every saved field");
      check(children.length === 1 && /configuration has been kept/.test(children[0].textContent), "Retired camera cards explain preservation and replacement");
      check(definition.renderPreview(camera, { escHtml: (v: any) => v }).labelHtml.includes("Front Door"), "Saved labels remain visible in previews");
    }
    check(definition.hidden(), "Retired camera cards must not be offered in the picker");
    check(!definition.onSelect && !definition.cardMetadata.entity, "Retired cards must not offer entity editing or selection hooks");
  } finally { globalThis.document = previousDocument; }
}
