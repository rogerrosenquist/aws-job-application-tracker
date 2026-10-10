"use strict";

const config = Object.freeze({
  api: "https://im7xfyckjk.execute-api.us-east-1.amazonaws.com",
  cognito: "https://us-east-1zyudj8p61.auth.us-east-1.amazoncognito.com",
  clientId: "nof28hof68de2097keb0j8dft",
  callback: window.location.hostname === "localhost"
    ? "http://localhost:8000/"
    : "https://d3vx7zv7kgrlly.cloudfront.net/"
});
const statuses = ["Applied", "Interviewing", "Rejected", "Offer"];
const pendingLoginKey = "job-tracker-pending-login";
const byId = id => document.getElementById(id);
let accessToken = null;
let expiresAt = 0;

function message(text, error = false) {
  byId("message").textContent = text;
  byId("message").classList.toggle("error", error);
}

function showSession(signedIn) {
  byId("sign-in").hidden = signedIn;
  byId("sign-out").hidden = !signedIn;
  byId("welcome").hidden = signedIn;
  byId("tracker").hidden = !signedIn;
  byId("session-status").textContent = signedIn ? "Signed in" : "Signed out";
  if (!signedIn) {
    accessToken = null;
    expiresAt = 0;
    byId("applications").replaceChildren();
    byId("application-count").textContent = "0";
  }
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signIn() {
  byId("sign-in").disabled = true;
  try {
    if (window.location.origin !== new URL(config.callback).origin) {
      throw new Error(`Open this tracker at ${config.callback} before signing in.`);
    }
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    sessionStorage.setItem(pendingLoginKey, JSON.stringify({ verifier, state, createdAt: Date.now() }));
    const url = new URL("/oauth2/authorize", config.cognito);
    url.search = new URLSearchParams({
      response_type: "code", client_id: config.clientId, redirect_uri: config.callback,
      scope: "openid email", state, code_challenge_method: "S256",
      code_challenge: base64url(new Uint8Array(digest))
    }).toString();
    window.location.assign(url.href);
  } catch (error) {
    message(error.message, true);
    byId("sign-in").disabled = false;
  }
}

async function finishSignIn() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("code") && !params.has("error")) return;
  // Clear the callback code from browser history before making other requests.
  history.replaceState(null, "", window.location.pathname);
  const saved = sessionStorage.getItem(pendingLoginKey);
  sessionStorage.removeItem(pendingLoginKey);
  const pending = saved ? JSON.parse(saved) : null;
  if (!pending || !pending.state || !pending.verifier || params.get("state") !== pending.state ||
      Date.now() - pending.createdAt > 30 * 60 * 1000) {
    throw new Error("This sign-in attempt could not be verified. Click Sign in to try again.");
  }
  if (params.has("error")) throw new Error("Sign-in was not completed. Click Sign in to try again.");
  message("Completing sign-in…");
  const response = await fetch(new URL("/oauth2/token", config.cognito), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: config.clientId,
      redirect_uri: config.callback, code: params.get("code"), code_verifier: pending.verifier
    })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token || !(Number(tokens.expires_in) > 0)) {
    throw new Error("Could not complete sign-in. Click Sign in to try again.");
  }
  // Keep only the access token in memory; reloading the page requires sign-in.
  accessToken = tokens.access_token;
  expiresAt = Date.now() + Number(tokens.expires_in) * 1000;
  showSession(true);
  await loadApplications();
}

function signOut() {
  showSession(false);
  sessionStorage.removeItem(pendingLoginKey);
  const url = new URL("/logout", config.cognito);
  url.search = new URLSearchParams({ client_id: config.clientId, logout_uri: config.callback }).toString();
  window.location.assign(url.href);
}

async function api(path, method = "GET", body) {
  if (!accessToken || Date.now() >= expiresAt) {
    showSession(false);
    throw new Error("Your session has expired. Sign in again to continue.");
  }
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(config.api + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Could not reach the API. Check your connection and API CORS settings, then try again.");
  }
  if (response.status === 401) {
    showSession(false);
    throw new Error("The API could not authorize this session. Sign in again to continue.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

function renderApplications(applications) {
  const tbody = byId("applications");
  tbody.replaceChildren();
  byId("application-count").textContent = String(applications.length);
  byId("empty").hidden = applications.length !== 0;
  applications.sort((a, b) => String(b.dateApplied).localeCompare(String(a.dateApplied)));
  for (const application of applications) {
    const row = document.createElement("tr");
    for (const field of ["company", "jobTitle", "dateApplied"]) {
      const cell = document.createElement("td");
      cell.textContent = application[field];
      row.append(cell);
    }
    const cell = document.createElement("td");
    const control = document.createElement("div");
    control.className = "status-control";
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Status for ${application.jobTitle} at ${application.company}`);
    for (const status of statuses) {
      const option = document.createElement("option");
      option.value = option.textContent = status;
      select.append(option);
    }
    select.value = application.status;
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    save.disabled = true;
    save.setAttribute("aria-label", `Save status for ${application.jobTitle} at ${application.company}`);
    select.addEventListener("change", () => { save.disabled = select.value === application.status; });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.className = "danger";
    remove.setAttribute("aria-label", `Delete ${application.jobTitle} at ${application.company}`);
    save.addEventListener("click", async () => {
      save.disabled = select.disabled = remove.disabled = true;
      try {
        const updated = await api(`/applications/${encodeURIComponent(application.applicationId)}`, "PATCH", { status: select.value });
        application.status = updated.status;
        select.value = updated.status;
        message(`Status updated for ${application.company}.`);
      } catch (error) {
        message(error.message, true);
      } finally {
        select.disabled = false;
        remove.disabled = false;
        save.disabled = select.value === application.status;
      }
    });
    control.append(select, save);
    cell.append(control);
    row.append(cell);
    const actions = document.createElement("td");
    remove.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Delete ${application.jobTitle} at ${application.company}?\n\nThis permanently removes this application.`
      );
      if (!confirmed) return;
      remove.disabled = select.disabled = save.disabled = true;
      try {
        await api(`/applications/${encodeURIComponent(application.applicationId)}`, "DELETE");
        row.remove();
        const remaining = tbody.children.length;
        byId("application-count").textContent = String(remaining);
        byId("empty").hidden = remaining !== 0;
        message(`Application deleted for ${application.company}.`);
      } catch (error) {
        message(error.message, true);
      } finally {
        remove.disabled = select.disabled = false;
        save.disabled = select.value === application.status;
      }
    });
    actions.append(remove);
    row.append(actions);
    tbody.append(row);
  }
}

async function loadApplications() {
  byId("refresh").disabled = true;
  message("Loading applications…");
  try {
    const applications = await api("/applications");
    if (!Array.isArray(applications)) throw new Error("The API returned an unexpected application list.");
    renderApplications(applications);
    message("");
    return true;
  } catch (error) {
    message(error.message, true);
    return false;
  } finally {
    byId("refresh").disabled = false;
  }
}

function resetDate() {
  const now = new Date();
  byId("date-applied").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

byId("sign-in").addEventListener("click", signIn);
byId("sign-out").addEventListener("click", signOut);
byId("refresh").addEventListener("click", loadApplications);
byId("application-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.company = data.company.trim();
  data.jobTitle = data.jobTitle.trim();
  if (!data.company || !data.jobTitle) {
    message("Enter a company and job title.", true);
    return;
  }
  byId("application-fields").disabled = true;
  message("Saving application…");
  try {
    await api("/applications", "POST", data);
    form.reset();
    resetDate();
    if (await loadApplications()) message(`Application added for ${data.company}.`);
  } catch (error) {
    message(error.message, true);
  } finally {
    byId("application-fields").disabled = false;
  }
});
resetDate();
finishSignIn().catch(error => { showSession(false); message(error.message, true); });
