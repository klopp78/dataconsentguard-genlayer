import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export const DATA_CONSENT_GUARD_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_DATA_CONSENT_GUARD_CONTRACT_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;

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

export function createDataConsentGuardClient(walletAddress?: WalletAddress) {
  return createClient({
    chain: studionet,
    account: walletAddress,
  });
}

function dataConsentGuardAddress(contractAddress?: `0x${string}`) {
  return contractAddress ?? DATA_CONSENT_GUARD_CONTRACT_ADDRESS;
}

export async function readPolicy(policyId: string, options: ChainReadOptions = {}) {
  const client = createDataConsentGuardClient(options.walletAddress);
  return client.readContract({
    address: dataConsentGuardAddress(options.contractAddress),
    functionName: "get_policy",
    args: [policyId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
}

export async function readAccessReview(accessId: string, options: ChainReadOptions = {}) {
  const client = createDataConsentGuardClient(options.walletAddress);
  return client.readContract({
    address: dataConsentGuardAddress(options.contractAddress),
    functionName: "get_access_review",
    args: [accessId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
}

export async function readGrant(accessId: string, options: ChainReadOptions = {}) {
  const client = createDataConsentGuardClient(options.walletAddress);
  return client.readContract({
    address: dataConsentGuardAddress(options.contractAddress),
    functionName: "get_grant",
    args: [accessId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
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
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const policyId = idFromReceipt(receipt, /pol_[a-f0-9]{20}/, "policy");
  const policy = await readPolicy(policyId, { walletAddress, contractAddress: address });
  return { hash, receipt, policyId, policy };
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
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const accessId = idFromReceipt(receipt, /acc_[a-f0-9]{20}/, "access");
  const accessReview = await readAccessReview(accessId, { walletAddress, contractAddress: address });
  return { hash, receipt, accessId, accessReview };
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
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const grant = await readGrant(accessId, { walletAddress, contractAddress: address });
  return { hash, receipt, grant };
}

function idFromReceipt(receipt: unknown, pattern: RegExp, label: string): string {
  const id = collectStrings(receipt)
    .map((value) => value.match(pattern)?.[0])
    .find((value): value is string => Boolean(value));
  if (!id) {
    throw new Error(`Accepted ${label} transaction did not return its ID.`);
  }
  return id;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}
