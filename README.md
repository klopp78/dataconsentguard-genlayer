# DataConsentGuard for GenLayer

DataConsentGuard is a GenLayer-native consent gate for AI-agent data access. It lets a data owner register an immutable policy, asks validators to review a specific access request against live consent and license evidence, and creates an executable grant only from an approved consensus receipt.

## Why it exists

AI agents increasingly need data access, but a prompt-level promise like "only use consented records" is not enough. DataConsentGuard makes the access boundary explicit:

- consent terms, license terms, data manifest, allowed purpose, agent wallet, and record limit are committed at policy registration;
- request, consent proof, and license proof snapshots are fetched and hashed during review;
- every evidence URL must be a GitHub commit-pinned source, so the requester cannot swap arbitrary mutable pages after review;
- validators independently recompute snapshot commitments before accepting an access receipt;
- LLM boolean fields are type-checked as real JSON booleans before they can influence a receipt;
- execution requires an approved `acc_*` receipt and refuses duplicate or over-scope grants.

## Contract

`contracts/dataconsent_guard.py`

Important methods:

- `register_policy(...)` records owner, agent wallet, allowed purpose, record boundary, source manifest, and baseline commitments.
- `request_access(...)` asks validators to review request evidence and stores an approved or blocked access receipt.
- `execute_access(...)` creates a grant receipt only when the access review is approved and within the remaining consent boundary.
- `get_policy(...)`, `get_access_review(...)`, and `get_grant(...)` read the stored records.

## Application

The web app has three user flows:

- `/escrow` registers the consent policy and reads the accepted policy record.
- `/release` submits access evidence and reads the accepted access review.
- `/records` reads policy/access/grant records and can execute an approved access receipt.

The frontend uses `genlayer-js` against Studionet and does not display a local mock verdict as a consensus result.

## Example evidence

The `examples/` directory contains sample consent terms, data license, data manifest, access request, consent proof, and license proof. These are used as default URLs in the app so reviewers can test the complete flow after the contract is deployed.

## Checks

```bash
npm run contract:check
npm run flow:check
npm run build
```

`contract:check` verifies the contract shape, source authenticity requirements, strict LLM boolean validation, and critical guards.

`flow:check` is a live Studionet check, not an in-memory simulator. It requires:

```bash
NEXT_PUBLIC_DATA_CONSENT_GUARD_CONTRACT_ADDRESS=0x...
DATA_CONSENT_GUARD_PRIVATE_KEY=0x...
DATA_CONSENT_GUARD_AGENT_PRIVATE_KEY=0x... # optional; defaults to owner key
npm run flow:check
```

The live check uses `genlayer-js`, waits for finalized transactions, reads the returned `pol_*` and `acc_*` records back from the deployed contract, and executes the grant if the consensus review is approved.
