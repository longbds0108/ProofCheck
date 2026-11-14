window.PROOFCHECK_CONFIG = {
  network: 'testnetBradbury',
  networkName: 'GenLayer Bradbury Phase 2',
  chainId: 4221,
  // ProofCheck v0.4.0 (contracts/proofcheck_studio.py) on Bradbury Phase 2.
  contractVersion: '0.4.0',
  contractAddress: '0x19979b6524206f510da9a9a37905FD3898A46ba7',
  deployTx: '0xe843f064b74b3a2c6c0443af916621df7160922e77765fdf9d794e78637afc60',
  previousStudioContractAddress: '0xA2AC2976433d32B42952404f66373fF084678F49',
  nativeCurrencyName: 'GEN',
  nativeCurrencySymbol: 'GEN',
  nativeCurrencyDecimals: 18,
  treasuryAddress: '0xf9642b695d4ddf58599c953a791f94c2e96b6a57',
  contractExplorer: 'https://scan.testnet-chain.genlayer.com/',
  rpcUrl: 'https://rpc.testnet-chain.genlayer.com/',
  rpcUrls: ['https://rpc.testnet-chain.genlayer.com/'],
  // The public chain RPC above serves wallets but not gen_call; contract reads,
  // fee simulation and transaction lookups go through the GenLayer node RPC.
  genlayerRpcUrl: 'https://rpc-bradbury.genlayer.com',
  // rc.3 is the first SDK build with the Bradbury Phase 2 consensus contracts.
  sdkUrl: 'https://esm.sh/genlayer-js@2.0.0-rc.3?bundle',
  chainsUrl: 'https://esm.sh/genlayer-js@2.0.0-rc.3/chains?bundle'
};
