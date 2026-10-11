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
  constructor() { this.children = []; this.listeners = {}; this.value = ""; this.attributes = {}; this.classList = { toggle() {} }; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren() { this.children = []; }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  setAttribute(name, value) { this.attributes[name] = value; }
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
      return options.fetch ? options.fetch(url, request) : options.response || { ok: true, status: 200, json: async () => ({ message: "Application deleted." }) };
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
  assert.equal(app.element("applications").children[0].children[4].children[0].disabled, false);
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

const sample = [
  { applicationId: "1", company: "Northstar", jobTitle: "Cloud Engineer", dateApplied: "2026-10-08", status: "Applied" },
  { applicationId: "2", company: "Atlas", jobTitle: "Support Associate", dateApplied: "2026-10-10", status: "Interviewing" },
  { applicationId: "3", company: "Evergreen", jobTitle: "Cloud Engineer", dateApplied: "2026-10-09", status: "Offer" },
  { applicationId: "4", company: "Waypoint", jobTitle: "Developer", dateApplied: "2026-10-07", status: "Applied" }
];
function renderSample(app) {
  app.context.sample = JSON.parse(JSON.stringify(sample));
  vm.runInContext('accessToken = "mock-token"; expiresAt = Date.now() + 60000; showSession(true); renderApplications(sample);', app.context);
}
const companies = app => app.element("applications").children.map(row => row.children[0].textContent);

test("status totals reflect the whole list while search and status filters combine", () => {
  const app = setup();
  renderSample(app);
  assert.equal(app.element("count-Applied").textContent, "2");
  assert.equal(app.element("count-Interviewing").textContent, "1");
  assert.equal(app.element("count-Offer").textContent, "1");
  assert.equal(app.element("count-Rejected").textContent, "0");
  app.element("search").value = " CLOUD ";
  app.element("search").listeners.input();
  assert.deepEqual(companies(app), ["Evergreen", "Northstar"]);
  app.element("summary-Applied").listeners.click();
  assert.deepEqual(companies(app), ["Northstar"]);
  assert.equal(app.element("count-Applied").textContent, "2");
  assert.equal(app.element("summary-Applied").attributes["aria-pressed"], "true");
  assert.equal(app.element("results-count").textContent, "Showing 1 of 4 applications");
  app.element("clear-filters").listeners.click();
  assert.equal(companies(app).length, 4);
  assert.equal(app.element("clear-filters").hidden, true);
});

test("sorting changes visible order without mutating the API list", () => {
  const app = setup();
  renderSample(app);
  assert.deepEqual(companies(app), ["Atlas", "Evergreen", "Northstar", "Waypoint"]);
  app.element("sort-order").value = "oldest";
  app.element("sort-order").listeners.change();
  assert.deepEqual(companies(app), ["Waypoint", "Northstar", "Evergreen", "Atlas"]);
  app.element("sort-order").value = "company";
  app.element("sort-order").listeners.change();
  assert.deepEqual(companies(app), ["Atlas", "Evergreen", "Northstar", "Waypoint"]);
  assert.deepEqual(Array.from(app.context.sample, item => item.company), sample.map(item => item.company));
});

test("no-match state differs from an empty tracker and keeps total counts", () => {
  const app = setup();
  renderSample(app);
  app.element("search").value = "No such company";
  app.element("search").listeners.input();
  assert.equal(app.element("empty").hidden, false);
  assert.equal(app.element("empty-title").textContent, "No matching applications.");
  assert.equal(app.element("application-table").hidden, true);
  assert.equal(app.element("application-count").textContent, "4");
});

test("saving a status updates colors, totals and the active filter", async () => {
  const app = setup(undefined, { response: { ok: true, status: 200, json: async () => ({ status: "Offer" }) } });
  renderSample(app);
  app.element("summary-Applied").listeners.click();
  const row = app.element("applications").children[0];
  const [select, save] = row.children[3].children[0].children;
  select.value = "Offer";
  select.listeners.change();
  assert.equal(select.className, "status-select offer");
  assert.equal(save.disabled, false);
  await save.listeners.click();
  assert.deepEqual(companies(app), ["Waypoint"]);
  assert.equal(app.element("count-Applied").textContent, "1");
  assert.equal(app.element("count-Offer").textContent, "2");
  assert.equal(app.calls[0].request.method, "PATCH");
  assert.equal(app.calls[0].request.body, '{"status":"Offer"}');
  app.element("clear-filters").listeners.click();
  assert.equal(app.element("applications").children.find(item => item.children[0].textContent === "Northstar").className, "offer");
});

test("deleting a filtered row keeps other applications and global totals", async () => {
  const app = setup();
  renderSample(app);
  app.element("summary-Offer").listeners.click();
  await app.element("applications").children[0].children[4].children[0].listeners.click();
  assert.equal(app.element("application-count").textContent, "3");
  assert.equal(app.element("count-Offer").textContent, "0");
  assert.equal(app.element("count-Applied").textContent, "2");
  assert.equal(app.element("empty").hidden, false);
  app.element("clear-filters").listeners.click();
  assert.deepEqual(companies(app), ["Atlas", "Northstar", "Waypoint"]);
});

test("unsaved status choices survive search and failed saves", async () => {
  const app = setup(undefined, { response: { ok: false, status: 500, json: async () => ({ message: "Try again." }) } });
  renderSample(app);
  let control = app.element("applications").children[0].children[3].children[0];
  control.children[0].value = "Offer";
  control.children[0].listeners.change();
  app.element("search").value = "Atlas";
  app.element("search").listeners.input();
  control = app.element("applications").children[0].children[3].children[0];
  assert.equal(control.children[0].value, "Offer");
  await control.children[1].listeners.click();
  control = app.element("applications").children[0].children[3].children[0];
  assert.equal(control.children[0].value, "Offer");
  assert.equal(control.children[1].disabled, false);
  assert.equal(app.element("count-Interviewing").textContent, "1");
});

test("an unauthorized delete cannot redraw cleared applications", async () => {
  const app = setup(undefined, { response: { ok: false, status: 401 } });
  await renderOne(app).listeners.click();
  assert.equal(app.element("applications").children.length, 0);
  assert.equal(app.element("count-Applied").textContent, "0");
  assert.equal(app.element("tracker").hidden, true);
});

test("a late refresh response cannot restore a signed-out session", async () => {
  let complete;
  const app = setup(undefined, { fetch: () => new Promise(resolve => { complete = resolve; }) });
  renderSample(app);
  const loading = vm.runInContext("loadApplications()", app.context);
  vm.runInContext("signOut()", app.context);
  complete({ ok: true, status: 200, json: async () => sample });
  await loading;
  assert.equal(app.element("applications").children.length, 0);
  assert.equal(app.element("tracker").hidden, true);
});
