/* Wallet connection bridge - simplified version without React hook complexity.
   Uses direct Web3 provider (window.ethereum) for wallet connection. */

const studionet = {
  id: '0xf1df',  // 61999 in hex
  name: 'GenLayer Studionet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrl: 'https://studio.genlayer.com/api',
  blockExplorer: 'https://explorer-studio.genlayer.com',
};

async function switchToStudionet() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: studionet.id }],
    });
    return true;
  } catch (error) {
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: studionet.id,
              chainName: studionet.name,
              rpcUrls: [studionet.rpcUrl],
              nativeCurrency: studionet.nativeCurrency,
              blockExplorerUrls: [studionet.blockExplorer],
            },
          ],
        });
        return true;
      } catch (addError) {
        console.error('Failed to add Studionet:', addError);
        return false;
      }
    }
    console.error('Failed to switch chain:', error);
    return false;
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('Please install MetaMask or another EIP-1193 wallet.');
    return null;
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (accounts && accounts[0]) {
      const address = accounts[0];

      // Get current chain
      const chainId = await window.ethereum.request({
        method: 'eth_chainId',
      });

      // If not on Studionet, switch
      if (chainId !== studionet.id) {
        const switched = await switchToStudionet();
        if (!switched) {
          alert('Please switch to GenLayer Studionet to continue.');
          return null;
        }
      }

      return address;
    }
  } catch (error) {
    if (error.code === 4001) {
      console.log('User rejected wallet connection');
    } else {
      console.error('Wallet connection error:', error);
      alert('Failed to connect wallet: ' + error.message);
    }
    return null;
  }
}

function shortAddress(addr) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

async function updateButtonState() {
  const button = document.querySelector('[data-start-check]');
  if (!button) return;

  if (!window.ethereum) {
    button.textContent = 'Connect wallet';
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    });
    if (accounts && accounts[0]) {
      button.textContent = shortAddress(accounts[0]);
      button.classList.add('is-connected');
    } else {
      button.textContent = 'Connect wallet';
      button.classList.remove('is-connected');
    }
  } catch (error) {
    console.error('Failed to check connected account:', error);
  }
}

// Attach to button (homepage only)
document.addEventListener('DOMContentLoaded', async function () {
  const button = document.querySelector('[data-start-check]');
  if (!button) return;

  // Hide button on child pages (only show on homepage)
  if (window.location.pathname !== '/') {
    button.hidden = true;
    return;
  }

  button.addEventListener('click', async function (event) {
    event.preventDefault();
    const address = await connectWallet();
    if (address) {
      window.location.href = '/submit/';
    }
  });

  // Update button state on page load
  await updateButtonState();

  // Listen for wallet account changes
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', updateButtonState);
    window.ethereum.on('chainChanged', updateButtonState);
  }
});
