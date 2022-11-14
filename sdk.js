import { ApiPromise, WsProvider } from '@polkadot/api';
import { web3Accounts, web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { base58Decode, base58Encode } from '@polkadot/util-crypto';
import Api, { ApiConfig } from 'manta-wasm-wallet-api';

import * as axios from 'axios';
import BN from 'bn.js';

import config from './config.json';

const rpc = config.RPC;
const types = config.TYPES;
const DEFAULT_PULL_SIZE = config.DEFAULT_PULL_SIZE;
const SIGNER_URL = config.SIGNER_URL;
const CHAIN_URL = config.BLOCKCHAIN_URL_LOCAL;
const PRIVATE_ASSET_PREFIX = "p"

// TODO: url, account as parameters
export async function init_api() {
    // Polkadot.js API
    const provider = new WsProvider(CHAIN_URL);
    const api = await ApiPromise.create({ provider, types, rpc });
    const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version()
    ]);
    console.log(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`);

    const extensions = await web3Enable('Polkadot App');
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

export async function init_wasm_sdk(api, signer) {
    const wasm = await import('manta-wasm-wallet');
    const wasmSigner = new wasm.Signer(SIGNER_URL);
    const wasmApiConfig = new ApiConfig(
        api, signer, DEFAULT_PULL_SIZE, DEFAULT_PULL_SIZE
    );
    const wasmApi = new Api(wasmApiConfig);
    const wasmLedger = new wasm.PolkadotJsLedger(wasmApi);
    const wasmWallet = new wasm.Wallet(wasmLedger, wasmSigner);
    return {
        wasm,
        wasmWallet
    }
}

export async function get_signer_version() {
    const version_res = await axios.get(`${SIGNER_URL}version`, {
        timeout: 1500
    });
    const signerVersion = version_res.data;
    console.log("signer version:" + signerVersion);
}

export async function getPrivateAddress(wasm, wallet) {
    const keys = await wallet.receiving_keys(
        new wasm.ReceivingKeyRequest('GetAll')
    );
    const privateAddressRaw = keys[0];
    const privateAddressBytes = [
        ...privateAddressRaw.spend,
        ...privateAddressRaw.view
    ];
    const privateAddress = base58Encode(privateAddressBytes);
    console.log("private address:" + privateAddress);
    return privateAddress;
};

export function privateAddressToJson(privateAddress) {
    const bytes = base58Decode(privateAddress);
    return JSON.stringify({
        spend: Array.from(bytes.slice(0, 32)),
        view: Array.from(bytes.slice(32))
    });
};

export async function init_sync(wasmWallet) {
    console.log('Beginning initial sync');
    const startTime = performance.now();
    await wasmWallet.restart();
    const endTime = performance.now();
    console.log(
        `Initial sync finished in ${(endTime - startTime) / 1000} seconds`
    );
}

export async function sync_measure(wasmWallet, flag) {
    if (!flag) {
        await wasmWallet.sync();
    } else {
        console.log('Beginning sync');
        const startTime2 = performance.now();
        await wasmWallet.sync();
        const endTime2 = performance.now();
        console.log(`Sync finished in ${(endTime2 - startTime2) / 1000} seconds`);
    }
}

export async function to_private(wasm, wasmWallet, asset_id, to_private_amount) {
    console.log("to_private transaction...");
    const txJson = `{ "Mint": { "id": ${asset_id}, "value": "${to_private_amount}" }}`;
    const transaction = wasm.Transaction.from_string(txJson);
    try {
        const res = await wasmWallet.post(transaction, null);
        console.log("📜to_private result:" + res);
    } catch (error) {
        console.error('Transaction failed', error);
    }
}

export async function private_transfer(api, signer, wasm, wasmWallet, asset_id, private_transfer_amount, to_private_address) {
    console.log("private_transfer transaction...");
    const addressJson = privateAddressToJson(to_private_address);
    const txJson = `{ "PrivateTransfer": [{ "id": ${asset_id}, "value": "${private_transfer_amount}" }, ${addressJson} ]}`;
    const transaction = wasm.Transaction.from_string(txJson);

    // construct asset metadata json by query api
    const asset_meta = await api.query.assetManager.assetIdMetadata(asset_id);
    const json = JSON.stringify(asset_meta.toHuman());
    const jsonObj = JSON.parse(json);
    const decimals = jsonObj["decimals"];
    const symbol = jsonObj["symbol"];
    const assetMetadataJson = `{ "decimals": ${decimals}, "symbol": "${PRIVATE_ASSET_PREFIX}${symbol}" }`;
    console.log("📜asset metadata:" + assetMetadataJson);

    const assetMetadata = wasm.AssetMetadata.from_string(assetMetadataJson);
    const posts = await wasmWallet.sign(transaction, assetMetadata);
    const transactions = [];
    for (let i = 0; i < posts.length; i++) {
        const transaction = await mapPostToTransaction(posts[i], api);
        transactions.push(transaction);
    }
    const private_tx_res = await transactionsToBatches(transactions, api);
    for (let i = 0; i < private_tx_res.length; i++) {
        try {
            await private_tx_res[i].signAndSend(signer, (status, events) => { });
        } catch (error) {
            console.error('Transaction failed', error);
        }
    }
    console.log("📜finish private transfer 1 pDOL.");
}

export async function mapPostToTransaction(post, api) {
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

export async function transactionsToBatches(transactions, api) {
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

export function print_private_balance(wasm, wasmWallet, asset_id, info) {
    const balance = wasmWallet.balance(new wasm.AssetId(asset_id));
    console.log(`private asset balance[${info}]:` + balance);
    return balance;
}