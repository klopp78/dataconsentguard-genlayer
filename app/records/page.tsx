"use client";

import { useState } from "react";
import {
  DATA_CONSENT_GUARD_CONTRACT_ADDRESS,
  executeAccess,
  readAccessReview,
  readGrant,
  readPolicy,
  type WalletAddress,
} from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function RecordsPage() {
  const [policyId, setPolicyId] = useState("");
  const [accessId, setAccessId] = useState("");
  const [address, setAddress] = useState(DATA_CONSENT_GUARD_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Read a policy, access review, or grant receipt from the deployed contract.");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("No browser wallet detected.");
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as WalletAddress[];
    if (!accounts[0]) throw new Error("No wallet account returned.");
    setWallet(accounts[0]);
    return accounts[0];
  }

  async function read(kind: "policy" | "access" | "grant") {
    try {
      setBusy(true);
      const options = { walletAddress: wallet ?? undefined, contractAddress: address as `0x${string}` };
      const value =
        kind === "policy"
          ? await readPolicy(policyId, options)
          : kind === "access"
            ? await readAccessReview(accessId, options)
            : await readGrant(accessId, options);
      setRecord(typeof value === "string" ? value : JSON.stringify(value, null, 2));
      setMessage(`${kind} record loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    try {
      setBusy(true);
      setRecord("");
      const account = wallet ?? (await connectWallet());
      const result = await executeAccess(account, policyId, accessId, address as `0x${string}`);
      setRecord(typeof result.grant === "string" ? result.grant : JSON.stringify(result.grant, null, 2));
      setMessage("Access grant receipt accepted and stored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#151817]">
      <a className="pill" href="/">DataConsentGuard</a>
      <h1 className="mt-7 text-4xl font-semibold">Inspect and grant access</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#52645e]">
        Read the exact on-chain records or execute an approved access receipt.
        Execution refuses blocked reviews, repeats, and over-scope grants.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="policy" label="Policy ID" value={policyId} setValue={setPolicyId} />
        <Field id="access" label="Access ID" value={accessId} setValue={setAccessId} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(error.message))}>Connect wallet</button>
          <button className="action-button" disabled={busy || !policyId} onClick={() => read("policy")}>Read policy</button>
          <button className="action-button" disabled={busy || !accessId} onClick={() => read("access")}>Read access</button>
          <button className="action-button" disabled={busy || !accessId} onClick={() => read("grant")}>Read grant</button>
          <button className="action-button primary" disabled={busy || !policyId || !accessId} onClick={execute}>Execute approved access</button>
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
