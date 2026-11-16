import { emptyCardConfig } from "./card";
import { configOptionValue } from "./config_primitives";

export const STUDIO_CONTROL_PAGE = "obs_studio_control";

export function isStudioControlPage(options?: string): boolean {
  return configOptionValue(options, "subpage_kind") === STUDIO_CONTROL_PAGE;
}

export function studioControlPage(columns: number, slots: number) {
  const definitions = [
    ["obs.output.record", "Record"],
    ["obs.output.stream", "Broadcast"],
    ["obs.studio", "Split Vertical"],
    ["obs.replay", "History"],
    ["obs.replay.buffer", "Repeat"],
  ] as const;
  const cards = definitions.map(([entity, icon]) => ({ ...emptyCardConfig(), type: "companion", entity, icon }));

  if (columns < 3 || slots < columns * 2 + 3) return { cards, order: "B,1,2,3,5,4" };
  const order = Array<string>(columns * 2 + 1).fill("");
  order[0] = "B";
  order[1] = "1";
  order[2] = "2";
  order[columns] = "3";
  order[columns + 1] = "4b";
  order[columns * 2] = "5";
  return { cards, order: order.join(",") };
}
