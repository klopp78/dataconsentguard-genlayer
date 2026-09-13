# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import hashlib
import json
import typing


class AccessVerdict(typing.NamedTuple):
    decision: str
    confidence: u8
    purpose_match: bool
    consent_valid: bool
    license_allows_use: bool
    scope_limited: bool
    evidence_bundle_hash: str
    snapshot_commitments_json: str
    summary: str


class DataConsentGuard(gl.Contract):
    """Consensus data-consent gate for AI agent access requests."""

    policy_count: u64
    latest_policy_id: str
    latest_access_id: str
    policy_ids: DynArray[str]
    access_ids: DynArray[str]
    policies: TreeMap[str, str]
    access_reviews: TreeMap[str, str]
    grants: TreeMap[str, str]

    def __init__(self):
        self.policy_count = u64(0)
        self.latest_policy_id = ""
        self.latest_access_id = ""

    @gl.public.view
    def get_policy_count(self) -> u64:
        return self.policy_count

    @gl.public.view
    def get_latest_policy_id(self) -> str:
        return self.latest_policy_id

    @gl.public.view
    def get_latest_access_id(self) -> str:
        return self.latest_access_id

    @gl.public.view
    def get_policy(self, policy_id: str) -> str:
        return self.policies.get(policy_id, "")

    @gl.public.view
    def get_access_review(self, access_id: str) -> str:
        return self.access_reviews.get(access_id, "")

    @gl.public.view
    def get_grant(self, access_id: str) -> str:
        return self.grants.get(access_id, "")

    @gl.public.view
    def list_policy_ids(self) -> str:
        return json.dumps([policy_id for policy_id in self.policy_ids], separators=(",", ":"))

    @gl.public.view
    def list_access_ids(self) -> str:
        return json.dumps([access_id for access_id in self.access_ids], separators=(",", ":"))

    @gl.public.write
    def register_policy(
        self,
        project_name: str,
        agent_wallet: str,
        allowed_purpose: str,
        max_records: str,
        consent_terms_url: str,
        license_url: str,
        data_manifest_url: str,
    ) -> str:
        owner = str(gl.message.sender_address).lower()
        name = _clean_text(project_name, 120, "project_name_required")
        agent = _canonical_wallet(agent_wallet)
        purpose = _clean_text(allowed_purpose, 180, "allowed_purpose_required")
        limit = _parse_positive_amount(max_records, "max_records_invalid")
        sources = _policy_sources(consent_terms_url, license_url, data_manifest_url)

        def leader_fn():
            return _commit_policy_baseline(name, owner, agent, purpose, limit, sources)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                proposed = json.loads(leader_result.calldata)
                independent = json.loads(
                    _commit_policy_baseline(name, owner, agent, purpose, limit, sources)
                )
            except Exception:
                return False
            return (
                proposed.get("baseline_hash") == independent.get("baseline_hash")
                and proposed.get("snapshot_commitments") == independent.get("snapshot_commitments")
                and proposed.get("source_bundle_hash") == independent.get("source_bundle_hash")
                and proposed.get("owner") == owner
                and proposed.get("agent_wallet") == agent
            )

        baseline = json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        policy_id = _policy_id(owner, agent, name, baseline["baseline_hash"])
        if len(self.policies.get(policy_id, "")) > 0:
            raise Exception("policy_already_registered")

        self.policy_count = u64(int(self.policy_count) + 1)
        record = {
            "schema_version": "dataconsentguard.policy.v1",
            "policy_id": policy_id,
            "project_name": name,
            "owner": owner,
            "agent_wallet": agent,
            "allowed_purpose": purpose,
            "max_records": limit,
            "remaining_records": limit,
            "source_manifest": sources,
            "baseline": baseline,
            "access_ids": [],
            "created_sequence": int(self.policy_count),
        }
        self.policies[policy_id] = _canonical_json(record)
        self.policy_ids.append(policy_id)
        self.latest_policy_id = policy_id
        return policy_id

    @gl.public.write
    def request_access(
        self,
        policy_id: str,
        request_key: str,
        requested_records: str,
        data_request_url: str,
        consent_proof_url: str,
        license_proof_url: str,
    ) -> str:
        policy = _load_json(self.policies.get(policy_id, ""), "policy_not_found")
        if policy["agent_wallet"] != str(gl.message.sender_address).lower():
            raise Exception("only_registered_agent_can_request_access")

        records = _parse_positive_amount(requested_records, "requested_records_invalid")
        if records > int(policy["remaining_records"]):
            raise Exception("requested_records_exceed_remaining_scope")
        key = _clean_text(request_key, 80, "request_key_required")
        evidence_sources = _access_sources(data_request_url, consent_proof_url, license_proof_url)

        def leader_fn():
            return _adjudicate_access(policy, key, records, evidence_sources)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                proposed = _parse_access_verdict(leader_result.calldata)
                independent = _parse_access_verdict(
                    _adjudicate_access(policy, key, records, evidence_sources)
                )
            except Exception:
                return False
            return (
                proposed.decision == independent.decision
                and proposed.purpose_match == independent.purpose_match
                and proposed.consent_valid == independent.consent_valid
                and proposed.license_allows_use == independent.license_allows_use
                and proposed.scope_limited == independent.scope_limited
                and proposed.evidence_bundle_hash == independent.evidence_bundle_hash
                and proposed.snapshot_commitments_json == independent.snapshot_commitments_json
                and abs(int(proposed.confidence) - int(independent.confidence)) <= 15
            )

        verdict = json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        access_id = _access_id(policy_id, key, records, verdict["evidence_bundle_hash"])
        if len(self.access_reviews.get(access_id, "")) > 0:
            raise Exception("access_already_reviewed")

        approved = (
            verdict["decision"] == "approved"
            and verdict["purpose_match"] is True
            and verdict["consent_valid"] is True
            and verdict["license_allows_use"] is True
            and verdict["scope_limited"] is True
        )
        review_record = {
            "schema_version": "dataconsentguard.access.v1",
            "access_id": access_id,
            "policy_id": policy_id,
            "request_key": key,
            "requested_records": records,
            "authorized_records": records if approved else 0,
            "state": "approved" if approved else "blocked",
            "source_manifest": evidence_sources,
            "baseline_hash": policy["baseline"]["baseline_hash"],
            "evidence_bundle_hash": verdict["evidence_bundle_hash"],
            "snapshot_commitments": verdict["snapshot_commitments"],
            "consensus_result": verdict,
            "execution_ready": approved,
        }
        policy["access_ids"].append(access_id)
        self.access_reviews[access_id] = _canonical_json(review_record)
        self.policies[policy_id] = _canonical_json(policy)
        self.access_ids.append(access_id)
        self.latest_access_id = access_id
        return access_id

    @gl.public.write
    def execute_access(self, policy_id: str, access_id: str) -> str:
        policy = _load_json(self.policies.get(policy_id, ""), "policy_not_found")
        review = _load_json(self.access_reviews.get(access_id, ""), "access_review_not_found")
        if policy["owner"] != str(gl.message.sender_address).lower():
            raise Exception("only_owner_can_execute_access_grant")
        if review["policy_id"] != policy_id:
            raise Exception("access_not_bound_to_policy")
        if review["state"] != "approved" or review["execution_ready"] is not True:
            raise Exception("access_requires_approving_receipt")
        if len(self.grants.get(access_id, "")) > 0:
            raise Exception("access_already_executed")
        records = int(review["authorized_records"])
        if records <= 0 or records > int(policy["remaining_records"]):
            raise Exception("execution_exceeds_consent_boundary")

        policy["remaining_records"] = int(policy["remaining_records"]) - records
        grant = {
            "schema_version": "dataconsentguard.grant.v1",
            "access_id": access_id,
            "policy_id": policy_id,
            "owner": policy["owner"],
            "agent_wallet": policy["agent_wallet"],
            "granted_records": records,
            "remaining_records": policy["remaining_records"],
            "authorization_receipt_hash": _sha256(_canonical_json(review)),
            "status": "granted",
        }
        review["state"] = "granted"
        review["execution_ready"] = False
        self.grants[access_id] = _canonical_json(grant)
        self.access_reviews[access_id] = _canonical_json(review)
        self.policies[policy_id] = _canonical_json(policy)
        return _sha256(_canonical_json(grant))[:24]


def _commit_policy_baseline(
    name: str,
    owner: str,
    agent: str,
    purpose: str,
    limit: int,
    sources: typing.Sequence[dict],
) -> str:
    snapshots = _render_sources(sources)
    snapshot_commitments = _snapshot_commitments(sources, snapshots)
    baseline = {
        "project_name": name,
        "owner": owner,
        "agent_wallet": agent,
        "allowed_purpose": purpose,
        "max_records": limit,
        "snapshot_commitments": snapshot_commitments,
    }
    return _canonical_json(
        {
            "owner": owner,
            "agent_wallet": agent,
            "snapshot_commitments": snapshot_commitments,
            "source_bundle_hash": _sha256(_canonical_json(sources)),
            "baseline_hash": _sha256(_canonical_json(baseline)),
        }
    )


def _adjudicate_access(
    policy: dict,
    request_key: str,
    records: int,
    evidence_sources: typing.Sequence[dict],
) -> str:
    snapshots = _render_sources(evidence_sources)
    snapshot_commitments = _snapshot_commitments(evidence_sources, snapshots)
    evidence_bundle_hash = _sha256(_canonical_json(snapshot_commitments))
    prompt_payload = {
        "policy": {
            "project_name": policy["project_name"],
            "allowed_purpose": policy["allowed_purpose"],
            "max_records": policy["max_records"],
            "remaining_records": policy["remaining_records"],
            "baseline_hash": policy["baseline"]["baseline_hash"],
            "baseline_commitments": policy["baseline"]["snapshot_commitments"],
        },
        "request_key": request_key,
        "requested_records": records,
        "evidence_snapshots": snapshots,
        "evidence_bundle_hash": evidence_bundle_hash,
    }
    prompt = f"""
You are a GenLayer validator reviewing an AI agent data-access request.

Return only minified JSON with keys decision, confidence, purpose_match,
consent_valid, license_allows_use, scope_limited, summary, evidence_bundle_hash.

Input:
{_canonical_json(prompt_payload)}

Rules:
- decision must be "approved", "blocked", or "needs_review".
- Do not approve unless the request purpose matches the registered purpose, the consent proof is valid for the data subject or dataset, the license permits this use, and the requested record count is within the remaining scope.
- Use blocked for contradictions, revoked consent, forbidden license terms, or excessive scope.
- Use needs_review for thin, inaccessible, or ambiguous evidence.
- evidence_bundle_hash must be exactly "{evidence_bundle_hash}".
"""
    data = json.loads(gl.nondet.exec_prompt(prompt))
    normalized = {
        "decision": str(data["decision"]).lower(),
        "confidence": max(0, min(100, int(data["confidence"]))),
        "purpose_match": bool(data["purpose_match"]),
        "consent_valid": bool(data["consent_valid"]),
        "license_allows_use": bool(data["license_allows_use"]),
        "scope_limited": bool(data["scope_limited"]) and records <= int(policy["remaining_records"]),
        "summary": str(data["summary"])[:500],
        "evidence_bundle_hash": str(data["evidence_bundle_hash"]),
        "snapshot_commitments": snapshot_commitments,
    }
    return _canonical_json(normalized)


def _parse_access_verdict(raw_json: str) -> AccessVerdict:
    data = json.loads(raw_json)
    decision = str(data["decision"]).lower()
    confidence = int(data["confidence"])
    evidence_bundle_hash = str(data["evidence_bundle_hash"])
    snapshot_commitments_json = _canonical_json(data["snapshot_commitments"])
    summary = str(data["summary"])
    if decision not in ("approved", "blocked", "needs_review"):
        raise Exception("invalid_decision")
    if confidence < 0 or confidence > 100:
        raise Exception("invalid_confidence")
    if len(evidence_bundle_hash) != 64:
        raise Exception("invalid_evidence_bundle_hash")
    if len(data["snapshot_commitments"]) != 3:
        raise Exception("invalid_snapshot_commitments")
    if len(summary) == 0 or len(summary) > 500:
        raise Exception("invalid_summary")
    return AccessVerdict(
        decision=decision,
        confidence=u8(confidence),
        purpose_match=bool(data["purpose_match"]),
        consent_valid=bool(data["consent_valid"]),
        license_allows_use=bool(data["license_allows_use"]),
        scope_limited=bool(data["scope_limited"]),
        evidence_bundle_hash=evidence_bundle_hash,
        snapshot_commitments_json=snapshot_commitments_json,
        summary=summary,
    )


def _render_sources(sources: typing.Sequence[dict]) -> typing.Sequence[dict]:
    snapshots = []
    for source in sources:
        rendered_text = gl.nondet.web.render(source["canonical_url"], mode="text")[:6000]
        snapshots.append(
            {
                "source_index": source["source_index"],
                "source_type": source["source_type"],
                "canonical_url": source["canonical_url"],
                "url_hash": source["url_hash"],
                "snapshot_hash": _sha256(rendered_text),
                "snapshot_chars": len(rendered_text),
                "text": rendered_text,
            }
        )
    return snapshots


def _snapshot_commitments(
    sources: typing.Sequence[dict],
    snapshots: typing.Sequence[dict],
) -> typing.Sequence[dict]:
    commitments = []
    for source, snapshot in zip(sources, snapshots):
        commitments.append(
            {
                "source_index": source["source_index"],
                "source_type": source["source_type"],
                "host": source["host"],
                "canonical_url": source["canonical_url"],
                "url_hash": source["url_hash"],
                "snapshot_hash": snapshot["snapshot_hash"],
                "snapshot_chars": snapshot["snapshot_chars"],
            }
        )
    return commitments


def _policy_sources(consent_url: str, license_url: str, manifest_url: str) -> typing.Sequence[dict]:
    return [
        _manifest_entry(1, "consent_terms", consent_url),
        _manifest_entry(2, "license_terms", license_url),
        _manifest_entry(3, "data_manifest", manifest_url),
    ]


def _access_sources(request_url: str, consent_proof_url: str, license_proof_url: str) -> typing.Sequence[dict]:
    return [
        _manifest_entry(1, "data_access_request", request_url),
        _manifest_entry(2, "consent_proof", consent_proof_url),
        _manifest_entry(3, "license_proof", license_proof_url),
    ]


def _manifest_entry(index: int, source_type: str, raw_url: str) -> dict:
    host, parts = _url_parts(raw_url)
    canonical = "https://" + host + "/" + "/".join(parts)
    return {
        "source_index": index,
        "source_type": source_type,
        "host": host,
        "canonical_url": canonical,
        "url_hash": _sha256(canonical),
    }


def _url_parts(raw_url: str) -> typing.Tuple[str, typing.Sequence[str]]:
    url = str(raw_url).strip()
    if not url.startswith("https://") or len(url) > 600:
        raise Exception("sources_must_use_canonical_https")
    if "?" in url or "#" in url:
        raise Exception("sources_must_not_include_query_or_fragment")
    without_scheme = url[8:]
    if "/" not in without_scheme:
        raise Exception("source_path_required")
    host, path = without_scheme.split("/", 1)
    parts = [part for part in path.split("/") if len(part) > 0]
    if len(parts) == 0:
        raise Exception("source_path_required")
    return host.lower(), parts


def _load_json(raw: str, missing_error: str) -> dict:
    if len(raw) == 0:
        raise Exception(missing_error)
    return json.loads(raw)


def _clean_text(value: str, max_length: int, error: str) -> str:
    clean = " ".join(str(value).strip().split())
    if len(clean) == 0 or len(clean) > max_length:
        raise Exception(error)
    return clean


def _canonical_wallet(value: str) -> str:
    wallet = str(value).strip().lower()
    if not wallet.startswith("0x") or len(wallet) != 42:
        raise Exception("invalid_wallet")
    return wallet


def _parse_positive_amount(value: str, error: str) -> int:
    amount = int(str(value).strip())
    if amount <= 0:
        raise Exception(error)
    return amount


def _policy_id(owner: str, agent: str, name: str, baseline_hash: str) -> str:
    return "pol_" + _sha256(owner + "|" + agent + "|" + name.lower() + "|" + baseline_hash)[:20]


def _access_id(policy_id: str, request_key: str, records: int, evidence_hash: str) -> str:
    return "acc_" + _sha256(policy_id + "|" + request_key.lower() + "|" + str(records) + "|" + evidence_hash)[:20]


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
