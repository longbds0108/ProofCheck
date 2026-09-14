# ProofCheck × GenLayer

`proofcheck_verifier.py` is an append-only audit contract for one focused MVP claim: whether a GitHub repository is open source.

## On-chain model

- `Claim`: the original statement, submitter, repository, and current review id.
- `Review`: versioned status (`supported`, `refuted`, `insufficient`), reason, excerpt, timestamp, and review kind.
- `Evidence`: one source URL per row, relation (`supporting` or `opposing`), excerpt, SHA-256 fingerprint supplied by the client, and capture timestamp.
- `Payment`: verification charge, optional reward escrow, payer, and settlement timestamp.
- `Reward`: queued source-author reward with owner-controlled release or refund.

Every new review appends to the arrays. A rebuttal never deletes an earlier result.

The file starts with the GenVM runner version and the pinned `py-genlayer`
dependency comment required by GenLayer Studio.

## Payment model

- `verification_fee` starts at **1 GEN** and is configurable by the owner.
- The submitter sends `verification_fee + reward_amount` as the payable method `value`.
- GenLayer network fees are separate and must be supplied through the GenLayerJS `fees` object.
- Optional source rewards are escrowed as `queued`; the owner calls `release_source_reward` or `refund_source_reward` after review.

## Checks

Run the local structural checks with:

```bash
python3 -m unittest contracts.test_contract_structure
```

The GenLayer VM checks should additionally be run with `genvm-lint` and
`gltest` in a GenLayer SDK environment.
- The owner can withdraw accumulated treasury funds to `treasury_address`.
- `pause` is available to the owner or emergency guardian. Ownership uses a two-step transfer (`transfer_ownership` / `accept_ownership`). A production treasury/owner should be a multisig address.

## Public methods

Reads: `get_payment_policy`, `get_claim`, `get_reviews`, `get_evidence`, `get_rewards`.

Writes: `verify_open_source_claim`, `submit_rebuttal`, reward release/refund, fee/treasury policy, pause, and two-step ownership transfer.

## GenLayerJS call shape

```ts
const write = {
  address: contractAddress,
  functionName: 'verify_open_source_claim',
  args: [
    claimType,
    claim,
    repoUrl,
    evidenceUrls.join('\n'),
    evidenceHashes.join('\n'),
    evidenceExcerpts.join('\n'),
    sourceAuthorAddress,
    sourceRewardWei,
  ],
  value: verificationFeeWei + sourceRewardWei,
};
const estimate = await client.estimateTransactionFeesForWrite(write);
const txId = await client.writeContract({
  ...write,
  fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
});
const receipt = await client.waitForFinalization({ hash: txId });
```

The wallet must cover `value + feeValue`. Read the fee policy from the contract; do not hardcode the product fee in the UI.
