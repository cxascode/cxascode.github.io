# CX as Code Terraform Provider Resource Attribute Index

This index is generated from the release notes available on this site. `Introduced` is `Unknown` when the item existed before `v1.60.0`.

| Type | Resource / Data Source | Attribute | Introduced | Last Updated | Status | Notes |
|---|---|---|---:|---:|---|---|
| `export_behavior` | `genesyscloud_tf_export` | `general export behavior` | `Unknown` | `v1.79.0` | Active | Unresolved GUID references in list attributes can be mapped to data sources via custom resolvers. |
| `resource` | `genesyscloud_tf_export` | `exclude_attributes` | `Unknown` | `v1.79.0` | Active | Exclusions are applied when exporters are loaded, in addition to the final output pass. |
| `resource` | `genesyscloud_tf_export` | `replace_with_datasource` | `Unknown` | `v1.78.0` | Active | Accepts a resource type without a label suffix (equivalent to type::) to replace all exported instances of that type with data sources. |
| `export_behavior` | `genesyscloud_tf_export` | `enable_dependency_resolution` | `Unknown` | `v1.77.3` | Active | When using exclude_filter_resources or the default export mode, enable_dependency_resolution no longer adds depends_on blocks even when set to true. |
| `resource` | `genesyscloud_tf_export` | `max_concurrent_threads` | `v1.71.0` | `v1.77.2` | Active | The value set in configuration is now honored; provider max_clients is used only as a fallback when max_concurrent_threads is not explicitly set. |
| `resource` | `genesyscloud_tf_export` | `(resource-level behavior)` | `Unknown` | `v1.72.2` | Active | Filter attributes resource_types, include_filter_resources, exclude_filter_resources, and include_filter_resources_by_id are mutually exclusive. |
| `resource` | `genesyscloud_tf_export` | `include_filter_resources_by_id` | `v1.72.2` | `v1.72.2` | Active | Optional list of {resourceType}::{resourceId} values to export only specific resources by ID. |
| `resource` | `genesyscloud_tf_export` | `use_legacy_architect_flow_exporter` | `v1.61.0` | `v1.61.0` | Active | Optional boolean (defaults to true). When false, architect flow YAML files are downloaded as part of the export process. |
