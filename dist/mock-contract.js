/* Mock ProofCheck contract for testing without GenLayer deployment. */

const mockContractState = {
  claims: [
    {
      claim_id: 'pc-25-047',
      submitter: '0xf9642b695d4ddf58599c953a791f94c2e96b6a57',
      claim_type: 'Repository is open source',
      claim_text: 'Our smart contract is open source',
      repo_url: 'https://github.com/aurora-labs/core',
      created_at: '2025-09-14T10:30:00Z',
      latest_review_id: 'REV-1',
      active: true,
    }
  ],
  reviews: [
    {
      claim_id: 'pc-25-047',
      review_id: 'REV-1',
      version: 1,
      status: 'supported',
      reason: 'Repository is public and contains relevant open-source license.',
      evidence_excerpt: 'MIT License found in repository',
      created_at: '2025-09-14T10:30:00Z',
      review_kind: 'initial',
      finalized: true,
    }
  ],
  evidence: [
    {
      claim_id: 'pc-25-047',
      review_id: 'REV-1',
      url: 'https://github.com/aurora-labs/core',
      excerpt: 'Public repository accessible',
      content_hash: 'abc123def456',
      captured_at: '2025-09-14T10:30:00Z',
      relation: 'supporting',
    },
    {
      claim_id: 'pc-25-047',
      review_id: 'REV-1',
      url: 'https://github.com/aurora-labs/core/blob/main/LICENSE',
      excerpt: 'MIT License',
      content_hash: 'xyz789uvw012',
      captured_at: '2025-09-14T10:30:00Z',
      relation: 'supporting',
    }
  ],
  payments: [],
  nextClaimNumber: 2,
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

  async getClaim(claimId) {
    const claim = mockContractState.claims.find(c => c.claim_id === claimId);
    if (!claim) {
      return {
        claim_id: claimId,
        submitter: '0x0000000000000000000000000000000000000000',
        claim_type: 'Unknown',
        claim_text: 'Claim not found',
        repo_url: '',
        created_at: new Date().toISOString(),
        latest_review_id: '',
        active: 'False',
      };
    }
    return {
      claim_id: claim.claim_id,
      submitter: claim.submitter,
      claim_type: claim.claim_type,
      claim_text: claim.claim_text,
      repo_url: claim.repo_url,
      created_at: claim.created_at,
      latest_review_id: claim.latest_review_id,
      active: String(claim.active),
    };
  },

  async getReviews(claimId) {
    return mockContractState.reviews.filter(r => r.claim_id === claimId);
  },

  async getEvidence(claimId) {
    return mockContractState.evidence.filter(e => e.claim_id === claimId);
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
