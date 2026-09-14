# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


class ProofCheck(gl.Contract):
    owner: Address
    treasury: Address
    paused: bool

    def __init__(self):
        self.owner = gl.message.sender_address
        self.treasury = Address("0xf9642b695d4ddf58599c953a791f94c2e96b6a57")
        self.paused = False

    @gl.public.view
    def get_payment_policy(self) -> dict:
        return {"verification_fee_wei": "1000000000000000000"}

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
            raise gl.UserError("paused")
        return "success"

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
            raise gl.UserError("paused")
        return claim_id


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass
