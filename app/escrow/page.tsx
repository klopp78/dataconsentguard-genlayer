"use client";

import { useState } from "react";
import Link from "next/link";
import { DATA_CONSENT_GUARD_CONTRACT_ADDRESS, registerPolicy, type WalletAddress } from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function PolicyPage() {
  const pinnedExampleBase = "https://github.com/klopp78/dataconsentguard-genlayer/blob/02ccc4321e965a26a44d6ee2b6eac455b4b68762/examples";
  const [projectName, setProjectName] = useState("Support agent data room");
  const [agentWallet, setAgentWallet] = useState("0x0000000000000000000000000000000000000001");
  const [purpose, setPurpose] = useState("Answer customer support questions using consented helpdesk tickets only.");
  const [maxRecords, setMaxRecords] = useState("500");
  const [consentUrl, setConsentUrl] = useState(`${pinnedExampleBase}/consent-terms.md`);
  const [licenseUrl, setLicenseUrl] = useState(`${pinnedExampleBase}/data-license.md`);
  const [manifestUrl, setManifestUrl] = useState(`${pinnedExampleBase}/data-manifest.md`);
  const [address, setAddress] = useState<string>(DATA_CONSENT_GUARD_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Connect a browser wallet to register a consent policy.");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("No browser wallet detected.");
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as WalletAddress[];
    if (!accounts[0]) throw new Error("No wallet account returned.");
    setWallet(accounts[0]);
    if (agentWallet === "0x0000000000000000000000000000000000000001") {
      setAgentWallet(accounts[0]);
    }
    return accounts[0];
  }

  async function submit() {
    try {
      setBusy(true);
      setRecord("");
      setMessage("Waiting for GenLayer validators to bind policy source snapshots...");
      const account = wallet ?? (await connectWallet());
      const result = await registerPolicy({
        walletAddress: account,
        projectName,
        agentWallet,
        allowedPurpose: purpose,
        maxRecords,
        consentTermsUrl: consentUrl,
        licenseUrl,
        dataManifestUrl: manifestUrl,
        contractAddress: address as `0x${string}`,
      });
      setRecord(typeof result.policy === "string" ? result.policy : JSON.stringify(result.policy, null, 2));
      setMessage(`Consent policy accepted: ${result.policyId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#151817]">
      <Link className="pill" href="/">DataConsentGuard</Link>
      <h1 className="mt-7 text-4xl font-semibold">Register consent policy</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#52645e]">
        Bind a data-use purpose, agent wallet, record limit, consent terms,
        license, and data manifest before any access request can be reviewed.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="name" label="Project name" value={projectName} setValue={setProjectName} />
        <Field id="agent" label="Agent wallet" value={agentWallet} setValue={setAgentWallet} />
        {wallet ? (
          <button className="action-button w-fit" type="button" onClick={() => setAgentWallet(wallet)}>
            Use connected wallet as agent
          </button>
        ) : null}
        <Field id="purpose" label="Allowed purpose" value={purpose} setValue={setPurpose} />
        <Field id="limit" label="Maximum records" value={maxRecords} setValue={setMaxRecords} />
        <Field id="consent" label="Consent terms URL" value={consentUrl} setValue={setConsentUrl} />
        <Field id="license" label="License URL" value={licenseUrl} setValue={setLicenseUrl} />
        <Field id="manifest" label="Data manifest URL" value={manifestUrl} setValue={setManifestUrl} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(error.message))}>Connect wallet</button>
          <button className="action-button primary" disabled={busy} onClick={submit}>{busy ? "Awaiting consensus" : "Register policy"}</button>
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
