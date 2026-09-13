import { DATA_CONSENT_GUARD_CONTRACT_ADDRESS } from "@/lib/genlayer";

const repoUrl = "https://github.com/klopp78/dataconsentguard-genlayer";
const studioUrl = `https://explorer-studio.genlayer.com/address/${DATA_CONSENT_GUARD_CONTRACT_ADDRESS}`;

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f7f6] text-[#151817]">
      <section className="border-b border-[#d7dfdc] bg-[#fbfdfb]">
        <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
          <span className="pill">GenLayer Project</span>
          <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">
                DataConsentGuard
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#52645e]">
                Consent-bound data access for AI agents. Register a data-use policy,
                let validators inspect request evidence, then grant access only from
                an approved consensus receipt.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a className="action-button primary" href="/escrow">Register policy</a>
                <a className="action-button" href="/release">Review access</a>
                <a className="action-button" href="/records">Inspect grants</a>
              </div>
            </div>
            <div className="escrow-board">
              <div>
                <span>Consent baseline</span>
                <strong>Terms, license, manifest, purpose, and record limit are committed</strong>
              </div>
              <div>
                <span>Evidence verification</span>
                <strong>Validators fetch request, consent proof, and license proof snapshots</strong>
              </div>
              <div>
                <span>Access boundary</span>
                <strong>Only approved acc_* receipts can become executable grants</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-8 md:grid-cols-3 lg:px-8">
        <article className="tool-panel">
          <span className="field-label">01 Register</span>
          <h2 className="mt-2 text-2xl font-semibold">Immutable consent policy</h2>
          <p className="mt-3 leading-7 text-[#52645e]">
            The contract stores the agent wallet, allowed purpose, maximum record
            scope, and SHA-256 commitments for the source policy documents.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#226452]" href="/escrow">Open policy flow</a>
        </article>
        <article className="tool-panel">
          <span className="field-label">02 Review</span>
          <h2 className="mt-2 text-2xl font-semibold">Consensus access check</h2>
          <p className="mt-3 leading-7 text-[#52645e]">
            Validators compare the live request against consent proof, license
            proof, and the registered purpose before creating an access receipt.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#226452]" href="/release">Open review flow</a>
        </article>
        <article className="tool-panel">
          <span className="field-label">03 Grant</span>
          <h2 className="mt-2 text-2xl font-semibold">Bounded data grant</h2>
          <p className="mt-3 leading-7 text-[#52645e]">
            Execution is a separate write. It refuses blocked reviews, repeats,
            and any request outside the remaining consent boundary.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#226452]" href="/records">Open records</a>
        </article>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-5 pb-10 text-sm text-[#52645e] lg:px-8">
        <a href={repoUrl} rel="noreferrer" target="_blank">Source repository</a>
        <a href={studioUrl} rel="noreferrer" target="_blank">Studio contract</a>
        <code>{DATA_CONSENT_GUARD_CONTRACT_ADDRESS}</code>
      </footer>
    </main>
  );
}
