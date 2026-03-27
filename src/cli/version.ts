import { resolve, dirname } from "path";

export async function getVersion(): Promise<string> {
  const pkgPath = resolve(dirname(import.meta.dir), "..", "package.json");
  const pkg = await Bun.file(pkgPath).json();
  return pkg.version;
}
