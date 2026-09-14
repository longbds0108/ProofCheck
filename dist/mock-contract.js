/* Mock ProofCheck contract for testing without GenLayer deployment. */

const mockContractState = {
  claims: [],
  reviews: [],
  payments: [],
  nextClaimNumber: 1,
  verificationFee: 1n * 10n**18n, // 1 GEN
  treasuryAddress: '0xf9642b695d4ddf58599c953a791f94c2e96b6a57',
  paused: false,
};

const mockContract = {
  async getPaymentPolicy() {
    return {
      verification_fee_wei: String(mockContractState.verificationFee),
      treasury_address: mockContractState.treasuryAddress,
      treasury_balance_wei: '0',
      total_verification_fees_wei: '0',
      total_source_rewards_wei: '0',
      paused: String(mockContractState.paused),
    };
  },

  async verifyClaim(claimType, claim, repoUrl, evidenceUrls, evidenceHashes, evidenceExcerpts, author, reward) {
    const claimId = `CLM-${mockContractState.nextClaimNumber}`;
    const reviewId = `REV-${mockContractState.nextClaimNumber}`;

    // Simulate validator evaluation (random status)
    const statuses = ['supported', 'insufficient', 'refuted'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const mockReview = {
      claim_id: claimId,
      review_id: reviewId,
      status: status,
      reason: status === 'supported'
        ? 'Repository is public and contains relevant open-source license.'
        : status === 'insufficient'
        ? 'Evidence is incomplete or ambiguous.'
        : 'Evidence contradicts the claim.',
      evidence_excerpt: claim.slice(0, 100) + '...',
      created_at: new Date().toISOString(),
    };

    mockContractState.claims.push({
      claim_id: claimId,
      submitter: '0x' + Math.random().toString(16).slice(2),
      claim_type: claimType,
      claim_text: claim,
      repo_url: repoUrl,
      created_at: new Date().toISOString(),
      latest_review_id: reviewId,
      active: true,
    });

    mockContractState.reviews.push(mockReview);
    mockContractState.nextClaimNumber++;

    return {
      claim_id: claimId,
      review_id: reviewId,
      status: mockReview.status,
      reason: mockReview.reason,
      evidence_excerpt: mockReview.evidence_excerpt,
    };
  },

  async getClaim(claimId) {
    const claim = mockContractState.claims.find(c => c.claim_id === claimId);
    if (!claim) throw new Error('Claim not found');
    return claim;
  },

  async getReviews(claimId) {
    return mockContractState.reviews.filter(r => r.claim_id === claimId);
  },

  async submitRebuttal(claimId, opposingUrl, opposingHash, opposingExcerpt, author, reward) {
    const claim = mockContractState.claims.find(c => c.claim_id === claimId);
    if (!claim) throw new Error('Claim not found');

    const reviewId = `REV-${claimId}-${Date.now()}`;
    const statuses = ['supported', 'insufficient', 'refuted'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    mockContractState.reviews.push({
      claim_id: claimId,
      review_id: reviewId,
      status: status,
      reason: `Rebuttal reviewed: ${status}`,
      evidence_excerpt: opposingExcerpt || 'No excerpt provided',
      created_at: new Date().toISOString(),
    });

    return {
      claim_id: claimId,
      review_id: reviewId,
      status: status,
      reason: `Rebuttal reviewed: ${status}`,
    };
  },
};

// Export for use in app.js
window.MOCK_CONTRACT = mockContract;
