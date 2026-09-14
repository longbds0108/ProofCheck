# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


@gl.contract
class ProofCheck:
    owner: Address
    treasury: Address
    paused: bool
    verification_fee: u256
    next_claim_id: u256

    def __init__(self):
        self.owner = gl.message.sender_account
        self.treasury = Address("0xf9642b695d4ddf58599c953a791f94c2e96b6a57")
        self.paused = False
        self.verification_fee = u256(10**18)
        self.next_claim_id = u256(0)

    @gl.public.view
    def get_payment_policy(self) -> dict:
        return {
            "verification_fee_wei": str(self.verification_fee),
            "treasury_address": str(self.treasury),
            "paused": str(self.paused)
        }

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict:
        return {}

    @gl.public.view
    def get_reviews(self, claim_id: str) -> dict:
        return {}

    @gl.public.view
    def get_evidence(self, claim_id: str) -> dict:
        return {}

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
        if self.paused:
            raise gl.UserError("Contract is paused")

        value = gl.message.value
        if value < self.verification_fee:
            raise gl.UserError("Insufficient verification fee")

        claim_id = "pc-" + str(self.next_claim_id)
        self.next_claim_id = self.next_claim_id + u256(1)

        if source_author_address and reward_amount > u256(0):
            _Recipient(Address(source_author_address)).emit_transfer(value=reward_amount)

        return claim_id

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
        if self.paused:
            raise gl.UserError("Contract is paused")

        value = gl.message.value
        if value < self.verification_fee:
            raise gl.UserError("Insufficient verification fee")

        if source_author_address and reward_amount > u256(0):
            _Recipient(Address(source_author_address)).emit_transfer(value=reward_amount)

        return claim_id

    @gl.public.write
    def set_fee(self, new_fee: u256) -> None:
        if gl.message.sender_account != self.owner:
            raise gl.UserError("Only owner can set fee")
        if new_fee == u256(0):
            raise gl.UserError("Fee must be greater than 0")
        self.verification_fee = new_fee

    @gl.public.write
    def pause_contract(self) -> None:
        if gl.message.sender_account != self.owner:
            raise gl.UserError("Only owner can pause")
        self.paused = True

    @gl.public.write
    def resume_contract(self) -> None:
        if gl.message.sender_account != self.owner:
            raise gl.UserError("Only owner can resume")
        self.paused = False


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass
