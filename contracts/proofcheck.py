# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8aynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class ProofCheckVerifier(gl.Contract):
    def __init__(self):
        pass

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
    ) -> None:
        """Verify an open source claim."""
        v = gl.message.value
        if v == u256(0):
            raise gl.vm.UserError("send verification fee")
        _Recipient(Address(source_author_address)).emit_transfer(value=v)

    @gl.public.write.payable
    def submit_rebuttal(
        self,
        claim_id: str,
        opposing_urls: str,
        opposing_hashes: str,
        opposing_excerpts: str,
        source_author_address: str,
        reward_amount: u256,
    ) -> None:
        """Submit rebuttal to a claim."""
        v = gl.message.value
        if v == u256(0):
            raise gl.vm.UserError("send rebuttal fee")
        _Recipient(Address(source_author_address)).emit_transfer(value=v)
