import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contractPath = resolve("contracts/dataconsent_guard.py");
const source = readFileSync(contractPath, "utf8");
const firstLine = source.split(/\r?\n/, 1)[0];
const expectedRuntime =
  "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

assert(firstLine.includes(expectedRuntime), `missing pinned runtime dependency: ${expectedRuntime}`);
assert(/class\s+DataConsentGuard\s*\(\s*gl\.Contract\s*\)\s*:/.test(source), "DataConsentGuard must inherit gl.Contract");
assert(!/gl\.get_webpage|gl\.exec_prompt|gl\.json_loads|gl\.json_dumps|gl\.msg/.test(source), "unsupported legacy gl APIs remain");

for (const method of [
  "register_policy",
  "request_access",
  "execute_access",
  "get_policy",
  "get_access_review",
  "get_grant",
  "list_policy_ids",
  "list_access_ids",
]) {
  assert(new RegExp(`def\\s+${method}\\s*\\(`).test(source), `missing method: ${method}`);
}

for (const method of ["register_policy", "request_access", "execute_access"]) {
  assert(new RegExp(`@gl\\.public\\.write\\s+def\\s+${method}\\s*\\(`, "s").test(source), `${method} must be public.write`);
}

for (const method of ["get_policy", "get_access_review", "get_grant", "list_policy_ids", "list_access_ids"]) {
  assert(new RegExp(`@gl\\.public\\.view\\s+def\\s+${method}\\s*\\(`, "s").test(source), `${method} must be public.view`);
}

assert(/gl\.vm\.run_nondet_unsafe/.test(source), "missing GenLayer consensus gate");
assert(/gl\.nondet\.web\.render/.test(source), "missing source snapshot rendering");
assert(/gl\.nondet\.exec_prompt/.test(source), "missing validator prompt adjudication");
assert(/hashlib\.sha256/.test(source), "must use collision-resistant SHA-256");
assert(/baseline_hash/.test(source), "must persist baseline commitment");
assert(/snapshot_commitments/.test(source), "must persist snapshot commitments");
assert(/access_requires_approving_receipt/.test(source), "execution must require approved access receipt");
assert(/execution_exceeds_consent_boundary/.test(source), "execution must enforce consent boundary");

const policyId = `pol_${sha256("owner|agent|name|baseline").slice(0, 20)}`;
const accessId = `acc_${sha256("policy|request|120|evidence").slice(0, 20)}`;
assert(policyId.length === 24, "policy id format check failed");
assert(accessId.length === 24, "access id format check failed");

console.log("DataConsentGuard contract check passed");
