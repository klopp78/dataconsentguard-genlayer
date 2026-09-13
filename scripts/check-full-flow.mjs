import assert from "node:assert/strict";

const walletAddress = "0x1111111111111111111111111111111111111111";
const agentAddress = "0x2222222222222222222222222222222222222222";
const policyId = "pol_9cfe7c9b23f8428f2d3a";
const accessId = "acc_725bf671258bf0427c5e";

class StudioFlowSimulator {
  constructor() {
    this.calls = [];
    this.policies = new Map();
    this.accessReviews = new Map();
    this.grants = new Map();
  }

  async writeContract({ functionName, args }) {
    this.calls.push({ kind: "write", functionName, args });
    if (functionName === "register_policy") {
      const [name, agent, purpose, maxRecords, consentUrl, licenseUrl, manifestUrl] = args;
      assert.equal(name, "Support agent data room");
      assert.equal(agent, agentAddress);
      assert.match(purpose, /customer support/i);
      assert.equal(maxRecords, "500");
      assert.match(consentUrl, /consent-terms\.md$/);
      assert.match(licenseUrl, /data-license\.md$/);
      assert.match(manifestUrl, /data-manifest\.md$/);
      this.policies.set(policyId, {
        policy_id: policyId,
        owner: walletAddress.toLowerCase(),
        agent_wallet: agent,
        max_records: 500,
        remaining_records: 500,
        baseline: { baseline_hash: "baselinehash" },
        access_ids: [],
      });
      return "0xregisterpolicy";
    }
    if (functionName === "request_access") {
      const [submittedPolicyId, requestKey, records, requestUrl, consentProofUrl, licenseProofUrl] = args;
      assert.equal(submittedPolicyId, policyId);
      assert.equal(requestKey, "support-answer-batch-1");
      assert.equal(records, "120");
      assert.match(requestUrl, /access-request\.md$/);
      assert.match(consentProofUrl, /consent-proof\.md$/);
      assert.match(licenseProofUrl, /license-proof\.md$/);
      const policy = this.policies.get(policyId);
      assert.ok(policy, "policy must exist before access review");
      this.accessReviews.set(accessId, {
        access_id: accessId,
        policy_id: policyId,
        state: "approved",
        execution_ready: true,
        authorized_records: 120,
        evidence_bundle_hash: "a".repeat(64),
      });
      policy.access_ids.push(accessId);
      return "0xrequestaccess";
    }
    if (functionName === "execute_access") {
      const [submittedPolicyId, submittedAccessId] = args;
      assert.equal(submittedPolicyId, policyId);
      assert.equal(submittedAccessId, accessId);
      const review = this.accessReviews.get(accessId);
      assert.equal(review?.state, "approved");
      const policy = this.policies.get(policyId);
      assert.ok(policy.remaining_records >= review.authorized_records);
      policy.remaining_records -= review.authorized_records;
      review.state = "granted";
      review.execution_ready = false;
      this.grants.set(accessId, {
        access_id: accessId,
        policy_id: policyId,
        granted_records: 120,
        remaining_records: 380,
        status: "granted",
      });
      return "0xexecuteaccess";
    }
    throw new Error(`Unexpected write ${functionName}`);
  }

  async waitForTransactionReceipt({ hash }) {
    this.calls.push({ kind: "receipt", hash });
    if (hash === "0xregisterpolicy") return { txExecutionResult: policyId };
    if (hash === "0xrequestaccess") return { txExecutionResult: accessId };
    if (hash === "0xexecuteaccess") return { txExecutionResult: "grant accepted" };
    throw new Error(`Unknown transaction ${hash}`);
  }

  async readContract({ functionName, args }) {
    this.calls.push({ kind: "read", functionName, args });
    if (functionName === "get_policy") return JSON.stringify(this.policies.get(args[0]) ?? {});
    if (functionName === "get_access_review") return JSON.stringify(this.accessReviews.get(args[0]) ?? {});
    if (functionName === "get_grant") return JSON.stringify(this.grants.get(args[0]) ?? {});
    throw new Error(`Unexpected read ${functionName}`);
  }
}

function receiptString(receipt, pattern, label) {
  const value = Object.values(receipt).find(
    (candidate) => typeof candidate === "string" && pattern.test(candidate),
  );
  assert.ok(value, `Accepted ${label} receipt must contain its returned identifier`);
  return value;
}

async function runFullFlow(client) {
  const policyHash = await client.writeContract({
    functionName: "register_policy",
    args: [
      "Support agent data room",
      agentAddress,
      "Answer customer support questions using consented helpdesk tickets only.",
      "500",
      "https://github.com/klopp78/dataconsentguard-genlayer/blob/main/examples/consent-terms.md",
      "https://github.com/klopp78/dataconsentguard-genlayer/blob/main/examples/data-license.md",
      "https://github.com/klopp78/dataconsentguard-genlayer/blob/main/examples/data-manifest.md",
    ],
  });
  const policyReceipt = await client.waitForTransactionReceipt({ hash: policyHash });
  const returnedPolicyId = receiptString(policyReceipt, /^pol_[a-f0-9]{20}$/, "policy");
  const policy = JSON.parse(await client.readContract({
    functionName: "get_policy",
    args: [returnedPolicyId],
  }));
  assert.equal(policy.remaining_records, 500);

  const accessHash = await client.writeContract({
    functionName: "request_access",
    args: [
      returnedPolicyId,
      "support-answer-batch-1",
      "120",
      "https://github.com/klopp78/dataconsentguard-genlayer/blob/main/examples/access-request.md",
      "https://github.com/klopp78/dataconsentguard-genlayer/blob/main/examples/consent-proof.md",
      "https://github.com/klopp78/dataconsentguard-genlayer/blob/main/examples/license-proof.md",
    ],
  });
  const accessReceipt = await client.waitForTransactionReceipt({ hash: accessHash });
  const returnedAccessId = receiptString(accessReceipt, /^acc_[a-f0-9]{20}$/, "access");
  const accessReview = JSON.parse(await client.readContract({
    functionName: "get_access_review",
    args: [returnedAccessId],
  }));
  assert.equal(accessReview.state, "approved");
  assert.equal(accessReview.execution_ready, true);

  const grantHash = await client.writeContract({
    functionName: "execute_access",
    args: [returnedPolicyId, returnedAccessId],
  });
  await client.waitForTransactionReceipt({ hash: grantHash });
  const grant = JSON.parse(await client.readContract({
    functionName: "get_grant",
    args: [returnedAccessId],
  }));
  assert.equal(grant.status, "granted");
  assert.equal(grant.remaining_records, 380);
  return { returnedPolicyId, returnedAccessId };
}

const simulator = new StudioFlowSimulator();
const outcome = await runFullFlow(simulator);
assert.deepEqual(
  simulator.calls.map((call) => `${call.kind}:${call.functionName ?? call.hash}`),
  [
    "write:register_policy",
    "receipt:0xregisterpolicy",
    "read:get_policy",
    "write:request_access",
    "receipt:0xrequestaccess",
    "read:get_access_review",
    "write:execute_access",
    "receipt:0xexecuteaccess",
    "read:get_grant",
  ],
);
assert.equal(outcome.returnedPolicyId, policyId);
assert.equal(outcome.returnedAccessId, accessId);
console.log("DataConsentGuard simulated full-flow check passed");
