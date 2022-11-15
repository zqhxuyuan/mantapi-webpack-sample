import * as sdk from './sdk';

const amount_threshold = 50000000000000000000;
const ft_asset_id = 1;
// collection_id: 4369(0x1111), item_id: 1(0x0001), asset_id: 0x11110001=286326785
const nft_asset_id = 286326786;
const to_private_address = "3NfF4tBBmHjzFXUVwo4WPzjGRCjYtx73D237MSk5hatghxKLSMNc2UJKywtbHSp58CEWrPvDFkAQRYabo53zfk6w";

async function main() {
  // await fungible_asset_transfer();

  await nft_transfer();
}

main()

async function nft_transfer() {
  // init api and wallet sdk
  const { api, signer } = await sdk.init_api();
  const { wasm, wasmWallet } = await sdk.init_wasm_sdk(api, signer);

  // Get private address
  await sdk.getPrivateAddress(wasm, wasmWallet);

  // Get signer version
  await sdk.get_signer_version();

  // Initial sync
  await sdk.init_sync(wasmWallet);

  // create collection
  // mint item with collection_id

  // asset_id: collection_id + item_id
  // to_private(asset_id)
  // private_transfer(asset_id)
  // to_public(asset_id)

  await sdk.to_private(wasm, wasmWallet, nft_asset_id, 1);

  setTimeout(function () { }, 1000);
  sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "After transfer");

  // Sync after transfer
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "Sync1 after transfer");

  setTimeout(function () { }, 1000);
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, nft_asset_id, "Sync2 After transfer");

}

// manta_pay to_private(DOL) and private_transfer(pDOL)
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