export function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

export async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk: string) => {
      data = chunk.trim();
      process.stdin.pause();
      resolve(data);
    });
  });
}
