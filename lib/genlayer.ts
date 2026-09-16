import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionHashVariant, TransactionStatus } from "genlayer-js/types";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export const DATA_CONSENT_GUARD_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_DATA_CONSENT_GUARD_CONTRACT_ADDRESS ??
    "0x119708Fc5FdAb8CF867452a1892576967DC03486") as `0x${string}`;

export type WalletAddress = `0x${string}`;

export type ChainReadOptions = {
  walletAddress?: WalletAddress;
  contractAddress?: `0x${string}`;
};

export type PolicyInput = {
  walletAddress: WalletAddress;
  projectName: string;
  agentWallet: string;
  allowedPurpose: string;
  maxRecords: string;
  consentTermsUrl: string;
  licenseUrl: string;
  dataManifestUrl: string;
  contractAddress?: `0x${string}`;
};

export type AccessInput = {
  walletAddress: WalletAddress;
  policyId: string;
  requestKey: string;
  requestedRecords: string;
  dataRequestUrl: string;
  consentProofUrl: string;
  licenseProofUrl: string;
  contractAddress?: `0x${string}`;
};

export type WriteFinality = "finalized" | "accepted-readback";

export function createDataConsentGuardClient(walletAddress?: WalletAddress) {
  return createClient({
    chain: studionet,
    account: walletAddress,
    provider: typeof window !== "undefined" ? window.ethereum : undefined,
  });
}

function dataConsentGuardAddress(contractAddress?: `0x${string}`) {
  return contractAddress ?? DATA_CONSENT_GUARD_CONTRACT_ADDRESS;
}

function createReadClient() {
  return createClient({ chain: studionet });
}

export async function readPolicy(policyId: string, options: ChainReadOptions = {}) {
  return readStoredRecord("get_policy", [policyId], options);
}

export async function readAccessReview(accessId: string, options: ChainReadOptions = {}) {
  return readStoredRecord("get_access_review", [accessId], options);
}

export async function readGrant(accessId: string, options: ChainReadOptions = {}) {
  return readStoredRecord("get_grant", [accessId], options);
}

export async function registerPolicy({
  walletAddress,
  projectName,
  agentWallet,
  allowedPurpose,
  maxRecords,
  consentTermsUrl,
  licenseUrl,
  dataManifestUrl,
  contractAddress,
}: PolicyInput) {
  const client = createDataConsentGuardClient(walletAddress);
  await client.connect("studionet");
  const address = dataConsentGuardAddress(contractAddress);
  const hash = await client.writeContract({
    address,
    functionName: "register_policy",
    args: [projectName, agentWallet, allowedPurpose, maxRecords, consentTermsUrl, licenseUrl, dataManifestUrl],
    value: BigInt(0),
    leaderOnly: false,
  });
  const { receipt, finality } = await waitForConsensusReceipt(client, hash, "policy registration");
  const policyId = idFromReceipt(receipt, /pol_[a-f0-9]{20}/, "policy");
  const policy = await readPolicy(policyId, { walletAddress, contractAddress: address });
  return { hash, receipt, finality, policyId, policy };
}

export async function requestAccess({
  walletAddress,
  policyId,
  requestKey,
  requestedRecords,
  dataRequestUrl,
  consentProofUrl,
  licenseProofUrl,
  contractAddress,
}: AccessInput) {
  const client = createDataConsentGuardClient(walletAddress);
  await client.connect("studionet");
  const address = dataConsentGuardAddress(contractAddress);
  const hash = await client.writeContract({
    address,
    functionName: "request_access",
    args: [policyId, requestKey, requestedRecords, dataRequestUrl, consentProofUrl, licenseProofUrl],
    value: BigInt(0),
    leaderOnly: false,
  });
  const { receipt, finality } = await waitForConsensusReceipt(client, hash, "access review");
  const accessId = idFromReceipt(receipt, /acc_[a-f0-9]{20}/, "access");
  const accessReview = await readAccessReview(accessId, { walletAddress, contractAddress: address });
  return { hash, receipt, finality, accessId, accessReview };
}

export async function executeAccess(
  walletAddress: WalletAddress,
  policyId: string,
  accessId: string,
  contractAddress?: `0x${string}`,
) {
  const client = createDataConsentGuardClient(walletAddress);
  await client.connect("studionet");
  const address = dataConsentGuardAddress(contractAddress);
  const hash = await client.writeContract({
    address,
    functionName: "execute_access",
    args: [policyId, accessId],
    value: BigInt(0),
    leaderOnly: false,
  });
  const { receipt, finality } = await waitForConsensusReceipt(client, hash, "access execution");
  const grant = await readGrant(accessId, { walletAddress, contractAddress: address });
  return { hash, receipt, finality, grant };
}

async function waitForConsensusReceipt(
  client: ReturnType<typeof createDataConsentGuardClient>,
  hash: `0x${string}`,
  label: string,
) {
  try {
    const receipt = await waitForReceipt(client, hash, TransactionStatus.FINALIZED, 120);
    assertNoExecutionError(receipt, label);
    return { receipt, finality: "finalized" as WriteFinality };
  } catch (finalizedError) {
    const receipt = await waitForReceipt(client, hash, TransactionStatus.ACCEPTED, 80);
    assertNoExecutionError(receipt, label);
    return { receipt, finality: "accepted-readback" as WriteFinality, finalizedError };
  }
}

async function waitForReceipt(
  client: ReturnType<typeof createDataConsentGuardClient>,
  hash: `0x${string}`,
  status: TransactionStatus,
  retries: number,
) {
  return client.waitForTransactionReceipt({
    hash,
    status,
    interval: 3000,
    retries,
    fullTransaction: true,
  } as never);
}

function assertNoExecutionError(receipt: unknown, label: string) {
  const resultName = (receipt as { txExecutionResultName?: string })?.txExecutionResultName;
  if (resultName === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error(`${label} reached consensus but finished with a contract execution error.`);
  }
}

async function readStoredRecord(functionName: string, args: string[], options: ChainReadOptions) {
  const client = createReadClient();
  const address = dataConsentGuardAddress(options.contractAddress);
  const variants = [TransactionHashVariant.LATEST_FINAL, TransactionHashVariant.LATEST_NONFINAL] as const;
  let lastError: unknown;
  for (const transactionHashVariant of variants) {
    try {
      const result = await client.readContract({
        address,
        functionName,
        args,
        jsonSafeReturn: true,
        transactionHashVariant,
      });
      const text = normalizeReadResult(result);
      if (text.length === 0) throw new Error(`${functionName} returned an empty record.`);
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to read ${functionName} from ${address}: ${errorMessage(lastError)}`);
}

function normalizeReadResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

export function idFromReceipt(receipt: unknown, pattern: RegExp, label: string): string {
  const id = collectReceiptCandidates(receipt)
    .map((value) => extractId(value, pattern))
    .find((value): value is string => Boolean(value));
  if (!id) {
    throw new Error(
      `Finalized ${label} transaction did not expose its returned ID. Receipt keys: ${Object.keys(
        (receipt as Record<string, unknown>) ?? {},
      ).join(", ")}`,
    );
  }
  return id;
}

function collectReceiptCandidates(value: unknown): string[] {
  if (typeof value === "string") return expandStringCandidate(value);
  if (value instanceof Uint8Array) return expandStringCandidate(new TextDecoder().decode(value));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childCandidates = collectReceiptCandidates(child);
    if (/return|result|receipt|calldata|execution/i.test(key) && typeof child !== "object") {
      return [...childCandidates, String(child)];
    }
    return childCandidates;
  });
}

function expandStringCandidate(value: string): string[] {
  const candidates = [value];
  const hexDecoded = decodeHexText(value);
  if (hexDecoded) candidates.push(hexDecoded);
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") candidates.push(...collectReceiptCandidates(parsed));
  } catch {
    // Plain receipt fields are expected.
  }
  return candidates;
}

function extractId(value: string, pattern: RegExp) {
  return value.match(pattern)?.[0] ?? null;
}

function decodeHexText(value: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length < 4 || value.length % 2 !== 0) return null;
  try {
    const bytes = value
      .slice(2)
      .match(/.{1,2}/g)
      ?.map((byte) => Number.parseInt(byte, 16));
    if (!bytes) return null;
    return new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\0/g, "");
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
