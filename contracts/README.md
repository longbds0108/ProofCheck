# ProofCheck × GenLayer Studio

This folder contains the MVP Intelligent Contract for ProofCheck. It verifies one focused claim type: whether a public GitHub repository contains relevant source code and a clear usable open-source license.

## Payment model

- The contract has a configurable `verification_fee`, set to **1 GEN** by default. This `value` stays in the ProofCheck contract balance as the treasury until the owner withdraws it to the configured treasury wallet.
- The ProofCheck owner can update that product fee with `set_verification_fee` and change the destination wallet with `set_treasury_address`.
- GenLayer protocol/network fees are separate. They are supplied through the GenLayerJS `fees` object and are not counted as ProofCheck revenue.
- A submitter can optionally pass `source_author_address` and `reward_amount`. The transaction value then becomes `verification_fee + reward_amount`; the contract schedules the reward to the source author after finalization.
- If ProofCheck wants to sponsor a reward from its own treasury instead, the owner calls `reward_source_author(source_author_address, amount)`.

## Run it in GenLayer Studio

1. Start or open [GenLayer Studio](https://studio.genlayer.com/).
2. Create a Python Intelligent Contract and paste in `proofcheck_verifier.py`.
3. Run the contract locally first, then deploy to Studionet when the result looks right.
4. Copy the deployed contract address into ProofCheck's **Studio Console**.
5. Call `verify_open_source_claim(claim, repo_url, evidence_urls, source_author_address, reward_amount)` and wait for finalization.
6. Read the latest state with `get_latest_record()`.

Example GenLayerJS call:

```ts
const verificationFee = 1n * 10n ** 18n;
const sourceReward = 0n; // Optional: set in wei when rewarding an evidence provider.
const sourceAuthorAddress = ''; // Required only when sourceReward > 0.
const call = {
  address: contractAddress,
  functionName: 'verify_open_source_claim',
  args: [claim, repoUrl, evidenceUrls.join('\n'), sourceAuthorAddress, sourceReward],
  value: verificationFee + sourceReward,
};
const estimate = await client.estimateTransactionFeesForWrite(call);
const txId = await client.writeContract({
  ...call,
  fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
});
```

The wallet must cover `value + feeValue`: the first is the ProofCheck charge plus optional reward; the second is the separate GenLayer protocol fee.

The contract compares the stable `status` field across validators. Explanations and excerpts are recorded for review, but they do not need to be byte-for-byte identical.

For a live browser call, the next integration layer can use `genlayer-js` with the deployed address and an EIP-1193 wallet provider. The static demo UI currently prepares the transaction and opens Studio; it does not claim an on-chain result without a deployed address.
