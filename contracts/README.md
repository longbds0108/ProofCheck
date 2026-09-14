# ProofCheck × GenLayer Studio

This folder contains the MVP Intelligent Contract for ProofCheck. It verifies one focused claim type: whether a public GitHub repository contains relevant source code and a clear usable open-source license.

## Run it in GenLayer Studio

1. Start or open [GenLayer Studio](https://studio.genlayer.com/).
2. Create a Python Intelligent Contract and paste in `proofcheck_verifier.py`.
3. Run the contract locally first, then deploy to Studionet when the result looks right.
4. Copy the deployed contract address into ProofCheck's **Studio Console**.
5. Call `verify_open_source_claim(claim, repo_url, evidence_url)` and wait for finalization.
6. Read the latest state with `get_latest_record()`.

The contract compares the stable `status` field across validators. Explanations and excerpts are recorded for review, but they do not need to be byte-for-byte identical.

For a live browser call, the next integration layer can use `genlayer-js` with the deployed address and an EIP-1193 wallet provider. The static demo UI currently prepares the transaction and opens Studio; it does not claim an on-chain result without a deployed address.
