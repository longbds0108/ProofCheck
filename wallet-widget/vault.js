// Set once the vault is deployed (see scripts/deploy-vault.mjs) by adding
// NEXT_PUBLIC_VAULT_ADDRESS to .env and rebuilding. Until then this is
// null and CollateralPanel shows a "not deployed yet" state instead of
// pretending a vault exists.
export const VAULT_ADDRESS = import.meta.env.NEXT_PUBLIC_VAULT_ADDRESS || null;
