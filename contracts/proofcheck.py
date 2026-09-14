# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8aynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""ProofCheck - GitHub open-source claim verification on GenLayer."""

import json
from genlayer import *


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class ProofCheckVerifier(gl.Contract):
    """Main contract for verifying open-source claims."""

    owner: Address
    treasury: Address
    paused: bool
    fee: u256
    num_claims: u256

    def __init__(self):
        self.owner = gl.message.sender_address
        self.treasury = Address("0xf9642b695d4ddf58599c953a791f94c2e96b6a57")
        self.paused = False
        self.fee = u256(10**18)
        self.num_claims = u256(0)

    @gl.public.view
    def get_payment_policy(self) -> str:
        return json.dumps({
            "verification_fee_wei": str(self.fee),
            "treasury_address": str(self.treasury),
            "paused": str(self.paused),
        })

    @gl.public.view
    def get_claim_count(self) -> str:
        return str(self.num_claims)

    @gl.public.view
    def get_status(self) -> str:
        return "paused" if self.paused else "active"

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
    ) -> str:
        """Create and verify a claim."""
        if self.paused:
            raise gl.vm.UserError("Contract is paused")

        expected_value = self.fee + reward_amount
        if gl.message.value != expected_value:
            raise gl.vm.UserError("Incorrect payment amount")

        claim_id = "CLM-" + str(self.num_claims)
        self.num_claims = self.num_claims + u256(1)

        return json.dumps({
            "claim_id": claim_id,
            "submitter": str(gl.message.sender_address),
            "claim_type": claim_type,
            "claim_text": claim,
            "repo_url": repo_url,
            "status": "submitted",
            "verification_fee_wei": str(self.fee),
            "source_reward_wei": str(reward_amount),
        })

    @gl.public.write.payable
    def submit_rebuttal(
        self,
        claim_id: str,
        opposing_urls: str,
        opposing_hashes: str,
        opposing_excerpts: str,
        source_author_address: str,
        reward_amount: u256,
    ) -> str:
        """Submit a rebuttal to an existing claim."""
        if self.paused:
            raise gl.vm.UserError("Contract is paused")

        if gl.message.value != self.fee + reward_amount:
            raise gl.vm.UserError("Incorrect payment amount")

        return json.dumps({
            "claim_id": claim_id,
            "status": "rebuttal_received",
            "review_id": "REV-" + str(self.num_claims),
        })

    @gl.public.write
    def set_fee(self, new_fee: u256) -> None:
        """Update verification fee (owner only)."""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can set fee")
        if new_fee == u256(0):
            raise gl.vm.UserError("Fee must be > 0")
        self.fee = new_fee

    @gl.public.write
    def pause_contract(self) -> None:
        """Pause contract (owner only)."""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can pause")
        self.paused = True

    @gl.public.write
    def unpause_contract(self) -> None:
        """Resume contract (owner only)."""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can resume")
        self.paused = False

    @gl.public.write.payable
    def send_reward(self, recipient: str) -> None:
        """Send reward to recipient."""
        v = gl.message.value
        if v == u256(0):
            raise gl.vm.UserError("send some value")
        _Recipient(Address(recipient)).emit_transfer(value=v)
