"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// DOM and network doubles keep these behavior checks offline.
class Element {
  constructor() { this.children = []; this.listeners = {}; this.classList = { toggle() {} }; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren() { this.children = []; }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  setAttribute() {}
  addEventListener(name, listener) { this.listeners[name] = listener; }
}

function setup(origin = "https://d3vx7zv7kgrlly.cloudfront.net", options = {}) {
  const elements = new Map();
  const redirects = [], calls = [], prompts = [];
  const saved = new Map();
  const location = new URL(origin + "/");
  location.assign = url => redirects.push(new URL(url));
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element, createElement: () => new Element() },
    window: { location, confirm: text => { prompts.push(text); return options.confirm ?? true; } },
    history: { replaceState() {} },
    sessionStorage: { setItem: (key, value) => saved.set(key, value), getItem: key => saved.get(key), removeItem: key => saved.delete(key) },
    crypto: webcrypto, URL, URLSearchParams, TextEncoder, Uint8Array, btoa, Date,
    fetch: async (url, request) => {
      calls.push({ url: String(url), request });
      return options.response || { ok: true, status: 200, json: async () => ({ message: "Application deleted." }) };
    }
  });
  vm.runInContext(source, context);
  return { context, location, redirects, calls, prompts, saved, element };
}

function renderOne(app) {
  vm.runInContext('accessToken = "mock-token"; expiresAt = Date.now() + 60000; showSession(true); renderApplications([{applicationId:"test/id",company:"Disposable Company",jobTitle:"Test Role",dateApplied:"2026-10-10",status:"Applied"}]);', app.context);
  return app.element("applications").children[0].children[4].children[0];
}

for (const origin of ["http://localhost:8000", "https://d3vx7zv7kgrlly.cloudfront.net"]) {
  test(`sign-in uses PKCE and sign-out returns to ${origin}`, async () => {
    const app = setup(origin);
    await vm.runInContext("signIn()", app.context);
    const login = app.redirects[0];
    assert.equal(login.pathname, "/oauth2/authorize");
    assert.equal(login.searchParams.get("redirect_uri"), origin + "/");
    assert.equal(login.searchParams.get("response_type"), "code");
    assert.equal(login.searchParams.get("code_challenge_method"), "S256");
    const pending = JSON.parse(app.saved.get("job-tracker-pending-login"));
    assert.equal(login.searchParams.get("state"), pending.state);
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.verifier));
    assert.equal(login.searchParams.get("code_challenge"), Buffer.from(digest).toString("base64url"));
    vm.runInContext("signOut()", app.context);
    assert.equal(app.redirects[1].pathname, "/logout");
    assert.equal(app.redirects[1].searchParams.get("logout_uri"), origin + "/");
    assert.equal(app.calls.length, 0);
  });
}

test("HTTP hosted pages and unregistered origins cannot start sign-in", async () => {
  for (const origin of ["http://d3vx7zv7kgrlly.cloudfront.net", "https://unregistered.example"]) {
    const app = setup(origin);
    await vm.runInContext("signIn()", app.context);
    assert.equal(app.redirects.length, 0);
    assert.equal(app.element("sign-in").disabled, false);
  }
});

test("a mismatched OAuth state never exchanges the code for tokens", async () => {
  const app = setup();
  app.saved.set("job-tracker-pending-login", JSON.stringify({ verifier: "example-verifier", state: "expected", createdAt: Date.now() }));
  app.location.search = "?code=example-code&state=wrong";
  await assert.rejects(vm.runInContext("finishSignIn()", app.context), /could not be verified/);
  assert.equal(app.calls.length, 0);
  assert.equal(app.saved.has("job-tracker-pending-login"), false);
});

test("canceling delete preserves the row and sends no request", async () => {
  const app = setup(undefined, { confirm: false });
  await renderOne(app).listeners.click();
  assert.equal(app.calls.length, 0);
  assert.equal(app.element("applications").children.length, 1);
  assert.match(app.prompts[0], /Test Role at Disposable Company/);
});

test("confirmed deletion uses the authenticated route and updates the count", async () => {
  const app = setup();
  await renderOne(app).listeners.click();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].url, "https://im7xfyckjk.execute-api.us-east-1.amazonaws.com/applications/test%2Fid");
  assert.equal(app.calls[0].request.method, "DELETE");
  assert.equal(app.calls[0].request.headers.Authorization, "Bearer mock-token");
  assert.equal(app.element("applications").children.length, 0);
  assert.equal(app.element("application-count").textContent, "0");
  assert.equal(app.element("empty").hidden, false);
});

test("failed deletion preserves the row and allows retry", async () => {
  const app = setup(undefined, { response: { ok: false, status: 500, json: async () => ({ message: "Request failed." }) } });
  const remove = renderOne(app);
  await remove.listeners.click();
  assert.equal(app.element("applications").children.length, 1);
  assert.equal(remove.disabled, false);
  assert.equal(app.element("message").textContent, "Request failed.");
});

test("an API 401 clears the displayed session", async () => {
  const app = setup(undefined, { response: { ok: false, status: 401 } });
  renderOne(app);
  await assert.rejects(vm.runInContext('api("/applications")', app.context), /could not authorize/);
  assert.equal(app.element("applications").children.length, 0);
  assert.equal(app.element("tracker").hidden, true);
  assert.equal(app.element("sign-in").hidden, false);
});
