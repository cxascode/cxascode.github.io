## CX as Code v1.89.0

[View release changelog](https://github.com/MyPureCloud/terraform-provider-genesyscloud/releases/tag/v1.89.0)

### Resources added
- genesyscloud_analytics_dataretention_settings
- genesyscloud_authorization_roles_settings
- genesyscloud_quality_miner

### Resources changed

#### genesyscloud_agentic_virtual_agent_version

Added:
- `definition.tools.inputs.fallback_to_failure` — When true on a required External input that references an undisclosed string type, an unavailable input ends the session with a 422 error instead of prompting the user. Mutually exclusive with `fallback_to_user`.
- `definition.types.error_codes` — MCP error codes handled by an `McpError` type (for example ToolError, RemoteMcpError, McpTimeout).

Removed:
- None detected.

Changed:
- `definition.tools.type` — Accepts `MCP` in addition to KnowledgeSetting, KnowledgeBase, DataAction, and ExternalA2AServer.
- `definition.types.type` — Accepts `McpError` in addition to existing type values.
- `definition.tools.context_retention_enabled` — Applies to MCP tools as well as DataAction tools.
- `definition.tools.target`, `definition.tools.output`, `definition.tools.errors`, and related nested blocks — Descriptions and validation updated for MCP tool configuration.

#### genesyscloud_architect_ivr

Added:
- None detected.

Removed:
- None detected.

Changed:
- `dnis` — Type changes from set to list (schema version 2 with automatic state upgrade). List order is preserved in configuration and state. Phone validation uses pool number rules. E.164 formatting on read keeps order stable to reduce spurious plan diffs.

#### genesyscloud_case_management_caseplan

Added:
- `stageplan` — Ordered stageplans (up to 5), each with nested `stepplan` blocks including optional `activity_type`, `workitem_settings`, and computed ids.
- `published_version` — Computed published version number (0 if never published).
- `has_draft` — Computed flag when an unpublished draft exists.

Removed:
- None detected.

Changed:
- Resource now manages the **published** caseplan: versioned field changes create or reuse a draft, apply configuration, and publish. `name` and `description` update in place without publishing.
- `default_due_duration_in_seconds` and `default_ttl_seconds` — Now optional and computed.
- `division_id`, `customer_intent`, `reference_prefix`, and `data_schema` — Descriptions clarify they cannot change after the caseplan has been published.
- Importer uses custom import logic instead of passthrough.

#### genesyscloud_integration_credential

Added:
- `fields_wo` — Write-only JSON object of credential field strings (Terraform 1.11+). Conflicts with `fields` and is never stored in plan or state.
- `fields_wo_version` — Stored version counter; increment when rotating secrets so write-only fields are sent again.

Removed:
- None detected.

Changed:
- None detected.

#### genesyscloud_journey_views

Added:
- `metrics.attribute` — Optional attribute name on journey view chart metrics.

Removed:
- None detected.

Changed:
- `metrics.aggregate` — Accepts Minimum, Maximum, Average, and Sum in addition to EventCount and CustomerCount.

#### genesyscloud_outbound_campaignrule

Added:
- `campaign_rule_conditions.parameters.for_duration` and matching `condition_groups` parameter blocks — Duration in whole seconds a condition must stay true before it evaluates (v2 processing only).

Removed:
- None detected.

Changed:
- Time-of-day fields in threshold and between operators — Documented as `HH:mm:ss`; normalization and diff suppression align `HH:mm` and fractional-second spellings with API-stored values where lossless.

#### genesyscloud_outbound_contact_list

Added:
- None detected.

Removed:
- None detected.

Changed:
- `phone_columns` — Type changes from set to list (schema version 4 with automatic state upgrade). Configuration order is preserved and drives dial priority. Plan validation rejects duplicate `column_name` values.

#### genesyscloud_quality_forms_evaluation

Added:
- `division_id` — Optional and computed division for the evaluation form.
- `weight_mode` — Computed weight mode from the API (SCALED or OFF).
- `latest_version_form_name` — Computed name of the latest published form version.

Removed:
- None detected.

Changed:
- None detected.

#### genesyscloud_quality_forms_survey

Added:
- `division_id` — Optional and computed division for the survey form.

Removed:
- None detected.

Changed:
- None detected.

#### genesyscloud_routing_queue

Added:
- `media_settings_call.auto_answer_alert_tone_seconds` and `media_settings_call.manual_answer_alert_tone_seconds` — Optional alert tone durations on call media settings (also present on chat, email, and message media blocks).

Removed:
- None detected.

Changed:
- `media_settings_call`, `media_settings_chat`, `media_settings_email`, `media_settings_message`, and `media_settings_callback` nested defaults — Schema defaults now match Genesys Cloud media-type defaults (for example call alerting 8s, chat/message/callback 30s, email 300s, email service level duration 86400000 ms).

### Runtime behavior changes

#### Plan behavior
- genesyscloud_agentic_virtual_agent_version — Plan validates `fallback_to_failure` when tool definitions are fully known: requires External source, `required = true`, undisclosed string input type, and `fallback_to_user` not true.
- genesyscloud_architect_ivr — Refresh orders `dnis` to match prior configuration where possible, reducing perpetual reorder diffs from unstable API ordering.
- genesyscloud_case_management_caseplan — CustomizeDiff enforces caseplan workflow rules; reads target the published version and surface `published_version` and `has_draft`.
- genesyscloud_integration_credential — Credentials using `fields_wo` keep an empty known `fields` map in state to avoid endless in-place updates; plan validates `fields_wo` JSON shape.
- genesyscloud_outbound_campaignrule — Time-of-day values normalize during plan; `for_duration` rejected when used with legacy `campaign_rule_conditions`.
- genesyscloud_outbound_callabletimeset — Refresh omits API-filled `callable_times.name` when configuration left name empty, avoiding post-apply consistency check failures.
- genesyscloud_outbound_contact_list — Refresh drops deprecated `callable_time_column` from state when only `callable_time_column_name` is configured, avoiding remove-null plans.
- genesyscloud_routing_queue — Optional media settings are omitted from API payloads when unset or zero so Genesys Cloud defaults apply instead of invalid zero values.
- genesyscloud_auth_division, genesyscloud_group_roles, genesyscloud_oauth_client, genesyscloud_routing_skill_group, genesyscloud_user_roles — Home division resolution uses the active org’s client configuration (per-org cache) instead of a single process-wide home division lookup.

#### Apply behavior
- genesyscloud_agentic_virtual_agent_version — Create and update send `fallback_to_failure` and MCP-related type and tool fields to the API.
- genesyscloud_architect_ivr — Failed updates call partial state so failed DNIS chunk uploads do not leave incorrect numbers in state.
- genesyscloud_case_management_caseplan — Create publishes after reconciling stageplans; updates publish versioned changes and can overwrite drafts created outside Terraform.
- genesyscloud_integration_credential — Updates driven by `fields_wo_version` re-send secrets; after write-only migration, plaintext `fields` in state are cleared.
- genesyscloud_group_roles — Role grant reconciliation errors during update fail the apply instead of being ignored (which could have removed grants incorrectly).
- genesyscloud_knowledge_category, genesyscloud_knowledge_document, genesyscloud_knowledge_document_variation, genesyscloud_knowledge_knowledgebase, genesyscloud_knowledge_label — Deletes retry for up to two minutes when bot-flow dependency tracking still references the object, after rebuilding the dependency database once.
- genesyscloud_routing_queue — Alert tone and service-level fields are only sent when explicitly set to non-zero values, avoiding unwanted callback audio-duration behavior.

#### Export behavior
- genesyscloud_agentic_virtual_agent_version — Export resolves MCP tool `target.id` references.
- genesyscloud_case_management_caseplan — Export lists only published caseplans; never-published caseplans are skipped. Resolves `stageplan.stepplan.workitem_settings.worktype_id` and treats `division_id` `*` as a literal.
- genesyscloud_outbound_campaign — Outbound campaign `script_id` always exports as a data source reference when resolvable.
- genesyscloud_speechandtextanalytics_settings — Export resolves `default_program_id` to `genesyscloud_speechandtextanalytics_program`.
- genesyscloud_speechandtextanalytics_topic references — Topic GUID resolution to a data source reference only runs when `genesyscloud_speechandtextanalytics_topic` is listed in `replace_with_datasource`; otherwise GUIDs stay unresolved.
- genesyscloud_quality_forms_evaluation — Export resolves `division_id`; omits computed `weight_mode` and `latest_version_form_name`.
- genesyscloud_integration_credential — Export excludes write-only credential attributes so generated config uses standard `fields` placeholders.

### Resources removed
- genesyscloud_case_management_caseplan_create_version
- genesyscloud_case_management_caseplan_publish
- genesyscloud_case_management_stageplan
- genesyscloud_case_management_stepplan

### Data sources added
- genesyscloud_flow_validation

### Data sources changed
None detected.

### Data sources removed
- genesyscloud_case_management_stageplan
- genesyscloud_case_management_stepplan

### Provider configuration changes
None detected.

### Upgrade impact
- Case management is a breaking workflow change: migrate stageplan and stepplan configuration into `genesyscloud_case_management_caseplan` `stageplan` blocks and remove the standalone caseplan publish, create-version, stageplan, and stepplan resources and data sources.
- Agentic virtual agent version configurations can add MCP tools, McpError types, and `fallback_to_failure`; review plans for new validation on those inputs.
- `genesyscloud_architect_ivr` and `genesyscloud_outbound_contact_list` state upgrades automatically for `dnis` and `phone_columns` list types; expect one-time plan noise until state matches list semantics.
- Integration credentials can move secrets to `fields_wo` / `fields_wo_version` (Terraform 1.11+); increment `fields_wo_version` on rotation.
- Routing queue and outbound campaign rule users should see fewer false-positive plans and fewer API rejections on omitted media settings and time formats.
- Knowledge base deletes may take longer while dependency tracking catches up, but are less likely to fail immediately on transient bot-flow references.
- Three new provider resources (analytics data retention, authorization roles settings, quality miner) appear; adopt only if your configuration needs them.

---

_Generated by AI from source-code diffs. Review against [provider documentation](https://registry.terraform.io/providers/MyPureCloud/genesyscloud/1.89.0/docs) before making upgrade decisions._
