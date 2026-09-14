# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8aynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""ProofCheck - Verify GitHub open-source claims on GenLayer."""

import json
from genlayer import *


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class ProofCheckVerifier(gl.Contract):
    """ProofCheck contract for claim verification."""

    owner: Address
    treasury: Address
    paused: bool
    fee: u256
    num_claims: u256

    def __init__(self):
        self.owner = gl.message.sender_address
        self.treasury = Address("0xf9642b695d4ddf58599c953a791f94c2e96b6a57")
        self.paused = False
        self.fee = u256(10**18)  # 1 GEN
        self.num_claims = u256(0)

    @gl.public.view
    def get_fee(self) -> str:
        return str(self.fee)

    @gl.public.view
    def get_treasury(self) -> str:
        return str(self.treasury)

    @gl.public.view
    def get_status(self) -> str:
        return "paused" if self.paused else "active"

    @gl.public.view
    def get_claim_count(self) -> str:
        return str(self.num_claims)

    @gl.public.write.payable
    def submit_claim(
        self,
        claim_type: str,
        claim_text: str,
        repo_url: str,
        evidence_url: str,
    ) -> str:
        """Submit a claim for verification."""
        if self.paused:
            raise gl.vm.UserError("Contract is paused")

        if gl.message.value < self.fee:
            raise gl.vm.UserError("Insufficient fee")

        claim_id = "CLM-" + str(self.num_claims)
        self.num_claims = self.num_claims + u256(1)

        return json.dumps({
            "claim_id": claim_id,
            "submitter": str(gl.message.sender_address),
            "claim_type": claim_type,
            "claim_text": claim_text,
            "repo_url": repo_url,
            "evidence_url": evidence_url,
            "status": "submitted",
        })

    @gl.public.write
    def set_fee(self, new_fee: u256) -> None:
        """Set verification fee (owner only)."""
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
    def resume_contract(self) -> None:
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
