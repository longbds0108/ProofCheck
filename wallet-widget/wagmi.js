import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arcTestnet } from './chain.js';

export const wagmiConfig = getDefaultConfig({
  appName: import.meta.env.NEXT_PUBLIC_APP_NAME || 'Railflow',
  projectId: import.meta.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  chains: [arcTestnet],
  ssr: false,
});
