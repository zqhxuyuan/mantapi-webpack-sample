import { ApiPromise, WsProvider } from '@polkadot/api';
import { web3Accounts, web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { base58Encode } from '@polkadot/util-crypto';
import Api, { ApiConfig } from 'manta-wasm-wallet-api';
import * as axios from 'axios';
import config from './config.json';

async function main() {
    // Polkadot.js API
    const provider = new WsProvider(config.BLOCKCHAIN_URL);
    const rpc = config.RPC;
    const types = config.TYPES;
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
    const externalAccountSigner = account.address;
    console.log("address:" + account.address);
    console.log("signer:" + injector.signer);
    api.setSigner(injector.signer)
    const { nonce, data: balance } = await api.query.system.account(externalAccountSigner);
    console.log("balance:" + balance + ", nonce:" + nonce);

    console.log('INITIALIZING WALLET');
    const DEFAULT_PULL_SIZE = config.DEFAULT_PULL_SIZE;
    const SIGNER_URL = config.SIGNER_URL;
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
  
    // -------------
    // INIT WASM-WALLET
    const wasm = await import('manta-wasm-wallet');
    const wasmSigner = new wasm.Signer(SIGNER_URL);
    const wasmApiConfig = new ApiConfig(
      api, externalAccountSigner, DEFAULT_PULL_SIZE, DEFAULT_PULL_SIZE
    );
    const wasmApi = new Api(wasmApiConfig);
    const wasmLedger = new wasm.PolkadotJsLedger(wasmApi);
    const wasmWallet = new wasm.Wallet(wasmLedger, wasmSigner);
    const privateAddress = await getPrivateAddress(wasm, wasmWallet);
    console.log("private address:" + privateAddress);

    const version_res = await axios.get(`${SIGNER_URL}version`, {
      timeout: 1500
    });
    const signerVersion = version_res.data;
    console.log("signer version:" + signerVersion);

    console.log('Beginning initial sync');
    const startTime = performance.now();
    await wasmWallet.restart();
    const endTime = performance.now();
    console.log(
      `Initial sync finished in ${(endTime - startTime) / 1000} seconds`
    );

    // TO_PRIVATE TRANSFER
    // const txJson = `{ "Mint": { "id": 1, "value": "1000000000000000000" }}`;
    // const transaction = wasm.Transaction.from_string(txJson);
    // try {
    //   const res = await wasmWallet.post(transaction, null);
    //   console.log("to_private result:" + res);
    // } catch (error) {
    //   console.error('Transaction failed', error);
    // }
}

main()