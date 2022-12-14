import * as sdk from './sdk';
import config from './config.json';

const ft_asset_id = 1;
// Kp4XohQvXcBEPsXfgpqphAqYGmTzLxBSpUQ97vW6JMkSkhWUBLeXWMLiZ4nXYEeSv4W2gGAxB5M7rrFAqhjek6P
const to_private_address = "64nmibscb1UdWGMWnRQAYx6hS4TA2iyFqiS897cFRWvNTmjad85p6yD9ud7cyVPhyNPDrSMs2eZxTfovxZbJdFqH";

// collection_id: 4369(0x1111), item_id: 1(0x0001), asset_id: 0x11110001=286326785
const nft_asset_id = 286326785;

async function main() {
  // await init_wallet_works();

  await fungible_asset_to_private_works();

  // await fungible_asset_transfer();

  // await nft_transfer();
}

main()

// manta_pay asset to_private(DOL) and private_transfer(pDOL)
async function fungible_asset_to_private_works() {
  const { api, signer } = await sdk.init_api();
  const { wasm, wasmWallet } = await sdk.init_wasm_sdk(api, signer);

  // Get private address
  await sdk.getPrivateAddress(wasm, wasmWallet);

  // Get signer version
  await sdk.get_signer_version();

  // Initial sync
  // TODO: Do we still need initial sync for already synchronized signer?
  await sdk.init_sync(wasmWallet);

  await sdk.to_private(wasm, wasmWallet, ft_asset_id, 100000000000000000000);

  // Sync after transfer, Validate private asset balance changed.
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, ft_asset_id, "Sync1 after transfer");

  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, ft_asset_id, "Sync2 After transfer");

  console.log("END");
}

// manta_pay asset to_private(DOL) and private_transfer(pDOL)
async function fungible_asset_transfer() {
  const { api, signer } = await sdk.init_api();
  const { wasm, wasmWallet } = await sdk.init_wasm_sdk(api, signer);

  // Get private address
  await sdk.getPrivateAddress(wasm, wasmWallet);

  // Get signer version
  await sdk.get_signer_version();

  // Initial sync
  await sdk.init_sync(wasmWallet);

  // Get balance
  const amount_threshold = 50000000000000000000;
  const balance = sdk.print_private_balance(wasm, wasmWallet, ft_asset_id, "After init sync");
  // Execute to_private() or private_transfer() extrinsic.
  if (balance < amount_threshold) {
    // TO PRIVATE
    await sdk.to_private(wasm, wasmWallet, ft_asset_id, 100000000000000000000);
  } else {
    // PRIVATE TRANSFER
    await sdk.private_transfer(api, signer, wasm, wasmWallet, ft_asset_id, 1000000000000000000, to_private_address);
  }

  // Validate private asset balance changed.
  setTimeout(function () { }, 1000);
  sdk.print_private_balance(wasm, wasmWallet, ft_asset_id, "After transfer");

  // Sync after transfer
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, ft_asset_id, "Sync1 after transfer");

  setTimeout(function () { }, 1000);
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, ft_asset_id, "Sync2 After transfer");

  console.log("END");
}

async function init_wallet_works() {
  const signer = "";  
  // init api and wallet sdk
  const api = await sdk.init_api_config(config.BLOCKCHAIN_URL_LOCAL);
  const { wasm, wasmWallet } = await sdk.init_wasm_sdk(api, signer);
  await sdk.getPrivateAddress(wasm, wasmWallet);
}

// create collection & mint item on polkadot.js or through api?
async function nft_transfer() {
  // init api and wallet sdk
  const { api, signer } = await sdk.init_api();
  const { wasm, wasmWallet } = await sdk.init_wasm_sdk(api, signer);

  await sdk.getPrivateAddress(wasm, wasmWallet);
  await sdk.get_signer_version();
  await sdk.init_sync(wasmWallet);

  const balance = sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "After init sync");
  if (balance == 0) {
    await sdk.to_private_nft(wasm, wasmWallet, nft_asset_id);
  } else {
    await sdk.private_transfer_nft(api, signer, wasm, wasmWallet, nft_asset_id, to_private_address);
    // await sdk.to_public_nft(api, signer, wasm, wasmWallet, nft_asset_id);
  }
  
  setTimeout(function () { }, 1000);
  sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "After transfer");

  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "Sync1 after transfer");

  setTimeout(function () { }, 1000);
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "Sync2 After transfer");
}
