#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

OWNER="${OWNER:-MyPureCloud}"
REPO="${REPO:-terraform-provider-genesyscloud}"
MIN_DEP_VERSION="${MIN_DEP_VERSION:-1.60.0}"
MIN_PERM_VERSION="${MIN_PERM_VERSION:-1.76.0}"
GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "${GH_TOKEN}" ]] && command -v gh >/dev/null 2>&1; then
  GH_TOKEN="$(gh auth token 2>/dev/null || true)"
fi
DOWNLOAD_PERMISSIONS="${DOWNLOAD_PERMISSIONS:-true}"
RUN_GENERATORS="${RUN_GENERATORS:-true}"

DEP_DIR="public/dependency-tree-json"
PERM_DIR="public/resource-permissions-json"

is_valid_dependency_tree_json() {
  local file="$1"
  jq -e 'type == "object" and (.resources | type == "array")' "${file}" >/dev/null 2>&1
}

is_valid_permissions_json() {
  local file="$1"
  jq -e 'type == "object" and (.resources | type == "array")' "${file}" >/dev/null 2>&1
}

auth_args=()
if [[ -n "${GH_TOKEN}" ]]; then
  auth_args=(-H "Authorization: Bearer ${GH_TOKEN}")
fi

mkdir -p "${DEP_DIR}" "${PERM_DIR}"

echo "Downloading dependency_tree JSONs >= ${MIN_DEP_VERSION} from ${OWNER}/${REPO}..."
if [[ -z "${GH_TOKEN}" ]]; then
  echo "Tip: run 'gh auth login' or set GH_TOKEN to avoid GitHub API rate limits."
else
  echo "Using GitHub API token from environment or gh auth."
fi

api_base="https://api.github.com/repos/${OWNER}/${REPO}"
page=1

while true; do
  releases_json="$(
    curl -fsSL \
      "${auth_args[@]}" \
      -H "Accept: application/vnd.github+json" \
      "${api_base}/releases?per_page=100&page=${page}"
  )"

  count="$(echo "${releases_json}" | jq 'length')"
  if [[ "${count}" -eq 0 ]]; then
    break
  fi

  echo "${releases_json}" | jq -r '
    .[] |
    { tag: .tag_name, assets: (.assets // []) } |
    .tag as $tag |
    ($tag | ltrimstr("v")) as $ver |
    [
      $tag,
      ((.assets[]? | select(.name == ("dependency_tree-" + $ver + ".json")) | .browser_download_url) // ""),
      ((.assets[]? | select(.name == ("resource_permissions-" + $ver + ".json")) | .browser_download_url) // "")
    ] |
    @tsv
  ' | while IFS=$'\t' read -r tag dep_url perm_url; do
    ver="${tag#v}"

    dep_first="$(printf "%s\n%s\n" "${MIN_DEP_VERSION}" "${ver}" | sort -V | head -n 1)"
    perm_first="$(printf "%s\n%s\n" "${MIN_PERM_VERSION}" "${ver}" | sort -V | head -n 1)"

    if [[ -n "${dep_url}" && "${dep_first}" == "${MIN_DEP_VERSION}" ]]; then
      dep_out="${DEP_DIR}/${ver}.json"
      if [[ -f "${dep_out}" ]] && is_valid_dependency_tree_json "${dep_out}"; then
        echo "  skip dependency tree ${ver} (exists)"
      else
        if [[ -f "${dep_out}" ]]; then
          echo "  replace dependency tree ${ver} (invalid file)"
        else
          echo "  dependency tree ${ver}"
        fi
        curl -fsSL -L "${dep_url}" -o "${dep_out}"
      fi
    fi

    if [[ "${DOWNLOAD_PERMISSIONS}" == "true" && -n "${perm_url}" && "${perm_first}" == "${MIN_PERM_VERSION}" ]]; then
      perm_out="${PERM_DIR}/${ver}.json"
      if [[ -f "${perm_out}" ]] && is_valid_permissions_json "${perm_out}"; then
        echo "  skip resource permissions ${ver} (exists)"
      else
        if [[ -f "${perm_out}" ]]; then
          echo "  replace resource permissions ${ver} (invalid file)"
        else
          echo "  resource permissions ${ver}"
        fi
        curl -fsSL -L "${perm_url}" -o "${perm_out}"
      fi
    fi
  done

  page=$((page + 1))
done

dep_count="$(
  find "${DEP_DIR}" -maxdepth 1 -name '*.json' \
    ! -name 'index.json' \
    ! -name 'latest.json' \
    | wc -l | tr -d ' '
)"

if [[ "${dep_count}" -eq 0 ]]; then
  echo "No dependency tree JSONs downloaded. Check MIN_DEP_VERSION and release assets."
  exit 1
fi

versions_sorted="$(
  find "${DEP_DIR}" -maxdepth 1 -name '*.json' \
    ! -name 'index.json' \
    ! -name 'latest.json' \
    | sed 's|.*/||; s|\.json$||' \
    | sort -Vr
)"

printf "%s\n" "${versions_sorted}" | jq -R -s 'split("\n") | map(select(length > 0))' > "${DEP_DIR}/index.json"

latest="$(printf "%s\n" "${versions_sorted}" | head -n 1)"
cp "${DEP_DIR}/${latest}.json" "${DEP_DIR}/latest.json"

echo "Indexed ${dep_count} dependency tree version(s). Latest: ${latest}"

if [[ "${RUN_GENERATORS}" == "true" ]]; then
  echo "Running local generators for latest=${latest}..."
  node scripts/generate-resource-permissions-tf.mjs --latest="${latest}"
  node scripts/generate-tf-export-resource-names.mjs
  node scripts/generate-spreadsheet-template.mjs --latest="${latest}"
fi

echo "Done."
