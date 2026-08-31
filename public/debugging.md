## Debugging

Two levels of debugging are available. Both produce JSON output for easier parsing and analysis.

### 1. Terraform / Provider Logging (`TF_LOG`)

Captures Terraform core and provider messages.

#### Enable Logging

#### macOS / Linux

```bash
export TF_LOG="JSON"
export TF_LOG_PATH="./tf_json.log"
```

#### Windows (PowerShell)

```powershell
$env:TF_LOG="JSON"
$env:TF_LOG_PATH=".\tf_json.log"
```

#### Disable Logging

**macOS / Linux**

```bash
unset TF_LOG
unset TF_LOG_PATH
```

**Windows (PowerShell)**

```powershell
Remove-Item Env:TF_LOG
Remove-Item Env:TF_LOG_PATH
```

---

### 2. Genesys Cloud SDK/API Logging (`sdk_debug`)

Captures API requests and responses made by the Genesys Cloud SDK.

#### Enable Logging

In your `genesyscloud` provider block, add or update the `sdk_debug` and `sdk_debug_format` attributes:

```hcl
provider "genesyscloud" {
  ...
  sdk_debug        = true
  sdk_debug_format = "Json"
}
```

#### Disable Logging

Revert the provider block by disabling or removing `sdk_debug` and `sdk_debug_format` attributes:

```hcl
provider "genesyscloud" {
  ...
  #sdk_debug         = true
  #sdk_debug_format = "Json"
}
```

---

### Choosing the Right Debug Level

| Debug Level | Purpose |
|-------------|---------|
| `TF_LOG` | Troubleshoot Terraform execution, provider behavior, and resource processing |
| `sdk_debug` | Troubleshoot Genesys Cloud API requests, responses, and SDK interactions |

For complex issues, enabling both logging methods can provide complete visibility into Terraform execution and the underlying API activity.

When both are enabled, `sdk_debug` output will also be written to the `TF_LOG` file.
