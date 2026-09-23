import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contractsDir = path.join(rootDir, 'contracts');
const buildDir = path.join(contractsDir, 'build');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

function findImports(importPath) {
  let fullPath = path.resolve(contractsDir, importPath);
  if (fs.existsSync(fullPath)) {
    return { contents: fs.readFileSync(fullPath, 'utf8') };
  }
  // Try relative to contractsDir without leading ./
  const cleanPath = importPath.replace(/^\.\//, '');
  fullPath = path.resolve(contractsDir, cleanPath);
  if (fs.existsSync(fullPath)) {
    return { contents: fs.readFileSync(fullPath, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

const sources = {
  'proxy/Initializable.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'proxy/Initializable.sol'), 'utf8')
  },
  'proxy/UUPSUpgradeable.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'proxy/UUPSUpgradeable.sol'), 'utf8')
  },
  'proxy/ERC1967Proxy.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'proxy/ERC1967Proxy.sol'), 'utf8')
  },
  'interfaces/IDAOFrameworks.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'interfaces/IDAOFrameworks.sol'), 'utf8')
  },
  'ValidationMarket.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'ValidationMarket.sol'), 'utf8')
  },
  'CourtroomEscrow.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'CourtroomEscrow.sol'), 'utf8')
  },
  'EpistemicGovernor.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'EpistemicGovernor.sol'), 'utf8')
  }
};

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    viaIR: true,
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
};

console.log('[Compiler] Compiling Solidity contracts with solc (optimizer: 200 runs, viaIR: true)...');
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) {
  let hasErrors = false;
  for (const error of output.errors) {
    if (error.severity === 'error') {
      console.error(error.formattedMessage);
      hasErrors = true;
    } else {
      console.warn(error.formattedMessage);
    }
  }
  if (hasErrors) {
    process.exit(1);
  }
}

for (const sourceFile in output.contracts) {
  for (const contractName in output.contracts[sourceFile]) {
    const contract = output.contracts[sourceFile][contractName];
    // Skip abstract contracts or interfaces with no bytecode unless needed
    const artifact = {
      contractName,
      sourceFile,
      abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object
    };

    const outPath = path.join(buildDir, `${contractName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
    console.log(`[Compiler] Generated artifact: ${outPath} (Bytecode size: ${Math.floor(artifact.bytecode.length / 2)} bytes)`);
  }
}

console.log('[Compiler] Successfully compiled all upgradeable contracts, proxies, and interfaces.');
