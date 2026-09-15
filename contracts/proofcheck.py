# v1.0.0 - ProofCheck: Verify GitHub open-source claims on GenLayer
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import genlayer as gl
from genlayer.types import *

import json
import typing


class ProofCheck(gl.contract.Contract):
    claim_text: str
    repo_url: str
    evidence_urls: str
    claim_status: str
    claim_reason: str

    def __init__(self, claim_text: str, repo_url: str, evidence_urls: str):
        """
        Initialize a ProofCheck claim verification instance.

        Args:
            claim_text (str): The claim about the GitHub repository.
            repo_url (str): The GitHub repository URL.
            evidence_urls (str): Newline-separated URLs of evidence.

        Attributes:
            claim_text (str): The claim statement being verified.
            repo_url (str): The GitHub repository URL.
            evidence_urls (str): Evidence URLs for validation.
            claim_status (str): Verification result (supported/insufficient/refuted).
            claim_reason (str): Explanation of the verification result.
        """
        self.claim_text = claim_text
        self.repo_url = repo_url
        self.evidence_urls = evidence_urls
        self.claim_status = "pending"
        self.claim_reason = "Waiting for validator assessment"

    @gl.public.write
    def verify_claim(self) -> typing.Any:
        """
        Submit claim for GenLayer validator assessment.
        Validators will fetch evidence URLs and determine claim status.
        """
        if self.claim_status != "pending":
            raise gl.vm.UserError("Claim already verified")

        claim_text = self.claim_text
        repo_url = self.repo_url
        evidence_urls = self.evidence_urls

        def assess_claim() -> typing.Any:
            # Fetch evidence from web
            evidence_content = ""
            for url in evidence_urls.split('\n'):
                url = url.strip()
                if url:
                    try:
                        content = gl.nondet.web.render(url, mode="text")
                        evidence_content += f"\n\nURL: {url}\nContent: {content[:500]}"
                    except Exception as e:
                        evidence_content += f"\n\nURL: {url}\nError: {str(e)}"

            # AI assessment prompt
            task = f"""
Assess if this GitHub repository claim is supported by the evidence.

Claim: {claim_text}
Repository: {repo_url}

Evidence content:
{evidence_content}

For an open-source claim, check:
1. Is the repository publicly accessible?
2. Does it contain relevant implementation code?
3. Is there a clear, usable open-source license (MIT, Apache, GPL, etc.)?

Respond with ONLY valid JSON format:
{{
    "status": str,
    "reason": str
}}

Where status must be one of: "supported", "insufficient", or "refuted"
The reason should briefly explain the assessment.

It is mandatory to respond only with JSON, nothing else.
This must be parsable without any formatting prefix or suffix.
            """

            result_text = gl.nondet.exec_prompt(task).replace("```json", "").replace("```", "")
            print(f"Validator assessment: {result_text}")
            return json.loads(result_text)

        # Use GenLayer consensus mechanism
        result_json = gl.eq_principle.strict_eq(assess_claim)

        # Store verification result
        self.claim_status = result_json.get("status", "insufficient")
        self.claim_reason = result_json.get("reason", "Unable to assess evidence")

        return result_json

    @gl.public.view
    def get_verification_result(self) -> dict[str, typing.Any]:
        """
        Retrieve the claim verification result.
        """
        return {
            "claim": self.claim_text,
            "repository": self.repo_url,
            "status": self.claim_status,
            "reason": self.claim_reason,
        }

    @gl.public.view
    def get_claim_details(self) -> dict[str, typing.Any]:
        """
        Get detailed claim information.
        """
        return {
            "claim_text": self.claim_text,
            "repo_url": self.repo_url,
            "evidence_urls": self.evidence_urls,
            "verification_status": self.claim_status,
        }
