resource "genesyscloud_tf_export" "export" {
  directory                    = "./genesyscloud"
  enable_dependency_resolution = true
  export_format                = "hcl"
  #exclude_attributes           = ["resource_type.attribute"]
  exclude_attributes           = []
  include_state_file           = false
  #exclude_filter_resources     = ["resource_type::Resource name regex"]
  exclude_filter_resources     = []
  log_permission_errors        = true
  #replace_with_datasource      = ["resource_type::Resource name regex"]
  replace_with_datasource      = [
    "genesyscloud_integration_credential::.*",
    "genesyscloud_telephony_providers_edges_edge_group::.*",
    "genesyscloud_telephony_providers_edges_trunkbasesettings::.*"
  ]
  split_files_by_resource      = false
  use_legacy_architect_flow_exporter = false
}
