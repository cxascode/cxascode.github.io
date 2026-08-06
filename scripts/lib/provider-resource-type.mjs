export const RESOURCE_TYPE_CONST_PATTERN =
  /const\s+(?:\w+ResourceType|ResourceType)\s*=\s*"([^"]+)"/;

export function deriveResourceTypeFromContent(content) {
  const match = content.match(RESOURCE_TYPE_CONST_PATTERN);
  return match ? match[1] : null;
}

export function resolveResourceTypeForFile(file, filesByName, packageDefaultType) {
  const sameFileType = deriveResourceTypeFromContent(file.content);
  if (sameFileType) return sameFileType;

  const baseName = file.name.replace(/\.go$/, "");
  const schemaFile = filesByName.get(`${baseName}_schema.go`);
  if (schemaFile) {
    const schemaType = deriveResourceTypeFromContent(schemaFile.content);
    if (schemaType) return schemaType;
  }

  const stem = baseName.replace(/^resource_/, "");
  for (const sibling of filesByName.values()) {
    if (!sibling.name.includes(stem)) continue;
    const siblingType = deriveResourceTypeFromContent(sibling.content);
    if (siblingType) return siblingType;
  }

  return packageDefaultType;
}
