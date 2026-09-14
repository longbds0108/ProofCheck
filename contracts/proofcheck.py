# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import genlayer as gl


class ProofCheck(gl.contract.Contract):
    def __init__(self):
        pass

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
        reward_amount: gl.u256,
    ) -> str:
        return "claim_submitted"

    @gl.public.write.payable
    def submit_rebuttal(
        self,
        claim_id: str,
        opposing_urls: str,
        opposing_hashes: str,
        opposing_excerpts: str,
        source_author_address: str,
        reward_amount: gl.u256,
    ) -> str:
        return claim_id
