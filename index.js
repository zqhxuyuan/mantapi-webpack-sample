import * as sdk from './sdk';

const amount_threshold = 50000000000000000000;
const asset_id = 1;
const to_private_address = "3NfF4tBBmHjzFXUVwo4WPzjGRCjYtx73D237MSk5hatghxKLSMNc2UJKywtbHSp58CEWrPvDFkAQRYabo53zfk6w";

async function main() {
  await asset_transfer();
}

main()

// manta_pay to_private(DOL) and private_transfer(pDOL)
async function asset_transfer() {
  const { api, signer } = await sdk.init_api();
  const { wasm, wasmWallet } = await sdk.init_wasm_sdk(api, signer);

  // Get private address
  await sdk.getPrivateAddress(wasm, wasmWallet);

  // Get signer version
  await sdk.get_signer_version();

  // Initial sync
  await sdk.init_sync(wasmWallet);

  // Get balance
  const balance = sdk.print_private_balance(wasm, wasmWallet, asset_id, "After init sync");
  // Execute to_private() or private_transfer() extrinsic.
  if (balance < amount_threshold) {
    // TO PRIVATE
    await sdk.to_private(wasm, wasmWallet, asset_id, 100000000000000000000);
  } else {
    // PRIVATE TRANSFER
    await sdk.private_transfer(api, signer, wasm, wasmWallet, asset_id, 1000000000000000000, to_private_address);
  }

  // Validate private asset balance changed.
  setTimeout(function () { }, 1000);
  sdk.print_private_balance(wasm, wasmWallet, asset_id, "After transfer");

  // Sync after transfer
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, asset_id, "Sync1 after transfer");

  setTimeout(function () { }, 1000);
  await wasmWallet.sync();
  sdk.print_private_balance(wasm, wasmWallet, asset_id, "Sync2 After transfer");

  console.log("END");
}