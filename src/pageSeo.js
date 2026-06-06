import {
  appRootPathname,
  DIALOG_ATTRIBUTE_INDEX,
  DIALOG_CREATION_ORDER,
  DIALOG_RELEASE_NOTES,
  dialogPathname,
  readDialogFromLocation,
  readResourceTypeFromLocation,
  resourcePathname,
} from "./appPermalinks.js";

const PRODUCTION_ORIGIN = "https://cxascode.github.io";

const DEFAULT_TITLE = "CX as Code — Genesys Cloud Terraform Explorer";
const DEFAULT_DESCRIPTION =
  "CX as Code reference for Genesys Cloud Terraform. Browse resource types, dependencies, release notes, attribute history, and export templates.";

const DIALOG_SEO = {
  [DIALOG_RELEASE_NOTES]: {
    title: "Release notes — CX as Code Explorer",
    description:
      "Genesys Cloud Terraform provider release notes on CX as Code Explorer. Browse version history and resource changes.",
  },
  [DIALOG_CREATION_ORDER]: {
    title: "Creation order — CX as Code Explorer",
    description:
      "Suggested Genesys Cloud Terraform resource creation order by dependency tier for CX as Code deployments.",
  },
  [DIALOG_ATTRIBUTE_INDEX]: {
    title: "Attribute index — CX as Code Explorer",
    description:
      "Genesys Cloud Terraform provider attribute change index: introduced, updated, and removed fields across resources.",
  },
};

function pageOrigin() {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;

  const { hostname } = window.location;
  if (hostname === "cxascode.github.io" || hostname === "www.cxascode.github.io") {
    return PRODUCTION_ORIGIN;
  }

  return window.location.origin;
}

function buildResourceDescription(resourceType) {
  return `Dependencies, export templates, and attribute history for ${resourceType} in the Genesys Cloud Terraform provider.`;
}

function buildResourceTitle(resourceType) {
  return `${resourceType} — CX as Code Explorer`;
}

export function resolvePageSeo({ activeType, releaseNotesOpen, creationOrderOpen, attributeIndexOpen }) {
  if (releaseNotesOpen) {
    return { dialogId: DIALOG_RELEASE_NOTES, resourceType: "" };
  }
  if (creationOrderOpen) {
    return { dialogId: DIALOG_CREATION_ORDER, resourceType: "" };
  }
  if (attributeIndexOpen) {
    return { dialogId: DIALOG_ATTRIBUTE_INDEX, resourceType: "" };
  }

  const dialogFromUrl = readDialogFromLocation();
  if (dialogFromUrl) {
    return { dialogId: dialogFromUrl, resourceType: "" };
  }

  return {
    dialogId: "",
    resourceType: activeType || readResourceTypeFromLocation(),
  };
}

export function pageSeoForState({ dialogId, resourceType }) {
  if (dialogId && DIALOG_SEO[dialogId]) {
    const { title, description } = DIALOG_SEO[dialogId];
    const pathname = dialogPathname(dialogId);
    return { title, description, pathname };
  }

  const typed = (resourceType || "").trim();
  if (typed) {
    return {
      title: buildResourceTitle(typed),
      description: buildResourceDescription(typed),
      pathname: resourcePathname(typed),
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    pathname: appRootPathname(),
  };
}

function upsertMetaByName(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

export function applyPageSeo(state) {
  if (typeof document === "undefined") return;

  const { title, description, pathname } = pageSeoForState(state);
  const url = new URL(pathname, pageOrigin()).toString();

  document.title = title;
  upsertCanonical(url);
  upsertMetaByName("description", description);
  upsertMetaByProperty("og:title", title);
  upsertMetaByProperty("og:description", description);
  upsertMetaByProperty("og:url", url);
  upsertMetaByName("twitter:title", title);
  upsertMetaByName("twitter:description", description);
}
