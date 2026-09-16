import assert from "node:assert/strict";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const contractAddress = process.env.NEXT_PUBLIC_DATA_CONSENT_GUARD_CONTRACT_ADDRESS;
const privateKey = process.env.DATA_CONSENT_GUARD_PRIVATE_KEY;
const agentPrivateKey = process.env.DATA_CONSENT_GUARD_AGENT_PRIVATE_KEY ?? privateKey;
const exampleBase =
  "https://github.com/klopp78/dataconsentguard-genlayer/blob/f6a0287ccf1c37b234e83c86f8f04d4e0e28d1d9/examples";

if (!contractAddress || !privateKey || !agentPrivateKey) {
  throw new Error(
    "Live flow check requires NEXT_PUBLIC_DATA_CONSENT_GUARD_CONTRACT_ADDRESS, DATA_CONSENT_GUARD_PRIVATE_KEY, and optionally DATA_CONSENT_GUARD_AGENT_PRIVATE_KEY.",
  );
}

const owner = createAccount(privateKey);
const agent = createAccount(agentPrivateKey);
const readClient = createClient({ chain: studionet });
const ownerClient = createClient({ chain: studionet, account: owner });
const agentClient = createClient({ chain: studionet, account: agent });

function assertId(value, pattern, label) {
  assert.match(value, pattern, `${label} id format`);
  return value;
}

function receiptId(receipt, pattern, label) {
  const seen = new Set();
  const candidates = [];
  const collect = (value) => {
    if (value === null || value === undefined || seen.has(value)) return;
    if (typeof value === "object") seen.add(value);
    if (typeof value === "string") {
      candidates.push(value);
      const decoded = decodeHex(value);
      if (decoded) candidates.push(decoded);
      try {
        collect(JSON.parse(value));
      } catch {
        // Plain receipt text is expected.
      }
      return;
    }
    if (value instanceof Uint8Array) {
      candidates.push(new TextDecoder().decode(value));
      return;
    }
    if (typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(receipt);
  const id = candidates.map((candidate) => candidate.match(pattern)?.[0]).find(Boolean);
  assert.ok(id, `finalized ${label} transaction exposed returned id`);
  return id;
}

function decodeHex(value) {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;
  const bytes = value
    .slice(2)
    .match(/.{1,2}/g)
    ?.map((byte) => Number.parseInt(byte, 16));
  return bytes ? new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\0/g, "") : null;
}

async function writeAndWait(client, functionName, args) {
  const hash = await client.writeContract({
    address: contractAddress,
    functionName,
    args,
    value: BigInt(0),
    leaderOnly: false,
  });
  const receipt = await readClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 3000,
    retries: 120,
    fullTransaction: true,
  });
  assert.notEqual(receipt.txExecutionResultName, "FINISHED_WITH_ERROR", `${functionName} finalized without GenVM error`);
  return { hash, receipt };
}

async function readRecord(functionName, id) {
  const result = await readClient.readContract({
    address: contractAddress,
    functionName,
    args: [id],
    jsonSafeReturn: true,
    leaderOnly: false,
    transactionHashVariant: "latest-final",
  });
  assert.equal(typeof result, "string", `${functionName} returns JSON string`);
  assert.notEqual(result.length, 0, `${functionName} returns a stored record`);
  return JSON.parse(result);
}

const policyTx = await writeAndWait(ownerClient, "register_policy", [
  `Support agent data room ${Date.now()}`,
  agent.address,
  "Answer customer support questions using consented helpdesk tickets only.",
  "500",
  `${exampleBase}/consent-terms.md`,
  `${exampleBase}/data-license.md`,
  `${exampleBase}/data-manifest.md`,
]);
const policyId = assertId(receiptId(policyTx.receipt, /pol_[a-f0-9]{20}/, "policy"), /^pol_[a-f0-9]{20}$/, "policy");
const policy = await readRecord("get_policy", policyId);
assert.equal(policy.policy_id, policyId);
assert.equal(policy.agent_wallet, agent.address.toLowerCase());
assert.equal(policy.remaining_records, 500);

const accessTx = await writeAndWait(agentClient, "request_access", [
  policyId,
  `support-answer-batch-${Date.now()}`,
  "120",
  `${exampleBase}/access-request.md`,
  `${exampleBase}/consent-proof.md`,
  `${exampleBase}/license-proof.md`,
]);
const accessId = assertId(receiptId(accessTx.receipt, /acc_[a-f0-9]{20}/, "access"), /^acc_[a-f0-9]{20}$/, "access");
const accessReview = await readRecord("get_access_review", accessId);
assert.equal(accessReview.policy_id, policyId);
assert.equal(accessReview.access_id, accessId);
assert.ok(["approved", "blocked", "needs_review"].includes(accessReview.consensus_result.decision));

if (accessReview.state === "approved") {
  await writeAndWait(ownerClient, "execute_access", [policyId, accessId]);
  const grant = await readRecord("get_grant", accessId);
  assert.equal(grant.status, "granted");
  assert.equal(grant.access_id, accessId);
}

console.log(JSON.stringify({ contractAddress, owner: owner.address, agent: agent.address, policyId, accessId }, null, 2));
