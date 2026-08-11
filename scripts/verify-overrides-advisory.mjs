import {
  printClassificationMismatch,
  resolveLatestProviderVersion,
  verifyResourceClassificationForVersion,
} from "./lib/verify-resource-classification.mjs";

const report = await verifyResourceClassificationForVersion(await resolveLatestProviderVersion());

console.log(`Compared ${report.artifactPath} against ${report.providerRoot}`);

if (!report.result.ok) {
  for (const mismatch of report.result.mismatches) {
    printClassificationMismatch(mismatch);
  }
  console.error(
    "\nverify-overrides-advisory failed: run node scripts/generate-resource-classification.mjs"
  );
  process.exit(1);
}

console.log(`verify-overrides-advisory passed for v${report.version}.`);
