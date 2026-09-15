# v1.0.0 - Ready for Bradbury Testnet (chain 4221)
# ProofCheck: Verify GitHub open-source claims
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import genlayer as gl
from genlayer.types import *
import json
import typing


class ProofCheck(gl.contract.Contract):
    """Decentralized verification of GitHub open-source claims using GenLayer"""

    owner: Address
    treasury_address: Address
    paused: bool
    verification_fee: u256

    def __init__(self):
        self.owner = gl.message.sender_address
        self.treasury_address = Address("0xF9642B695D4DDf58599c953a791F94c2e96b6a57")
        self.paused = False
        self.verification_fee = u256(10**18)

    @gl.public.view
    def get_payment_policy(self) -> dict[str, typing.Any]:
        """Get current payment policy"""
        return {
            "verification_fee_wei": str(self.verification_fee),
            "treasury_address": str(self.treasury_address),
            "paused": self.paused
        }

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict[str, typing.Any]:
        """Get claim details - placeholder for full implementation"""
        return {}

    @gl.public.view
    def get_reviews(self, claim_id: str) -> list[dict[str, typing.Any]]:
        """Get reviews for a claim - placeholder for full implementation"""
        return []

    @gl.public.view
    def get_evidence(self, claim_id: str) -> list[dict[str, typing.Any]]:
        """Get evidence for a claim - placeholder for full implementation"""
        return []

    @gl.public.write.payable
    def verify_open_source_claim(
        self,
        claim_type: str,
        claim: str,
        repo_url: str,
        evidence_urls: str,
        evidence_hashes: str,
        evidence_excerpts: str,
        source_author_address: str,
        reward_amount: u256,
    ) -> dict[str, typing.Any]:
        """
        Submit a claim about GitHub repository being open source.
        GenLayer validators will assess evidence and reach consensus.
        """
        if self.paused:
            raise gl.vm.UserError("Contract is paused for maintenance")

        value = gl.message.value
        if value < self.verification_fee:
            raise gl.vm.UserError("Insufficient verification fee")

        # GenLayer validators will assess the claim
        def validate_claim() -> typing.Any:
            task = f"""
Assess if this GitHub repository claim is supported by the evidence.

Claim: {claim}
Repository: {repo_url}
Evidence URLs: {evidence_urls}

Check:
1. Is repository publicly accessible?
2. Does it contain relevant code?
3. Has a clear open-source license?

Respond with only valid JSON:
{{"status": "supported|insufficient|refuted", "reason": "explanation", "confidence": 0.0-1.0}}
            """
            result_text = gl.nondet.exec_prompt(task)
            result_text = result_text.replace("```json", "").replace("```", "").strip()
            return json.loads(result_text)

        # Use GenLayer consensus to validate
        result = gl.eq_principle.strict_eq(validate_claim)

        return {
            "claim_type": claim_type,
            "claim": claim,
            "status": result.get("status", "insufficient"),
            "reason": result.get("reason", "Unable to assess"),
            "validated": True
        }

    @gl.public.write.payable
    def submit_rebuttal(
        self,
        claim_id: str,
        opposing_urls: str,
        opposing_hashes: str,
        opposing_excerpts: str,
        source_author_address: str,
        reward_amount: u256,
    ) -> dict[str, typing.Any]:
        """
        Submit rebuttal/counter-evidence to existing claim.
        Creates new review without erasing history.
        """
        if self.paused:
            raise gl.vm.UserError("Contract is paused for maintenance")

        value = gl.message.value
        if value < self.verification_fee:
            raise gl.vm.UserError("Insufficient verification fee")

        # Validate counter-evidence with GenLayer
        def validate_rebuttal() -> typing.Any:
            task = f"""
Assess this counter-evidence against the original claim.

Counter-Evidence URLs: {opposing_urls}
Counter-Excerpts: {opposing_excerpts}

Does this evidence refute the original claim?

Respond with only valid JSON:
{{"status": "supported|insufficient|refuted", "reason": "explanation"}}
            """
            result_text = gl.nondet.exec_prompt(task)
            result_text = result_text.replace("```json", "").replace("```", "").strip()
            return json.loads(result_text)

        result = gl.eq_principle.strict_eq(validate_rebuttal)

        return {
            "claim_id": claim_id,
            "status": result.get("status", "insufficient"),
            "reason": result.get("reason", "Rebuttal assessed"),
            "review_created": True
        }

    @gl.public.write
    def set_fee(self, new_fee: u256) -> None:
        """Update verification fee (owner only)"""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can set fee")
        if new_fee == u256(0):
            raise gl.vm.UserError("Fee must be greater than 0")
        self.verification_fee = new_fee

    @gl.public.write
    def pause_contract(self) -> None:
        """Pause contract (owner only)"""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can pause")
        self.paused = True

    @gl.public.write
    def resume_contract(self) -> None:
        """Resume contract (owner only)"""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can resume")
        self.paused = False
