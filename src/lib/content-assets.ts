import fs from "node:fs/promises";
import path from "node:path";
import { resolveRepoPaths } from "./fs-paths";

export async function loadPrompt(name: "research" | "writer" | "producer") {
  const { promptsDir } = resolveRepoPaths();
  return fs.readFile(path.join(promptsDir, name, "system.md"), "utf8");
}

export async function loadJsonConfig<T>(name: "show-format" | "voicebox") {
  const { configsDir } = resolveRepoPaths();
  const content = await fs.readFile(path.join(configsDir, `${name}.json`), "utf8");
  return JSON.parse(content) as T;
}
