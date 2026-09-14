"""Offline safety checks for the ProofCheck contract.

These checks deliberately avoid pretending to be a GenLayer VM test. They run
in any checkout and assert that the contract keeps the MVP's storage and
payment guardrails. Run the GenLayer-specific suite separately with `gltest`
when the SDK/toolchain is installed.
"""

from pathlib import Path
import py_compile
import unittest


CONTRACT = Path(__file__).with_name("proofcheck_verifier.py")
SOURCE = CONTRACT.read_text(encoding="utf-8")


class ProofCheckContractStructureTests(unittest.TestCase):
    def test_contract_compiles_as_python(self):
        py_compile.compile(str(CONTRACT), doraise=True)

    def test_storage_models_are_append_only_records(self):
        for model in ("Claim", "Review", "Evidence", "Payment", "Reward"):
            self.assertIn(f"class {model}:", SOURCE)
        self.assertGreaterEqual(SOURCE.count("DynArray"), 5)
        self.assertIn("captured_at: str", SOURCE)
        self.assertIn("content_hash: str", SOURCE)

    def test_payment_is_not_hardcoded_at_call_site(self):
        self.assertIn("expected_value = self.verification_fee + reward_amount", SOURCE)
        self.assertIn("gl.message.value != expected_value", SOURCE)
        self.assertIn('"verification_fee_wei": str(self.verification_fee)', SOURCE)

    def test_configured_treasury_receives_withdrawable_fees(self):
        self.assertIn(
            'DEFAULT_TREASURY_ADDRESS = "0xf9642b695d4ddf58599c953a791f94c2e96b6a57"',
            SOURCE,
        )
        self.assertIn("self.treasury_address = Address(DEFAULT_TREASURY_ADDRESS)", SOURCE)
        self.assertIn("_Recipient(self.treasury_address).emit_transfer", SOURCE)

    def test_access_and_emergency_guards_exist(self):
        self.assertIn("def _assert_owner", SOURCE)
        self.assertIn("def pause", SOURCE)
        self.assertIn("def unpause", SOURCE)
        self.assertIn("pending_owner", SOURCE)
        self.assertIn("emergency_guardian", SOURCE)


if __name__ == "__main__":
    unittest.main()
