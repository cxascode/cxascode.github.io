#!/usr/bin/env node
import { generateSiteUpdates, parseArgs } from "./lib/site-updates-generate.mjs";

const result = await generateSiteUpdates(parseArgs());
if (result.reason === "manual-entry-exists") {
  process.exitCode = 0;
}
