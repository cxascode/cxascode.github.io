import {
  printClassificationMismatch,
  resolveLatestProviderVersion,
  verifyAllResourceClassifications,
  verifyResourceClassificationForVersion,
} from "./lib/verify-resource-classification.mjs";

const verifyAll = process.argv.includes("--all");
const version = verifyAll ? "" : await resolveLatestProviderVersion();

if (verifyAll) {
  const reports = await verifyAllResourceClassifications();
  let failed = false;

  for (const report of reports) {
    if (!report.result.ok) {
      failed = true;
      console.error(`\nverify failed for v${report.version} (${report.artifactPath}):`);
      for (const mismatch of report.result.mismatches) {
        printClassificationMismatch(mismatch);
      }
    }
  }

  if (failed) process.exit(1);
  console.log(`verify-resource-classification passed for ${reports.length} version(s).`);
} else {
  const report = await verifyResourceClassificationForVersion(version);
  console.log(`Verified ${report.artifactPath} against ${report.providerRoot}`);

  if (!report.result.ok) {
    for (const mismatch of report.result.mismatches) {
      printClassificationMismatch(mismatch);
    }
    process.exit(1);
  }

  console.log(`verify-resource-classification passed for v${report.version}.`);
}
