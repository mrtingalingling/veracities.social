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

const sources = {
  'ValidationMarket.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'ValidationMarket.sol'), 'utf8')
  },
  'CourtroomEscrow.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'CourtroomEscrow.sol'), 'utf8')
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

console.log('[Compiler] Compiling Solidity contracts with solc...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

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
    const artifact = {
      contractName,
      sourceFile,
      abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object
    };

    const outPath = path.join(buildDir, `${contractName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
    console.log(`[Compiler] Generated artifact: ${outPath}`);
  }
}

console.log('[Compiler] Successfully compiled all contracts.');
