/** Resource types marked deprecated in the provider; shown in resource details. */
export const DEPRECATED_RESOURCE_TYPES = new Set([
  "genesyscloud_journey_outcome",
  "genesyscloud_journey_outcome_predictor",
  "genesyscloud_outbound_contact_list_contact",
]);

export function isDeprecatedResourceType(resourceType) {
  return DEPRECATED_RESOURCE_TYPES.has(resourceType);
}
