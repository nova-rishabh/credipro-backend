import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js/contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js/types';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { toHex } from '@midnight-ntwrk/midnight-js/utils';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { Buffer } from 'buffer';
import * as Rx from 'rxjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Contract } from '../dist/contracts/contract/index.js';

// Load env vars
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const network = process.env.MIDNIGHT_CHAIN_ID || 'preprod';
setNetworkId(network as any);

const indexerHttpUrl = process.env.MIDNIGHT_INDEXER_HTTP_URL || 'https://indexer.preprod.midnight.network/api/v4/graphql';
const indexerWsUrl = process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const nodeUrl = process.env.MIDNIGHT_RPC_URL || 'https://rpc.preprod.midnight.network';
const proofServerUrl = 'http://127.0.0.1:6300';

const currentDir = path.resolve(__dirname);
const zkConfigPath = path.resolve(currentDir, '..', 'dist', 'contracts', 'zkir');

// Pre-compile the contract
const compiledContract = CompiledContract.make('Credipro', Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

// We need an empty private state type for Midnight SDK if none is defined
const emptyPrivateState = {};

interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

const deriveKeysFromSeed = (seed: string) => {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Failed to init HDWallet');
  
  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') throw new Error('Failed to derive keys');
  
  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

const signTransactionIntents = (
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
) => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      proofMarker,
      'pre-binding',
      intent.serialize(),
    );
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
};

const createWalletAndMidnightProvider = async (ctx: WalletContext): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter(s => s.isSynced || (s.shielded.state.progress.appliedIndex >= s.shielded.state.progress.highestRelevantWalletIndex && s.shielded.state.progress.highestRelevantWalletIndex > 0))));
  return {
    getCoinPublicKey() { return state.shielded.coinPublicKey.toHexString(); },
    getEncryptionPublicKey() { return state.shielded.encryptionPublicKey.toHexString(); },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(tx, 
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as any;
    },
  };
};

const buildWalletAndWaitForFunds = async (seed: string): Promise<WalletContext> => {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const walletConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: indexerHttpUrl, indexerWsUrl: indexerWsUrl },
    provingServerUrl: new URL(proofServerUrl),
    relayURL: new URL(nodeUrl.replace(/^http/, 'ws')),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig as any,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log(`Unshielded Address (send tNight here): ${unshieldedKeystore.getBech32Address()}`);
  console.log('Fund your wallet with tNight from the faucet: https://faucet.preprod.midnight.network/');
  
  // Wait for sync
  console.log('Waiting for wallet to sync with Midnight Network (this can take 1-2 minutes)...');
  const state = await Rx.firstValueFrom(wallet.state().pipe(
    Rx.tap(s => {
      const shieldedApplied = s.shielded.state.progress.appliedIndex;
      const shieldedTip = s.shielded.state.progress.highestRelevantWalletIndex;
      const unshieldedApplied = s.unshielded.state.progress.appliedId;
      const unshieldedTip = s.unshielded.state.progress.highestTransactionId;
      console.log(`Sync Progress -> Shielded: ${shieldedApplied}/${shieldedTip} | Unshielded: ${unshieldedApplied}/${unshieldedTip} | Synced: ${s.isSynced}`);
    }),
    Rx.filter(s => s.isSynced || (s.shielded.state.progress.appliedIndex >= s.shielded.state.progress.highestRelevantWalletIndex && s.shielded.state.progress.highestRelevantWalletIndex > 0))
  ));
  console.log('Wallet is fully synchronized!');

  // Wait for funds
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    console.log('Waiting for incoming tokens...');
    await Rx.firstValueFrom(wallet.state().pipe(
      Rx.tap(s => console.log(`Wallet State update: syncing = ${s.syncing}, balance = ${s.unshielded.balances[unshieldedToken().raw] ?? 0n}`)),
      Rx.filter(s => (s.unshielded.balances[unshieldedToken().raw] ?? 0n) > 0n)
    ));
    console.log('Tokens received!');
  } else {
    console.log(`Wallet balance: ${balance} tNight`);
  }

  // Register for dust
  const stateAfterFunds = await Rx.firstValueFrom(wallet.state().pipe(
    Rx.filter(s => s.isSynced || (s.shielded.state.progress.appliedIndex >= s.shielded.state.progress.highestRelevantWalletIndex && s.shielded.state.progress.highestRelevantWalletIndex > 0))
  ));
  if (stateAfterFunds.dust.availableCoins.length === 0) {
    const nightUtxos = stateAfterFunds.unshielded.availableCoins.filter((c: any) => c.meta?.registeredForDustGeneration !== true);
    if (nightUtxos.length > 0) {
      console.log('Registering UTXOs for dust generation...');
      const recipe = await wallet.registerNightUtxosForDustGeneration(
        nightUtxos,
        unshieldedKeystore.getPublicKey(),
        (payload) => unshieldedKeystore.signData(payload)
      );
      const finalized = await wallet.finalizeRecipe(recipe);
      await wallet.submitTransaction(finalized);
    }

    console.log('Waiting for dust tokens to generate...');
    await Rx.firstValueFrom(wallet.state().pipe(
      Rx.throttleTime(5000),
      Rx.filter(s => s.isSynced || (s.shielded.state.progress.appliedIndex >= s.shielded.state.progress.highestRelevantWalletIndex && s.shielded.state.progress.highestRelevantWalletIndex > 0)),
      Rx.filter(s => s.dust.balance(new Date()) > 0n)
    ));
    console.log('Dust tokens available!');
  }

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

const configureProviders = async (ctx: WalletContext) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'credipro-private-state',
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(indexerHttpUrl, indexerWsUrl),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUrl, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

async function main() {
  let seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed || seed.trim() === '') {
    console.log('Generating fresh wallet seed...');
    seed = toHex(Buffer.from(generateRandomSeed()));
    console.log(`SEED: ${seed}`);
    console.log('IMPORTANT: Save this seed if you need to access this wallet again.');
    
    // Save to .env
    const envPath = path.join(__dirname, '../../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('MIDNIGHT_WALLET_SEED=')) {
      envContent = envContent.replace(/MIDNIGHT_WALLET_SEED=.*/, `MIDNIGHT_WALLET_SEED=${seed}`);
    } else {
      envContent += `\nMIDNIGHT_WALLET_SEED=${seed}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log('Saved MIDNIGHT_WALLET_SEED to .env');
  } else {
    console.log('Reusing existing MIDNIGHT_WALLET_SEED from .env...');
  }

  const ctx = await buildWalletAndWaitForFunds(seed);
  console.log('Configuring Midnight providers...');
  const providers = await configureProviders(ctx);

  console.log('Deploying Credipro contract...');
  const deployedContract = await deployContract(providers, {
    compiledContract,
    privateStateId: 'crediproPrivateState',
    initialPrivateState: emptyPrivateState,
  });

  const contractAddress = deployedContract.deployTxData.public.contractAddress;
  console.log(`\nDEPLOYED! Contract Address: ${contractAddress}`);

  // Update .env file
  const envPath = path.join(__dirname, '../../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /MIDNIGHT_CONTRACT_ADDRESS=.*/,
    `MIDNIGHT_CONTRACT_ADDRESS=${contractAddress}`
  );
  envContent = envContent.replace(
    /REACT_APP_CONTRACT_ADDRESS=.*/,
    `REACT_APP_CONTRACT_ADDRESS=${contractAddress}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log('Saved MIDNIGHT_CONTRACT_ADDRESS and REACT_APP_CONTRACT_ADDRESS to .env');

  await ctx.wallet.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
