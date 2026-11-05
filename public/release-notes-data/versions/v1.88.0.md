## CX as Code v1.88.0

[View release changelog](https://github.com/MyPureCloud/terraform-provider-genesyscloud/releases/tag/v1.88.0)

### Resources added
None detected.

### Resources changed

#### genesyscloud_agentic_virtual_agent_version

Added:
- `definition.tools.context_retention_enabled` — Optional boolean on DataAction tools: whether the tool call and result stay in conversation context when older turns are pruned for the model context window.
- `definition.tools.inputs.dependency_only` — Optional boolean: marks an input as dependency-only (not sent to the underlying service at runtime). Required as `true` for inputs on Knowledge tools (KnowledgeSetting / KnowledgeBase).
- `context_retention_enabled_presence` — Computed string that records, per tool, whether `context_retention_enabled` was explicitly set in configuration (used so omitted nested booleans are not treated the same as `false` during plan).

Removed:
- None detected.

Changed:
- `definition.tools.inputs` — Description updated: inputs apply to DataAction and Knowledge tools; Knowledge tool inputs must come from a prior tool output with `dependency_only = true`.
- `definition.tools.input_validation` — Description updated: validation applies to DataAction and Knowledge tools, not DataAction only.

### Runtime behavior changes

#### Plan behavior
- genesyscloud_agentic_virtual_agent_version — Plan distinguishes omitting `context_retention_enabled` on a DataAction tool from setting it to `false`, and sends omitted values to the API as unset rather than false. Refresh ignores consistency-check noise for omitted `context_retention_enabled` values and the computed presence marker.
- genesyscloud_task_management_worktype — `open_status_default` and `closed_status_auto_terminate` are applied only when explicitly present in configuration, not when values were read back from the API into state. Diff suppression for `disable_default_status_creation` applies only after the resource exists, so new creates still honor the attribute from configuration (including exported configs that set it to `true`).

#### Apply behavior
- genesyscloud_agentic_virtual_agent_version — Create and update map tool definitions using raw configuration so optional `context_retention_enabled` and `dependency_only` values match what you declared.
- genesyscloud_task_management_worktype — When `disable_default_status_creation` is `true`, create and update skip configuring auto-created Open/Closed status settings. If post-create status configuration fails, the provider deletes the new worktype and clears the resource ID instead of leaving a partial create in state.

#### Export behavior
- genesyscloud_agentic_virtual_agent_version — Export restores nullable `context_retention_enabled` on tools (omits the attribute when the API did not set it) and reuses the version listing cache when resolving `agent_id`.
- genesyscloud_greeting_user — User greeting discovery runs concurrently (when the SDK client pool is enabled), paginates per user, skips users where greeting list calls return 403, and lists users through the same path as the user resource exporter.
- genesyscloud_outbound_callabletimeset — When the export filter lists specific resource IDs (`genesyscloud_outbound_callabletimeset::<id>`), enumeration can fetch those IDs directly instead of listing every callable time set in the org.
- genesyscloud_outbound_callanalysisresponseset — Same ID-filtered fetch behavior for named response sets.
- genesyscloud_outbound_contact_list — Same ID-filtered fetch behavior for named contact lists.
- genesyscloud_outbound_contactlistfilter — Same ID-filtered fetch behavior for named contact list filters.
- genesyscloud_outbound_dnclist — Same ID-filtered fetch behavior for named DNC lists.
- genesyscloud_routing_queue — Same ID-filtered fetch behavior for named queues (for example when resolving queue members referenced elsewhere).
- genesyscloud_responsemanagement_response — `asset_ids` reference resolution uses the `genesyscloud_responsemanagement_responseasset` resource type so exported asset links resolve correctly.
- genesyscloud_task_management_workbin — Workbin query pagination no longer sends an empty `after` cursor on the first page, fixing export enumeration when the API rejects an empty cursor.
- genesyscloud_task_management_workitem — Workbin and workitem query pagination uses the same first-page cursor fix during export-related listing.
- genesyscloud_task_management_worktype — Worktype query pagination uses the same first-page cursor fix. Export omits `open_status_default` and `closed_status_auto_terminate` (those settings are represented on `genesyscloud_task_management_worktype_status` resources as `default` and `auto_terminate_workitem`).
- genesyscloud_user — When the export filter lists specific user IDs, the exporter can load only those users (with the same expands and inactive/deleted filtering as full listing) instead of paging through every user in the org.

### Resources removed
None detected.

### Data sources added
None detected.

### Data sources changed
None detected.

### Data sources removed
None detected.

### Provider configuration changes
- HTTP clients used for provider file operations (URL downloads, presigned uploads, export file downloads, S3 reads, business rules decision table CSV transfer, and integration action draft uploads) now honor the provider `proxy` block and standard `HTTP(S)_PROXY` environment variables where applicable.

### Upgrade impact
- Most configurations are unaffected unless you manage agentic virtual agent versions, task management worktypes (especially exported configs with `disable_default_status_creation`, `open_status_default`, or `closed_status_auto_terminate`), or run large exports that touch greetings, users, outbound objects, or routing queues by ID filter.
- Agentic virtual agent version plans may change when tools previously omitted `context_retention_enabled`; review DataAction tools and add Knowledge tool `dependency_only` inputs where required.
- Task management worktype updates should stop re-applying default Open/Closed status settings that were only present in refreshed state, and failed creates are less likely to leave orphaned worktypes.
- Filtered exports that name specific IDs can run faster and with fewer list API calls for supported outbound, queue, and user dependencies.
- Environments that require an HTTP proxy for non-SDK downloads should see more consistent behavior without changing Terraform configuration beyond upgrading the provider.

---

_Generated by AI from source-code diffs. Review against [provider documentation](https://registry.terraform.io/providers/MyPureCloud/genesyscloud/1.88.0/docs) before making upgrade decisions._
