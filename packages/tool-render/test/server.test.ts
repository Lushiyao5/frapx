import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveDirectory } from "../src/server";
import type { StaticServer } from "../src/server";

let server: StaticServer;
let root: string;

beforeAll(async () => {
  const parent = await mkdtemp(join(tmpdir(), "frapx-serve-"));
  root = join(parent, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><title>x</title>");
  await writeFile(join(root, "assets", "main.js"), "export {};");
  await writeFile(join(parent, "secret.txt"), "no");
  server = await serveDirectory(root);
});

afterAll(() => server.close());

describe("serveDirectory", () => {
  it("serves index.html for the root and files with their types", async () => {
    const index = await fetch(server.url);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain("<title>x</title>");

    const script = await fetch(new URL("assets/main.js?v=1", server.url));
    expect(script.headers.get("content-type")).toContain("text/javascript");
  });

  it("serves the root index.html for a missing route without an extension", async () => {
    const route = await fetch(new URL("music?take=2", server.url));
    expect(route.status).toBe(200);
    expect(route.headers.get("content-type")).toContain("text/html");
    expect(await route.text()).toContain("<title>x</title>");
    expect((await fetch(new URL("assets/missing", server.url))).status).toBe(200);
  });

  it("answers 404 for missing files and refuses paths outside the root", async () => {
    expect((await fetch(new URL("missing.js", server.url))).status).toBe(404);
    expect((await fetch(new URL("music/missing.js", server.url))).status).toBe(404);
    // URLs normalize "..", even encoded; an encoded slash survives until decoding.
    expect((await fetch(`${server.url}..%2fsecret.txt`)).status).toBe(403);
  });
});
