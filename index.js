import { ApiPromise, WsProvider } from '@polkadot/api';
import { web3Accounts, web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { base58Decode, base58Encode } from '@polkadot/util-crypto';
import Api, { ApiConfig } from 'manta-wasm-wallet-api';
import config from './config.json';

import * as axios from 'axios';
import BN from 'bn.js';

const rpc = config.RPC;
const types = config.TYPES;
const DEFAULT_PULL_SIZE = config.DEFAULT_PULL_SIZE;
const SIGNER_URL = config.SIGNER_URL;
const CHAIN_URL = config.BLOCKCHAIN_URL_LOCAL;

const asset_id = 1;
const private_transfer_amount = 1000000000000000000;
const to_private_amount = 100000000000000000000;
const amount_threshold = 50000000000000000000;

async function init_api() {
  // Polkadot.js API
  const provider = new WsProvider(CHAIN_URL);
  const api = await ApiPromise.create({ provider, types, rpc });
  const [chain, nodeName, nodeVersion] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version()
  ]);
  console.log(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`);

  const extensions = await web3Enable('my cool dapp');
  if (extensions.length === 0) {
    return;
  }
  const allAccounts = await web3Accounts();
  const account = allAccounts[0];
  const injector = await web3FromSource(account.meta.source);
  const signer = account.address;
  console.log("address:" + account.address);
  console.log("signer:" + injector.signer);
  api.setSigner(injector.signer)
  const { nonce, data: balance } = await api.query.system.account(signer);
  console.log("balance:" + balance + ", nonce:" + nonce);
  return {
    api,
    signer
  };
}

const getPrivateAddress = async (wasm, wallet) => {
  const keys = await wallet.receiving_keys(
    new wasm.ReceivingKeyRequest('GetAll')
  );
  const privateAddressRaw = keys[0];
  const privateAddressBytes = [
    ...privateAddressRaw.spend,
    ...privateAddressRaw.view
  ];
  return base58Encode(privateAddressBytes);
};

const privateAddressToJson = (privateAddress) => {
  const bytes = base58Decode(privateAddress);
  return JSON.stringify({
    spend: Array.from(bytes.slice(0, 32)),
    view: Array.from(bytes.slice(32))
  });
};

const init_sync = async (wasmWallet) => {
  console.log('Beginning initial sync');
  const startTime = performance.now();
  await wasmWallet.restart();
  const endTime = performance.now();
  console.log(
    `Initial sync finished in ${(endTime - startTime) / 1000} seconds`
  );
}

const sync_measure = async (wasmWallet, flag) => {
  if(!flag) {
    await wasmWallet.sync();
  } else {
    console.log('Beginning sync');
    const startTime2 = performance.now();
    await wasmWallet.sync();
    const endTime2 = performance.now();
    console.log(`Sync finished in ${(endTime2 - startTime2) / 1000} seconds`);
  }
}

const to_private = async (wasm, wasmWallet) => {
  console.log("to_private transaction...");
  const txJson = `{ "Mint": { "id": ${asset_id}, "value": "${to_private_amount}" }}`;
  const transaction = wasm.Transaction.from_string(txJson);
  try {
    const res = await wasmWallet.post(transaction, null);
    console.log("to_private result:" + res);
  } catch (error) {
    console.error('Transaction failed', error);
  }
}

// TODO: use AssetManager to get asset information
const private_transfer = async (api, signer, wasm, wasmWallet) => {
  console.log("private_transfer transaction...");
  const addressJson = privateAddressToJson("3NfF4tBBmHjzFXUVwo4WPzjGRCjYtx73D237MSk5hatghxKLSMNc2UJKywtbHSp58CEWrPvDFkAQRYabo53zfk6w");
  const txJson = `{ "PrivateTransfer": [{ "id": ${asset_id}, "value": "${private_transfer_amount}" }, ${addressJson} ]}`;
  const transaction = wasm.Transaction.from_string(txJson);
  console.log("tx:" + txJson);
  const assetMetadataJson = `{ "decimals": 18, "symbol": "pDOL" }`;
  const assetMetadata = wasm.AssetMetadata.from_string(assetMetadataJson);
  const posts = await wasmWallet.sign(transaction, assetMetadata);
  const transactions = [];
  for (let i = 0; i < posts.length; i++) {
    const transaction = await mapPostToTransaction(posts[i], api);
    transactions.push(transaction);
  }
  const private_tx_res = await transactionsToBatches(transactions, api);
  for (let i = 0; i < private_tx_res.length; i++) {
    // console.log("tx:" + private_tx_res[i]);
    try {
      await private_tx_res[i].signAndSend(signer, (status, events) => {});
    } catch (error) {
      console.error('Transaction failed', error);
    }
  }
  console.log("finish private transfer 1 pDOL.");
}

async function main() {
  const {api, signer} = await init_api();

  // -------------
  // INIT WASM-WALLET
  const wasm = await import('manta-wasm-wallet');
  const wasmSigner = new wasm.Signer(SIGNER_URL);
  const wasmApiConfig = new ApiConfig(
    api, signer, DEFAULT_PULL_SIZE, DEFAULT_PULL_SIZE
  );
  const wasmApi = new Api(wasmApiConfig);
  const wasmLedger = new wasm.PolkadotJsLedger(wasmApi);
  const wasmWallet = new wasm.Wallet(wasmLedger, wasmSigner);

  // Get private address
  const privateAddress = await getPrivateAddress(wasm, wasmWallet);
  console.log("private address:" + privateAddress);

  // Get signer version
  const version_res = await axios.get(`${SIGNER_URL}version`, {
    timeout: 1500
  });
  const signerVersion = version_res.data;
  console.log("signer version:" + signerVersion);

  // Get balance, should be zero.
  print_private_balance(wasm, wasmWallet, "Before sync");

  // Initial sync
  await init_sync(wasmWallet);

  // Get balance again
  const balance = print_private_balance(wasm, wasmWallet, "After init sync");
  if(balance < amount_threshold) {
    // TO PRIVATE TRANSFER
    await to_private(wasm, wasmWallet);
  } else {
    // PRIVATE TRANSFER
    await private_transfer(api, signer, wasm, wasmWallet);
  }
  setTimeout(function(){}, 1000);

  // Validate private asset balance changed.
  print_private_balance(wasm, wasmWallet, "After transfer");

  // Sync after transfer
  await wasmWallet.sync();
  print_private_balance(wasm, wasmWallet, "Sync1 after transfer");

  setTimeout(function(){}, 1000);
  await wasmWallet.sync();
  print_private_balance(wasm, wasmWallet, "Sync2 After transfer");
  
  console.log("END");
}

const print_private_balance = (wasm, wasmWallet, info) => {
  const balance = wasmWallet.balance(new wasm.AssetId(asset_id));
  console.log(`private asset balance[${info}]:` + balance);
  return balance;
}

main()

const mapPostToTransaction = async (post, api) => {
  post.sources = post.sources.map(source => new BN(source));
  post.sinks = post.sinks.map(sink => new BN(sink));

  let sources = post.sources.length;
  let senders = post.sender_posts.length;
  let receivers = post.receiver_posts.length;
  let sinks = post.sinks.length;

  if (sources == 1 && senders == 0 && receivers == 1 && sinks == 0) {
    const mint_tx = await api.tx.mantaPay.toPrivate(post);
    return mint_tx;
  } else if (sources == 0 && senders == 2 && receivers == 2 && sinks == 0) {
    const private_transfer_tx = await api.tx.mantaPay.privateTransfer(post);
    return private_transfer_tx;
  } else if (sources == 0 && senders == 2 && receivers == 1 && sinks == 1) {
    const reclaim_tx = await api.tx.mantaPay.toPublic(post);
    return reclaim_tx;
  } else {
    throw new Error(
      'Invalid transaction shape; there is no extrinsic for a transaction'
          + `with ${sources} sources, ${senders} senders, `
          + ` ${receivers} receivers and ${sinks} sinks`
    );
  }
};

const transactionsToBatches = async (transactions, api) => {
  const MAX_BATCH = 2;
  const batches = [];
  for (let i = 0; i < transactions.length; i += MAX_BATCH) {
    const transactionsInSameBatch = transactions.slice(i, i + MAX_BATCH);
    const batchTransaction = await api.tx.utility.batch(
      transactionsInSameBatch
    );
    batches.push(batchTransaction);
  }
  return batches;
}