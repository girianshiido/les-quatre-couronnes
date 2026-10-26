import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const clientSource = ts.transpileModule(
  readFileSync(new URL("../src/pwa.ts", import.meta.url), "utf8").replace(
    "import.meta.env.PROD",
    "true",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
async function client(
  installed = false,
  waiting = false,
  allowSave: boolean | Promise<boolean> = true,
) {
  const calls: string[] = [];
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => Object.assign(new EventTarget(), { matches: installed }),
    location: { reload: () => calls.push("reload") },
  });
  const buttons = Array.from({ length: 2 }, () => ({
    innerHTML: "",
    title: "",
    disabled: false,
    onclick: undefined as undefined | (() => Promise<void>),
    setAttribute() {},
    classList: { toggle() {} },
  }));
  const document = Object.assign(new EventTarget(), {
    querySelectorAll: () => buttons,
    baseURI: "https://example.org/game/",
    visibilityState: "visible",
  });
  const worker = {
    postMessage: (data: { type: string }) => calls.push(data.type),
  };
  const registration = Object.assign(new EventTarget(), {
    waiting: waiting ? worker : null,
    installing: null,
    update: async () => {
      calls.push("check");
    },
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {},
    register: async () => registration,
  });
  const module = { exports: {} };
  const storage = new Map();
  vm.runInNewContext(clientSource, {
    exports: module.exports,
    window,
    document,
    navigator: {
      serviceWorker,
      onLine: true,
      userAgent: "Chrome",
      platform: "MacIntel",
      maxTouchPoints: 0,
    },
    localStorage: {
      getItem: (k: string) => storage.get(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    URL,
    Event,
    Promise,
  });
  (module.exports as { setupPwa: Function }).setupPwa({
    notify: (m: string) => calls.push(m),
    beforeUpdate: () => {
      calls.push("save");
      return allowSave;
    },
    showInstallHelp: () => calls.push("help"),
  });
  await Promise.resolve();
  await Promise.resolve();
  return { calls, window, buttons, serviceWorker, registration };
}

test("install icon changes to refresh after installation and uses update checking", async () => {
  const c = await client();
  assert.match(c.buttons[0].title, /Installer/);
  c.window.dispatchEvent(new Event("appinstalled"));
  assert.match(c.buttons[0].title, /mises à jour/);
  await c.buttons[0].onclick!();
  assert.ok(c.calls.includes("check"));
  assert.ok(!c.calls.includes("reload"));
});
test("a waiting update saves before activation and reloads only after controller change", async () => {
  const c = await client(true, true);
  await c.buttons[0].onclick!();
  assert.ok(c.calls.indexOf("save") < c.calls.indexOf("APPLY_UPDATE"));
  assert.ok(!c.calls.includes("reload"));
  c.serviceWorker.dispatchEvent(new Event("controllerchange"));
  assert.ok(c.calls.includes("reload"));
});
test("an update cannot erase the current game if saving fails", async () => {
  const c = await client(true, true, false);
  await c.buttons[0].onclick!();
  assert.ok(c.calls.includes("save"));
  assert.ok(!c.calls.includes("APPLY_UPDATE"));
});

const workerSource = readFileSync(
  new URL("../docs/sw.js", import.meta.url),
  "utf8",
);
function worker() {
  const handlers: Record<string, Function> = {},
    calls: string[] = [];
  const scope = "https://example.org/game/";
  const cache = {
    addAll: async (paths: Request[]) => {
      assert.ok(paths.every((p) => p.cache === "reload"));
      calls.push(...paths.map((p) => p.url));
    },
    match: async (key: any) =>
      key === scope + "index.html" ? "offline-game" : undefined,
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["other-game", "quatre-couronnes-old"],
    delete: async (name: string) => {
      calls.push("delete:" + name);
      return true;
    },
  };
  const self = {
    registration: { scope },
    location: { origin: "https://example.org" },
    clients: { claim: async () => calls.push("claim") },
    skipWaiting: () => calls.push("skip"),
    addEventListener: (name: string, fn: Function) => (handlers[name] = fn),
  };
  vm.runInNewContext(workerSource, {
    self,
    caches,
    URL,
    Request,
    fetch: () => {
      throw Error("network unavailable");
    },
  });
  return { handlers, calls };
}
test("offline install caches the complete build and activates only on explicit update", async () => {
  const w = worker();
  let task: Promise<any>;
  w.handlers.install({ waitUntil: (p: Promise<any>) => (task = p) });
  await task!;
  assert.ok(w.calls.some((p) => p.endsWith("manifest.webmanifest")));
  assert.ok(
    w.calls.some((p) => p.includes("assets/index-") && p.endsWith(".js")),
  );
  assert.ok(w.calls.some((p) => p.endsWith("icons/crown-512.png")));
  assert.ok(!w.calls.includes("skip"));
  w.handlers.message({ data: { type: "APPLY_UPDATE" } });
  assert.ok(w.calls.includes("skip"));
  w.handlers.activate({ waitUntil: (p: Promise<any>) => (task = p) });
  await task!;
  assert.ok(w.calls.includes("delete:quatre-couronnes-old"));
  assert.ok(!w.calls.includes("delete:other-game"));
});
test("offline navigation serves the game while unrelated pages bypass its worker", async () => {
  const w = worker();
  let response: Promise<any> | undefined;
  w.handlers.fetch({
    request: {
      url: "https://example.org/game/",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p: Promise<any>) => (response = p),
  });
  assert.equal(await response, "offline-game");
  response = undefined;
  w.handlers.fetch({
    request: { url: "https://example.org/other-game/", method: "GET" },
    respondWith: (p: Promise<any>) => (response = p),
  });
  assert.equal(response, undefined);
});
test("the manifest has real square icons and a relative Pages scope", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL("../public/" + icon.src, import.meta.url));
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test("an update already applied by another tab does not leave a misleading update button", async () => {
  const c = await client(false, true);
  c.registration.waiting = null;
  await c.buttons[0].onclick!();
  assert.ok(c.calls.includes("check"));
  assert.ok(!c.calls.includes("help"));
  assert.match(c.buttons[0].title, /Installer/);
});

test("applying a waiting update waits for the user's save decision", async () => {
  let choose!: (value: boolean) => void;
  const choice = new Promise<boolean>((resolve) => (choose = resolve));
  const c = await client(true, true, choice);
  const click = c.buttons[0].onclick!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(c.calls.includes("save"));
  assert.ok(!c.calls.includes("APPLY_UPDATE"));
  choose(true);
  await click;
  assert.ok(c.calls.includes("APPLY_UPDATE"));
});
