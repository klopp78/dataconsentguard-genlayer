"use client";

import { useState } from "react";
import Link from "next/link";
import { DATA_CONSENT_GUARD_CONTRACT_ADDRESS, requestAccess, type WalletAddress } from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function AccessPage() {
  const pinnedExampleBase = "https://github.com/klopp78/dataconsentguard-genlayer/blob/02ccc4321e965a26a44d6ee2b6eac455b4b68762/examples";
  const [policyId, setPolicyId] = useState("pol_");
  const [requestKey, setRequestKey] = useState("support-answer-batch-1");
  const [records, setRecords] = useState("120");
  const [requestUrl, setRequestUrl] = useState(`${pinnedExampleBase}/access-request.md`);
  const [consentProofUrl, setConsentProofUrl] = useState(`${pinnedExampleBase}/consent-proof.md`);
  const [licenseProofUrl, setLicenseProofUrl] = useState(`${pinnedExampleBase}/license-proof.md`);
  const [address, setAddress] = useState<string>(DATA_CONSENT_GUARD_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Paste a policy ID and submit access evidence for consensus review.");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("No browser wallet detected.");
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as WalletAddress[];
    if (!accounts[0]) throw new Error("No wallet account returned.");
    setWallet(accounts[0]);
    return accounts[0];
  }

  async function submit() {
    try {
      setBusy(true);
      setRecord("");
      setMessage("Waiting for validators to inspect request, consent, and license evidence...");
      const account = wallet ?? (await connectWallet());
      const result = await requestAccess({
        walletAddress: account,
        policyId,
        requestKey,
        requestedRecords: records,
        dataRequestUrl: requestUrl,
        consentProofUrl,
        licenseProofUrl,
        contractAddress: address as `0x${string}`,
      });
      setRecord(typeof result.accessReview === "string" ? result.accessReview : JSON.stringify(result.accessReview, null, 2));
      setMessage(`Access review accepted: ${result.accessId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#151817]">
      <Link className="pill" href="/">DataConsentGuard</Link>
      <h1 className="mt-7 text-4xl font-semibold">Review data access</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#52645e]">
        Submit an access request and evidence. The contract stores an approved
        or blocked access receipt tied to validator-fetched source hashes.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="policy" label="Policy ID" value={policyId} setValue={setPolicyId} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="request" label="Request key" value={requestKey} setValue={setRequestKey} />
          <Field id="records" label="Requested records" value={records} setValue={setRecords} />
        </div>
        <Field id="request-url" label="Data request URL" value={requestUrl} setValue={setRequestUrl} />
        <Field id="consent-proof" label="Consent proof URL" value={consentProofUrl} setValue={setConsentProofUrl} />
        <Field id="license-proof" label="License proof URL" value={licenseProofUrl} setValue={setLicenseProofUrl} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(error.message))}>Connect wallet</button>
          <button className="action-button primary" disabled={busy} onClick={submit}>{busy ? "Awaiting consensus" : "Request access review"}</button>
        </div>
        <p className="text-sm text-[#52645e]">{message}</p>
      </section>
      {record ? <pre className="result-card mt-6 overflow-x-auto text-sm">{record}</pre> : null}
    </main>
  );
}

function Field({ id, label, value, setValue }: { id: string; label: string; value: string; setValue: (value: string) => void }) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input className="text-input" id={id} value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}
