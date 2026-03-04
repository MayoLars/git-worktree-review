import { $ } from "bun";
import { join } from "path";

export interface WtrConfig {
  port?: number;
}

const CONFIG_FILE = ".wtr.json";

async function getRepoRoot(): Promise<string> {
  const result = await $`git rev-parse --show-toplevel`.quiet();
  return result.text().trim();
}

export async function loadConfig(): Promise<WtrConfig> {
  const root = await getRepoRoot();
  const configPath = join(root, CONFIG_FILE);
  const file = Bun.file(configPath);

  if (await file.exists()) {
    return await file.json();
  }

  return {};
}

export async function saveConfig(config: WtrConfig): Promise<void> {
  const root = await getRepoRoot();
  const configPath = join(root, CONFIG_FILE);
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}
