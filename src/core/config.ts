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
  try {
    const root = await getRepoRoot();
    const configPath = join(root, CONFIG_FILE);
    const file = Bun.file(configPath);

    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Malformed JSON or git root detection failed — use defaults
  }

  return {};
}

export async function saveConfig(config: WtrConfig): Promise<void> {
  try {
    const root = await getRepoRoot();
    const configPath = join(root, CONFIG_FILE);
    await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  } catch {
    throw new Error("Failed to save config. Are you in a git repository?");
  }
}
