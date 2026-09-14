# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


@gl.contract
class ProofCheck:
    owner: Address
    treasury: Address
    paused: bool
    verification_fee: u256
    claims: TreeMap[str, dict]
    reviews: TreeMap[str, dict]
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
        if claim_id not in self.claims:
            return {}
        return self.claims[claim_id]

    @gl.public.view
    def get_reviews(self, claim_id: str) -> DynArray[dict]:
        if claim_id not in self.reviews:
            return []
        return self.reviews[claim_id]

    @gl.public.view
    def get_evidence(self, claim_id: str) -> DynArray[dict]:
        claim = self.get_claim(claim_id)
        if not claim:
            return []
        return claim.get("evidence", [])

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

        claim_data = {
            "claim_id": claim_id,
            "claim_type": claim_type,
            "claim_text": claim,
            "repo_url": repo_url,
            "submitter": str(gl.message.sender_account),
            "evidence": [
                {
                    "url": url,
                    "hash": hash_val,
                    "excerpt": excerpt,
                    "relation": "supporting",
                    "captured_at": str(gl.block.timestamp)
                }
                for url, hash_val, excerpt in zip(
                    evidence_urls.split("\n"),
                    evidence_hashes.split("\n"),
                    evidence_excerpts.split("\n")
                )
            ],
            "reward_address": source_author_address,
            "reward_amount": str(reward_amount)
        }

        self.claims[claim_id] = claim_data

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

        if claim_id not in self.claims:
            raise gl.UserError("Claim not found")

        value = gl.message.value
        if value < self.verification_fee:
            raise gl.UserError("Insufficient verification fee")

        rebuttal_data = {
            "claim_id": claim_id,
            "submitter": str(gl.message.sender_account),
            "evidence": [
                {
                    "url": url,
                    "hash": hash_val,
                    "excerpt": excerpt,
                    "relation": "opposing",
                    "captured_at": str(gl.block.timestamp)
                }
                for url, hash_val, excerpt in zip(
                    opposing_urls.split("\n"),
                    opposing_hashes.split("\n"),
                    opposing_excerpts.split("\n")
                )
            ],
            "reward_address": source_author_address,
            "reward_amount": str(reward_amount)
        }

        if claim_id not in self.reviews:
            self.reviews[claim_id] = []

        self.reviews[claim_id].append(rebuttal_data)

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
