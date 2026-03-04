import { loadConfig, saveConfig } from "../core/config";

export default async function config() {
  const portStr = getFlag("--port") ?? getFlag("-p");

  if (!portStr) {
    const current = await loadConfig();
    console.log("Current config (.wtr.json):");
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  const port = parseInt(portStr);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Error: Port must be a number between 1 and 65535.");
    process.exit(1);
  }

  const current = await loadConfig();
  current.port = port;
  await saveConfig(current);
  console.log(`Saved port ${port} to .wtr.json`);
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
