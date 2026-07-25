## CX as Code v1.84.2

[View release changelog](https://github.com/MyPureCloud/terraform-provider-genesyscloud/releases/tag/v1.84.2)

### Resources added
None detected.

### Resources changed

#### genesyscloud_architect_user_prompt

Added:
- None detected.

Removed:
- None detected.

Changed:
- `resources` — No longer computed from the API; include this block in configuration when you want Terraform to manage TTS audio resources for the prompt.

#### genesyscloud_business_rules_decision_table

Added:
- None detected.

Removed:
- None detected.

Changed:
- `input_columns.defaults.value` — Now computed as well as optional so unused default fields no longer cause plan/apply inconsistencies when another mutually exclusive default is set.
- `input_columns.defaults.values` — Same computed behavior for string-list defaults; documentation clarifies mutual exclusivity with `value` and `special`.
- `input_columns.defaults.special` — Same computed behavior for special-value defaults; documentation clarifies mutual exclusivity with `value` and `values`.
- `output_columns.defaults.value` — Same computed behavior as input column defaults.
- `output_columns.defaults.values` — Same computed behavior as input column defaults.
- `output_columns.defaults.special` — Same computed behavior as input column defaults.
- `description` — Read now preserves a null description from the API instead of coercing it to an empty string, avoiding null-to-empty-string plan inconsistencies.
- Create and update timeouts — Default create and update timeouts are now 120 minutes (delete remains 8 minutes, read remains 8 minutes).
- Create behavior — Failed creates roll back partially created decision tables even after a create timeout, and timeout errors suggest increasing the create timeout in a `timeouts` block.
- Create and update behavior — When adding rows, a duplicate-row 409 at the expected row index (for example after a gateway 504 timeout that still created the row) is treated as a successful add instead of failing apply.

#### genesyscloud_business_rules_schema

Added:
- None detected.

Removed:
- None detected.

Changed:
- `description` — Read now preserves a null description from the API instead of coercing it to an empty string, avoiding null-to-empty-string plan inconsistencies.

#### genesyscloud_case_management_caseplan

Added:
- None detected.

Removed:
- None detected.

Changed:
- Export behavior — `customer_intent.id` references now resolve to `genesyscloud_intents_customerintents` instead of `genesyscloud_customer_intent`.

#### genesyscloud_knowledge_knowledgebase

Added:
- `content_search_enabled` — Optional flag to enable article content search when creating the knowledge base (defaults to `true`). Changing this value after creation forces replacement.

Removed:
- None detected.

Changed:
- None detected.

#### genesyscloud_routing_email_domain

Added:
- `imap_settings` — Optional block to configure the IMAP server integration used to ingest inbound emails; populated from the API when present.
- `imap_settings.integration_id` — IMAP server integration ID to associate with the domain.
- `imap_settings.status` — Computed IMAP server status from the API.
- `graph_api_settings` — Optional block to configure the Graph API integration used for inbound and outbound email processing; populated from the API when present.
- `graph_api_settings.integration_id` — Graph API server integration ID to associate with the domain.
- `graph_api_settings.status` — Computed Graph API server status from the API.

Removed:
- None detected.

Changed:
- Create and update behavior — `imap_settings` and `graph_api_settings` are now read from the API and can be patched on create and update alongside existing mail-from and SMTP settings.
- Export behavior — `imap_settings.integration_id` and `graph_api_settings.integration_id` resolve to `genesyscloud_integration` references; blocks without an integration ID are omitted from export.

#### genesyscloud_routing_email_route

Added:
- `signature` — Optional block to configure a canned-response signature appended to outbound emails sent via the route.
- `signature.enabled` — Toggle to enable the signature on email send.
- `signature.canned_response_id` — ID of the email signature canned response to use.
- `signature.always_included` — Whether the signature is included on every email or only the first email in a chain.
- `signature.inclusion_type` — When to include the signature; valid values are `Draft`, `Send`, and `SendOnce`.

Removed:
- None detected.

Changed:
- Export behavior — `signature.canned_response_id` resolves to `genesyscloud_responsemanagement_response` references.

### Resources removed
None detected.

### Data sources added
None detected.

### Data sources changed
None detected.

### Data sources removed
None detected.

### Provider configuration changes
None detected.

### Upgrade impact
- Existing configurations are likely unaffected unless you adopt the new routing email, knowledge base, or email route attributes.
- `genesyscloud_business_rules_decision_table` and `genesyscloud_business_rules_schema` users with null descriptions should see fewer spurious plan diffs; large decision tables benefit from longer default create/update timeouts and more resilient row-add handling during apply.
- Setting `content_search_enabled` on an existing `genesyscloud_knowledge_knowledgebase` to a value different from the org setting will force replacement because the attribute is create-only.
- Re-export `genesyscloud_case_management_caseplan` resources if you rely on resolved references for `customer_intent.id`.

---

_Generated by AI from source-code diffs. Review against [provider documentation](https://registry.terraform.io/providers/MyPureCloud/genesyscloud/1.84.2/docs) before making upgrade decisions._
