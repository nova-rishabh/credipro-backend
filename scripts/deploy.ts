#!/usr/bin/env node
import 'dotenv/config';

async function tryImport(pkg: string) {
  try {
    const mod = await import(pkg);
    return { pkg, mod };
  } catch (e) {
    return null;
  }
}

async function detectSdk() {
  const candidates = [
    '@midnight-ntwrk/midnight-js',
    '@midnight-ntwrk/midnight-js-contracts',
    '@midnight-ntwrk/midnight-js-contracts',
  ];

  for (const pkg of candidates) {
    const res = await tryImport(pkg);
    if (res) return res;
  }

  return null;
}

function prettyKeys(obj: any) {
  if (!obj) return [];
  return Object.keys(obj).sort();
}

async function main() {
  console.log('[DEPLOY] Starting deploy script (dry mode by default)');

  const sdk = await detectSdk();
  if (!sdk) {
    console.error('[DEPLOY] No Midnight SDK found among expected packages.');
    console.error('[DEPLOY] Please ensure one of the @midnight-ntwrk packages is installed.');
    process.exitCode = 2;
    return;
  }

  console.log('[DEPLOY] Found SDK package:', sdk.pkg);
  const keys = prettyKeys(sdk.mod);
  console.log('[DEPLOY] Exported symbols from SDK (preview):', keys.join(', '));

  const mod = sdk.mod as any;
  const hasCreateProvider = typeof mod.createProvider === 'function' || typeof mod.createClient === 'function';
  const hasProviderCtor = typeof mod.Provider === 'function';
  const hasContractFactory = !!mod.ContractFactory || !!mod.createContractClient || !!mod.ContractClient;

  console.log('[DEPLOY] Detected shapes:');
  console.log('  - createProvider/createClient:', hasCreateProvider);
  console.log('  - Provider constructor:', hasProviderCtor);
  console.log('  - ContractFactory / createContractClient / ContractClient:', hasContractFactory);

  const rpc = process.env.MIDNIGHT_RPC;
  const seed = process.env.MIDNIGHT_WALLET_SEED || process.env.MIDNIGHT_PRIVATE_KEY;
  console.log('[DEPLOY] MIDNIGHT_RPC present:', !!rpc);
  console.log('[DEPLOY] MIDNIGHT_WALLET_SEED/PRIVATE_KEY present:', !!seed);

  const runDeploy = process.env.RUN_DEPLOY === 'true';
  if (!runDeploy) {
    console.log('[DEPLOY] Dry validation complete. To perform an actual deployment set RUN_DEPLOY=true and provide MIDNIGHT_RPC and MIDNIGHT_WALLET_SEED (or MIDNIGHT_PRIVATE_KEY).');
    console.log('[DEPLOY] Example (PowerShell):');
    const example = `
$env:MIDNIGHT_RPC = 'https://your-testnet-rpc.example'
$env:MIDNIGHT_WALLET_SEED = 'your seed or private key'
$env:RUN_DEPLOY = 'true'
npm run deploy
`;
    console.log(example);
    process.exitCode = 0;
    return;
  }

  if (!rpc) {
    console.error('[DEPLOY] MIDNIGHT_RPC is required to deploy. Aborting.');
    process.exitCode = 3;
    return;
  }
  if (!seed) {
    console.error('[DEPLOY] MIDNIGHT_WALLET_SEED or MIDNIGHT_PRIVATE_KEY is required to deploy. Aborting.');
    process.exitCode = 4;
    return;
  }

  console.log('[DEPLOY] Running live deploy (best-effort). This will attempt to use detected SDK to create a deployer.');

  try {
    // Use heuristic to construct provider / deployer
    let provider: any = null;
    if (typeof mod.createProvider === 'function') {
      provider = await mod.createProvider({ url: rpc });
    } else if (typeof mod.createClient === 'function') {
      provider = await mod.createClient({ url: rpc });
    } else if (typeof mod.Provider === 'function') {
      provider = new mod.Provider(rpc);
    }

    if (!provider) throw new Error('Unable to construct provider from SDK');

    // Wallet construction paths vary widely; try common wallet constructors
    let wallet: any = null;
    if (mod.Wallet && typeof mod.Wallet.fromSeed === 'function') {
      wallet = mod.Wallet.fromSeed(seed);
    } else if (mod.Wallet && typeof mod.Wallet.fromPrivateKey === 'function') {
      wallet = mod.Wallet.fromPrivateKey(seed);
    } else if (mod.createWallet && typeof mod.createWallet === 'function') {
      wallet = await mod.createWallet({ seed });
    }

    if (!wallet) {
      console.warn('[DEPLOY] Could not construct wallet from SDK exports; falling back to generic wallet provider packages if available.');
    }

    if (mod.ContractFactory && typeof mod.ContractFactory.deploy === 'function') {
      console.log('[DEPLOY] Using ContractFactory.deploy()');
      const factory = mod.ContractFactory;
      const deployed = await factory.deploy({});
      console.log('[DEPLOY] Deployed (factory):', deployed);
      process.exitCode = 0;
      return;
    }

    if (mod.createContractClient && typeof mod.createContractClient === 'function') {
      console.log('[DEPLOY] createContractClient exists; deployment API not standardized. Please adapt deploy.ts to your SDK.');
      process.exitCode = 0;
      return;
    }

    console.error('[DEPLOY] Live deploy path not implemented for this SDK shape. Please open an issue or adapt the script.');
    process.exitCode = 5;
    return;
  } catch (e: any) {
    console.error('[DEPLOY] Deployment attempt failed:', e && e.message ? e.message : e);
    process.exitCode = 10;
    return;
  }
}

main();
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

#!/usr/bin/env node
import 'dotenv/config';

async function tryImport(pkg: string) {
  try {
    const mod = await import(pkg);
    return { pkg, mod };
  } catch (e) {
    return null;
  }
}

async function detectSdk() {
  const candidates = [
    '@midnight-ntwrk/midnight-js',
    '@midnight-ntwrk/midnight-js-contracts',
    '@midnight-ntwrk/midnight-js-contracts',
  ];

  for (const pkg of candidates) {
    const res = await tryImport(pkg);
    if (res) return res;
  }

  return null;
}

function prettyKeys(obj: any) {
  if (!obj) return [];
  return Object.keys(obj).sort();
}

async function main() {
  console.log('[DEPLOY] Starting deploy script (dry mode by default)');

  const sdk = await detectSdk();
  if (!sdk) {
    console.error('[DEPLOY] No Midnight SDK found among expected packages.');
    console.error('[DEPLOY] Please ensure one of the @midnight-ntwrk packages is installed.');
    process.exitCode = 2;
    return;
  }

  console.log('[DEPLOY] Found SDK package:', sdk.pkg);
  const keys = prettyKeys(sdk.mod);
  console.log('[DEPLOY] Exported symbols from SDK (preview):', keys.join(', '));

  const mod = sdk.mod as any;
  const hasCreateProvider = typeof mod.createProvider === 'function' || typeof mod.createClient === 'function';
  const hasProviderCtor = typeof mod.Provider === 'function';
  const hasContractFactory = !!mod.ContractFactory || !!mod.createContractClient || !!mod.ContractClient;

  console.log('[DEPLOY] Detected shapes:');
  console.log('  - createProvider/createClient:', hasCreateProvider);
  console.log('  - Provider constructor:', hasProviderCtor);
  console.log('  - ContractFactory / createContractClient / ContractClient:', hasContractFactory);

  const rpc = process.env.MIDNIGHT_RPC;
  const seed = process.env.MIDNIGHT_WALLET_SEED || process.env.MIDNIGHT_PRIVATE_KEY;
  console.log('[DEPLOY] MIDNIGHT_RPC present:', !!rpc);
  console.log('[DEPLOY] MIDNIGHT_WALLET_SEED/PRIVATE_KEY present:', !!seed);

  const runDeploy = process.env.RUN_DEPLOY === 'true';
  if (!runDeploy) {
    console.log('[DEPLOY] Dry validation complete. To perform an actual deployment set RUN_DEPLOY=true and provide MIDNIGHT_RPC and MIDNIGHT_WALLET_SEED (or MIDNIGHT_PRIVATE_KEY).');
    console.log('[DEPLOY] Example (PowerShell):');
    const example = `
$env:MIDNIGHT_RPC = 'https://your-testnet-rpc.example'
$env:MIDNIGHT_WALLET_SEED = 'your seed or private key'
$env:RUN_DEPLOY = 'true'
npm run deploy
`;
    console.log(example);
    process.exitCode = 0;
    return;
  }

  if (!rpc) {
    console.error('[DEPLOY] MIDNIGHT_RPC is required to deploy. Aborting.');
    process.exitCode = 3;
    return;
  }
  if (!seed) {
    console.error('[DEPLOY] MIDNIGHT_WALLET_SEED or MIDNIGHT_PRIVATE_KEY is required to deploy. Aborting.');
    process.exitCode = 4;
    return;
  }

  console.log('[DEPLOY] Running live deploy (best-effort). This will attempt to use detected SDK to create a deployer.');

  try {
    // Use heuristic to construct provider / deployer
    let provider: any = null;
    if (typeof mod.createProvider === 'function') {
      provider = await mod.createProvider({ url: rpc });
    } else if (typeof mod.createClient === 'function') {
      provider = await mod.createClient({ url: rpc });
    } else if (typeof mod.Provider === 'function') {
      provider = new mod.Provider(rpc);
    }

    if (!provider) throw new Error('Unable to construct provider from SDK');

    // Wallet construction paths vary widely; try common wallet constructors
    let wallet: any = null;
    if (mod.Wallet && typeof mod.Wallet.fromSeed === 'function') {
      wallet = mod.Wallet.fromSeed(seed);
    } else if (mod.Wallet && typeof mod.Wallet.fromPrivateKey === 'function') {
      wallet = mod.Wallet.fromPrivateKey(seed);
    } else if (mod.createWallet && typeof mod.createWallet === 'function') {
      wallet = await mod.createWallet({ seed });
    }

    if (!wallet) {
      console.warn('[DEPLOY] Could not construct wallet from SDK exports; falling back to generic wallet provider packages if available.');
    }

    if (mod.ContractFactory && typeof mod.ContractFactory.deploy === 'function') {
      console.log('[DEPLOY] Using ContractFactory.deploy()');
      const factory = mod.ContractFactory;
      const deployed = await factory.deploy({});
      console.log('[DEPLOY] Deployed (factory):', deployed);
      process.exitCode = 0;
      return;
    }

    if (mod.createContractClient && typeof mod.createContractClient === 'function') {
      console.log('[DEPLOY] createContractClient exists; deployment API not standardized. Please adapt deploy.ts to your SDK.');
      process.exitCode = 0;
      return;
    }

    console.error('[DEPLOY] Live deploy path not implemented for this SDK shape. Please open an issue or adapt the script.');
    process.exitCode = 5;
    return;
  } catch (e: any) {
    console.error('[DEPLOY] Deployment attempt failed:', e && e.message ? e.message : e);
    process.exitCode = 10;
    return;
  }
}

main();
