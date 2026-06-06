# CX as Code Terraform Provider Resource Attribute Index

This index is generated from per-release provider diffs. `Introduced` is `Unknown` when the item existed before the generated history starts.

| Type | Resource / Data Source | Attribute | Introduced | Last Updated | Status | Notes |
|---|---|---|---:|---:|---|---|
| `data_source` | `genesyscloud_flow` | `(resource-level behavior)` | `Unknown` | `v1.61.0` | Active | When multiple flows share the same name, lookup uses type to select the matching flow. |
| `data_source` | `genesyscloud_flow` | `type` | `Unknown` | `v1.61.0` | Active | Terraform emits a warning when type is omitted, noting that it will become required in a future release. |
| `export_behavior` | `genesyscloud_architect_flow` | `general export behavior` | `Unknown` | `v1.61.0` | Active | When use_legacy_architect_flow_exporter is false on genesyscloud_tf_export, flow YAML files are downloaded into an architect_flows subdirectory with filenames based on flow name, type, and ID. |
| `export_behavior` | `genesyscloud_integration_action` | `config_response.translation_map_defaults` | `Unknown` | `v1.60.0` | Active | Export now preserves zero-value entries in translation_map_defaults. |
| `export_behavior` | `genesyscloud_integration_credential` | `general export behavior` | `Unknown` | `v1.60.0` | Active | Exported block labels now use the format Integration-{integration_name} instead of {integration_name}_{credential_name}. |
| `export_behavior` | `genesyscloud_organization_authentication_settings` | `timeout_settings.idle_token_timeout_seconds` | `Unknown` | `v1.61.0` | Active | Export now preserves zero values for idle_token_timeout_seconds. |
| `export_behavior` | `genesyscloud_user` | `general export behavior` | `Unknown` | `v1.61.0` | Active | Bulk export skips users that lack an ID or email address. |
| `export_behavior` | `provider export` | `general export behavior` | `Unknown` | `v1.61.0` | Active | Export no longer substitutes unresolvable attributes on data source blocks with ${var...} placeholders. |
| `resource` | `genesyscloud_group` | `calls_enabled` | `v1.60.0` | `v1.60.0` | Active | Optional boolean (defaults to true) that controls whether calls can be placed to the group. |
| `resource` | `genesyscloud_responsemanagement_response` | `library_ids` | `Unknown` | `v1.61.0` | Active | Attribute type changed from list to set; order is no longer significant and duplicate values are not allowed. |
| `resource` | `genesyscloud_routing_email_route` | `(resource-level behavior)` | `Unknown` | `v1.60.0` | Active | Read and refresh retries when the API returns empty or missing route lists instead of clearing the resource from state. |
| `resource` | `genesyscloud_routing_queue` | `auto_dial_delay_seconds` | `Unknown` | `v1.61.0` | Removed | Removed from shared media settings blocks such as media_settings_chat, media_settings_message, and media_settings_email. |
| `resource` | `genesyscloud_routing_queue` | `auto_end_delay_seconds` | `Unknown` | `v1.61.0` | Removed | Removed from shared media settings blocks such as media_settings_chat, media_settings_message, and media_settings_email. |
| `resource` | `genesyscloud_routing_queue` | `canned_response_library_mode` | `Unknown` | `v1.61.0` | Active | Now computed; Terraform populates the value from the API when it is not set in configuration. |
| `resource` | `genesyscloud_routing_queue` | `enable_auto_dial_and_end` | `Unknown` | `v1.61.0` | Removed | Removed from shared media settings blocks such as media_settings_chat, media_settings_message, and media_settings_email. |
| `resource` | `genesyscloud_routing_queue` | `media_settings_callback.mode` | `Unknown` | `v1.61.0` | Active | No longer computed; set this explicitly in configuration if you need a specific callback mode. |
| `resource` | `genesyscloud_routing_queue` | `media_settings_email` | `Unknown` | `v1.61.0` | Active | Now uses the shared media settings schema instead of an email-specific schema that included deprecated auto-dial fields. |
| `resource` | `genesyscloud_routing_queue` | `media_settings_message` | `Unknown` | `v1.60.0` | Active | Message media settings are now mapped with message-specific read and write logic, including sub_type_settings and service-level fields. |
| `resource` | `genesyscloud_telephony_providers_edges_phonebasesettings` | `line_base.station_persistent_webrtc_enabled` | `v1.61.0` | `v1.61.0` | Active | Optional boolean (defaults to false) that controls station persistent WebRTC on line properties. |
| `resource` | `genesyscloud_telephony_providers_edges_site` | `outbound_routes` | `Unknown` | `v1.61.0` | Removed | Use genesyscloud_telephony_providers_edges_site_outbound_route resources to manage site outbound routes instead. |
| `resource` | `genesyscloud_telephony_providers_edges_site_outbound_route` | `(resource-level behavior)` | `Unknown` | `v1.61.0` | Active | Resource operations no longer require the ENABLE_STANDALONE_OUTBOUND_ROUTES environment variable. |
| `resource` | `genesyscloud_tf_export` | `(resource-level behavior)` | `Unknown` | `v1.61.0` | Active | Export can complete with warnings for non-fatal issues instead of treating all diagnostics as hard failures. |
| `resource` | `genesyscloud_tf_export` | `use_legacy_architect_flow_exporter` | `v1.61.0` | `v1.61.0` | Active | Optional boolean (defaults to true). When false, architect flow YAML files are downloaded as part of the export process. |
| `state_behavior` | `genesyscloud_routing_queue` | `general state behavior` | `Unknown` | `v1.61.0` | Active | State schema upgraded to version 2 with an automatic upgrader from version 1. |
| `state_behavior` | `genesyscloud_telephony_providers_edges_site` | `general state behavior` | `Unknown` | `v1.61.0` | Active | State schema upgraded to version 2 with an automatic upgrader that removes outbound_routes from stored state. |
