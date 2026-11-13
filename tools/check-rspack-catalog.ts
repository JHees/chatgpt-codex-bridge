import ts from "typescript";
import { rspackCatalogExport } from "../packages/renderer-plugin/src/rspack-chat-runtime.js";

// Parse downloaded source as data; use the production matcher without executing app code.
export function inspectCatalogBindings(sources: string[]): boolean {
  const candidates: (string | undefined)[] = [];
  for (const source of sources) {
    const file = ts.createSourceFile("asset.js", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    const pending: ts.Node[] = [file];
    while (pending.length) {
      const node = pending.pop()!;
      if (ts.isMethodDeclaration(node) && node.parameters.length === 3) {
        const text = source.slice(node.getStart(file), node.end);
        if (text.includes('"chatgpt-models"') && text.includes('.safeGet("/models"')) {
          candidates.push(rspackCatalogExport(text));
          continue;
        }
      }
      ts.forEachChild(node, child => { pending.push(child); });
    }
  }
  return candidates.length === 1 && candidates[0] !== undefined;
}

if (process.argv[1]?.endsWith("check-rspack-catalog.ts")) {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input) > 64 * 1024 * 1024) throw new Error("Catalog source limit exceeded");
  }
  const sources: unknown = JSON.parse(input);
  if (!Array.isArray(sources) || !sources.every(source => typeof source === "string")) throw new Error("Expected source strings");
  console.log(JSON.stringify({ supported: inspectCatalogBindings(sources) }));
}
