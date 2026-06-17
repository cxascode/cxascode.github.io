import {
  appRootPathname,
  attributeIndexLocation,
  creationOrderLocation,
  DIALOG_ATTRIBUTE_INDEX,
  DIALOG_CREATION_ORDER,
  DIALOG_ENV_VARS,
  DIALOG_RELEASE_NOTES,
  dialogPathname,
  readAttributeIndexFilterFromLocation,
  readCreationOrderFilterFromLocation,
  readDialogFromLocation,
  readResourceTypeFromLocation,
  readVersionFromLocation,
  resourcePathname,
  toVersionPathSegment,
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
  [DIALOG_ENV_VARS]: {
    title: "Provider environment variables — CX as Code Explorer",
    description:
      "Catalog of Genesys Cloud Terraform provider environment variables used by genesyscloud_tf_export, including export-template mappings.",
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

function resolveVersion(version) {
  const trimmed = (version || "").trim();
  if (trimmed && trimmed !== "latest") return trimmed.replace(/^v/i, "");
  return readVersionFromLocation();
}

function versionLabel(version) {
  return toVersionPathSegment(version) || "";
}

function buildResourceDescription(resourceType, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  return `Dependencies, export templates, and attribute history for ${resourceType}${suffix} in the Genesys Cloud Terraform provider.`;
}

function buildResourceTitle(resourceType, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  return `${resourceType}${suffix} — CX as Code Explorer`;
}

function buildDialogTitle(dialogId, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  const base = DIALOG_SEO[dialogId]?.title?.replace(" — CX as Code Explorer", "") || "";
  return `${base}${suffix} — CX as Code Explorer`;
}

export function resolvePageSeo({
  activeType,
  selectedVersion,
  releaseNotesOpen,
  creationOrderOpen,
  attributeIndexOpen,
  envVarsOpen,
  attributeIndexFilter = "",
  creationOrderFilter = "",
}) {
  const version = resolveVersion(selectedVersion);
  const attributeFilter =
    (attributeIndexFilter || "").trim() || readAttributeIndexFilterFromLocation();
  const orderFilter =
    (creationOrderFilter || "").trim() || readCreationOrderFilterFromLocation();

  if (releaseNotesOpen) {
    return { dialogId: DIALOG_RELEASE_NOTES, resourceType: "", version };
  }
  if (creationOrderOpen) {
    return {
      dialogId: DIALOG_CREATION_ORDER,
      resourceType: orderFilter,
      version,
    };
  }
  if (attributeIndexOpen) {
    return {
      dialogId: DIALOG_ATTRIBUTE_INDEX,
      resourceType: attributeFilter,
      version,
    };
  }
  if (envVarsOpen) {
    return { dialogId: DIALOG_ENV_VARS, resourceType: "", version };
  }

  const dialogFromUrl = readDialogFromLocation();
  if (dialogFromUrl) {
    return {
      dialogId: dialogFromUrl,
      resourceType:
        dialogFromUrl === DIALOG_ATTRIBUTE_INDEX
          ? readAttributeIndexFilterFromLocation()
          : dialogFromUrl === DIALOG_CREATION_ORDER
            ? readCreationOrderFilterFromLocation()
            : "",
      version,
    };
  }

  return {
    dialogId: "",
    resourceType: activeType || readResourceTypeFromLocation(),
    version,
  };
}

function buildAttributeIndexDescription(filter, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  const trimmed = (filter || "").trim();
  if (trimmed) {
    return `Attribute change history matching "${trimmed}"${suffix} in the Genesys Cloud Terraform provider.`;
  }
  return DIALOG_SEO[DIALOG_ATTRIBUTE_INDEX].description;
}

function buildAttributeIndexTitle(filter, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  const trimmed = (filter || "").trim();
  if (trimmed) {
    return `Attribute history: ${trimmed}${suffix} — CX as Code Explorer`;
  }
  return buildDialogTitle(DIALOG_ATTRIBUTE_INDEX, version);
}

function buildCreationOrderDescription(filter, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  const trimmed = (filter || "").trim();
  if (trimmed) {
    return `Creation order for resource types matching "${trimmed}"${suffix} in the Genesys Cloud Terraform provider.`;
  }
  return DIALOG_SEO[DIALOG_CREATION_ORDER].description;
}

function buildCreationOrderTitle(filter, version) {
  const label = versionLabel(version);
  const suffix = label ? ` (${label})` : "";
  const trimmed = (filter || "").trim();
  if (trimmed) {
    return `Creation order: ${trimmed}${suffix} — CX as Code Explorer`;
  }
  return buildDialogTitle(DIALOG_CREATION_ORDER, version);
}

export function pageSeoForState({ dialogId, resourceType, version = "" }) {
  if (dialogId === DIALOG_ATTRIBUTE_INDEX) {
    return {
      title: buildAttributeIndexTitle(resourceType, version),
      description: buildAttributeIndexDescription(resourceType, version),
      pathname: attributeIndexLocation(resourceType, version),
    };
  }

  if (dialogId === DIALOG_CREATION_ORDER) {
    return {
      title: buildCreationOrderTitle(resourceType, version),
      description: buildCreationOrderDescription(resourceType, version),
      pathname: creationOrderLocation(resourceType, version),
    };
  }

  if (dialogId && DIALOG_SEO[dialogId]) {
    const { description } = DIALOG_SEO[dialogId];
    return {
      title: buildDialogTitle(dialogId, version),
      description,
      pathname: dialogPathname(dialogId, version),
    };
  }

  const typed = (resourceType || "").trim();
  if (typed) {
    return {
      title: buildResourceTitle(typed, version),
      description: buildResourceDescription(typed, version),
      pathname: resourcePathname(typed, version),
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
