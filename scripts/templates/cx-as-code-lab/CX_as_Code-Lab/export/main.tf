resource "genesyscloud_tf_export" "export" {
  directory                    = "./genesyscloud"
  enable_dependency_resolution = true
  export_format                = "hcl"
  #exclude_attributes           = ["resource_type.attribute"]
  exclude_attributes           = [
    
  ]
  include_state_file           = false
  #include_filter_resources     = ["resource_type::Resource name regex"]
  include_filter_resources     = [

  ]
  log_permission_errors        = true
  #replace_with_datasource      = ["resource_type::Resource name regex"]
  replace_with_datasource      = [

  ]
  split_files_by_resource      = false
  use_legacy_architect_flow_exporter = false
}
