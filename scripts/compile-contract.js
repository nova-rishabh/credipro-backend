const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

function main() {
  console.log('Compiling Compact smart contract...');
  
  // Check if compact command exists and is the correct one (not Windows system compact)
  let hasCompact = false;
  try {
    const stdout = execSync('compact --version', { stdio: 'pipe' }).toString();
    if (stdout.includes('installed') || stdout.includes('compiler') || stdout.includes('0.')) {
      hasCompact = true;
    }
  } catch (e) {
    // Command failed or not found
  }

  if (hasCompact) {
    console.log('Compact compiler found. Compiling contract...');
    try {
      execSync('compact build ../contracts/Credipro.compact -o dist/contracts', { stdio: 'inherit' });
      console.log('Contract compiled successfully!');
      return;
    } catch (e) {
      console.error('Failed to compile contract with compact compiler:', e.message);
      // Fallback to pre-compiled if it fails
    }
  } else {
    console.warn('WARNING: Compact compiler CLI not found or conflicted with system utility.');
  }

  console.log('Falling back to pre-compiled contract artifacts...');
  const srcContracts = path.resolve(__dirname, '..', 'contracts');
  const destContracts = path.resolve(__dirname, '..', 'dist', 'contracts');

  if (fs.existsSync(srcContracts)) {
    try {
      copyFolderSync(srcContracts, destContracts);
      console.log('Copied pre-compiled contract artifacts from backend/contracts to backend/dist/contracts successfully!');
    } catch (e) {
      console.error('Failed to copy pre-compiled contract artifacts:', e);
      process.exit(1);
    }
  } else {
    console.error('CRITICAL ERROR: No pre-compiled contract artifacts found in backend/contracts!');
    process.exit(1);
  }
}

main();
