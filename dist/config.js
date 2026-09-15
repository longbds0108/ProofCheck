window.PROOFCHECK_CONFIG = {
  network: 'studioDevnet',
  networkName: 'GenLayer Studio Next',
  chainId: 61997,
  // ProofCheckStudio v0.3.0 deployed and verified in GenLayer Studio Next.
  contractVersion: 'studio-0.3.0',
  contractAddress: '0xA2AC2976433d32B42952404f66373fF084678F49',
  nativeCurrencyName: 'GEN',
  nativeCurrencySymbol: 'GEN',
  nativeCurrencyDecimals: 18,
  treasuryAddress: '0xf9642b695d4ddf58599c953a791f94c2e96b6a57',
  contractExplorer: 'https://explorer-studio-dev.genlayer.com/',
  // studio-next is a browser alias; SDK requests must use the canonical
  // Studio preview RPC for chain 61997.
  rpcUrl: 'https://studio-dev.genlayer.com/api',
  rpcUrls: [
    'https://studio-dev.genlayer.com/api',
    'https://rpc.genlayer.com/',
    'https://api.genlayer.com/'
  ],
  sdkUrl: 'https://esm.sh/genlayer-js@2.0.0-rc.1?bundle'
};
