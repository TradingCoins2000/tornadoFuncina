require("dotenv").config();
//const fetch = (...args) =>
//import("node-fetch").then(({ default: fetch }) => fetch(...args));
//let f1 = require("../../final2/alchemy-sdk-script.mjs");

//import { f1 } from "../../final2/alchemy-sdk-script.mjs";
//const {f1} = require("../../final2/alchemy-sdk-script.mjs");
const fs = require("fs");
const assert = require("assert");
const { bigInt } = require("snarkjs");
const crypto = require("crypto");
const circomlib = require("circomlib");
const merkleTree = require("fixed-merkle-tree");
const Web3 = require("web3");
const buildGroth16 = require("websnark/src/groth16");
const websnarkUtils = require("websnark/src/utils");
const { toWei } = require("web3-utils");

let web3, contract, netId, circuit, proving_key, groth16;
const MERKLE_TREE_HEIGHT = 20;
const RPC_URL = process.env.SEPOLIA_URL;
const PRIVATE_KEY = process.env.ETH_PK;
const WALLET2 = process.env.WALLET_2;

const CONTRACT_ADDRESS = "0x5c093a0dE175B839B1E0D2924DF47a090175876c"; // address of the contract ERC721Tronado2.sol!! at sepolia by me(by far).
const CONTRACT_ADDRESS2 = process.env.TOKEN; // address of the contractVotePres.sol at sepolia by me(by far).
const AMOUNT = "1";
// CURRENCY = 'ETH'

/** Generate random number of specified byte length */
const rbigint = (nbytes) => bigInt.leBuff2int(crypto.randomBytes(nbytes));

/** Compute pedersen hash */
const pedersenHash = (data) =>
  circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0];

/** BigNumber to hex string of specified length */
const toHex = (number, length = 32) =>
  "0x" +
  (number instanceof Buffer
    ? number.toString("hex")
    : bigInt(number).toString(16)
  ).padStart(length * 2, "0");

/**
 * Create deposit object from secret and nullifier
 */
function createDeposit(nullifier, secret) {
  let deposit = { nullifier, secret };
  deposit.preimage = Buffer.concat([
    deposit.nullifier.leInt2Buff(31),
    deposit.secret.leInt2Buff(31),
  ]);
  deposit.commitment = pedersenHash(deposit.preimage);
  deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31));
  return deposit;
}

/**
 * Make an ETH deposit
 */
async function deposit() {
  const deposit = createDeposit(rbigint(31), rbigint(31));
  console.log("Sending deposit transaction...");
  /////////////////////////////////

  const denomination = 36; //ver como correr ese numero, es el index del nft;
  ///////////////////////////////////
  ////////////////////////////////////

  // mint el nft original
  const tx2 = await contract2.methods
    .safeMint(web3.eth.defaultAccount)
    .send({ from: web3.eth.defaultAccount, gas: 2e6 });
  console.log(
    "Mint new NFT! denomination, hash=>",
    denomination,
    tx2.transactionHash
  );
  // aprueba el nft original para la cuenta tornado:
  const tx3 = await contract2.methods
    .approve(CONTRACT_ADDRESS, denomination)
    .send({ from: web3.eth.defaultAccount, gas: 2e6 });
  console.log("aprobado el delagar! hash=>", tx3.transactionHash);
  const tx = await contract.methods
    .deposit(toHex(deposit.commitment), denomination)
    .send({ from: web3.eth.defaultAccount, gas: 2e6 });
  console.log("Deposited !!!!");
  //console.log("deposit.preimage=>", toHex(deposit.preimage, 62));
  //return `tornado-${netId}-${toHex(deposit.preimage, 62)}`;
  return `${toHex(deposit.preimage, 62)}`;
}

/**
 * Do the withdrawal
 * @param note Note to withdraw
 * @param recipient Recipient address
 */
async function withdraw(note, recipient) {
  const deposit = parseNote(note);
  const { proof, args } = await generateSnarkProof(deposit, recipient);
  console.log("Sending withdrawal transaction...");
  console.log("Withdraw");
  // console.log("proof=>", proof);
  //console.log("args=>", args);
  const tx = await contract.methods
    .withdraw(proof, ...args)
    .send({ from: web3.eth.defaultAccount, gas: 1e6 });
  // console.log(`https://kovan.etherscan.io/tx/${tx.transactionHash}`);
}

/**
 * Parses Tornado.cash note
 * @param noteString the note
 */
function parseNote(noteString) {
  const noteRegex =
    // /tornado-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g;
    // /tornado-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g;
    /0x(?<note>[0-9a-fA-F]{124})/g;
  const match = noteRegex.exec(noteString);
  //console.log("match groups note =>", match.groups.note);
  // we are ignoring `currency`, `amount`, and `netId` for this minimal example
  const buf = Buffer.from(match.groups.note, "hex");
  // const buf = Buffer.from(noteString, "hex");
  const nullifier = bigInt.leBuff2int(buf.slice(0, 31));
  const secret = bigInt.leBuff2int(buf.slice(31, 62));
  return createDeposit(nullifier, secret);
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the contract, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */
async function generateMerkleProof(deposit) {
  console.log("Getting contract state...");
  const events = await contract.getPastEvents("Deposit", {
    fromBlock: 0,
    toBlock: "latest",
  });
  /////////////////////
  console.log(`Got ${events.length} deposit events`);
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map((e) => e.returnValues.commitment);
  const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves);

  // Find current commitment in the tree
  let depositEvent = events.find(
    (e) => e.returnValues.commitment === toHex(deposit.commitment)
  );
  let leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1;

  // Validate that our data is correct (optional)
  const isValidRoot = await contract.methods
    .isKnownRoot(toHex(tree.root()))
    .call();
  const isSpent = await contract.methods
    .isSpent(toHex(deposit.nullifierHash))
    .call();
  assert(isValidRoot === true, "Merkle tree is corrupted");
  assert(isSpent === false, "The note is already spent");
  assert(leafIndex >= 0, "The deposit is not found in the tree");

  // Compute merkle proof of our commitment
  const { pathElements, pathIndices } = tree.path(leafIndex);
  return { pathElements, pathIndices, root: tree.root() };
}

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param recipient Funds recipient
 */
async function generateSnarkProof(deposit, recipient) {
  // Compute merkle proof of our commitment
  const { root, pathElements, pathIndices } = await generateMerkleProof(
    deposit
  );

  // Prepare circuit input
  const input = {
    // Public snark inputs
    root: root,
    nullifierHash: deposit.nullifierHash,
    recipient: bigInt(recipient),
    relayer: 0,
    fee: 0,
    refund: 0,

    // Private snark inputs
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: pathElements,
    pathIndices: pathIndices,
  };

  console.log("Generating SNARK proof...");
  const proofData = await websnarkUtils.genWitnessAndProve(
    groth16,
    input,
    circuit,
    proving_key
  );
  const { proof } = websnarkUtils.toSolidityInput(proofData);

  const args = [
    toHex(input.root),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund),
  ];

  return { proof, args };
}

async function main() {
  web3 = new Web3(
    new Web3.providers.HttpProvider(RPC_URL, { timeout: 5 * 60 * 1000 }),
    null,
    {
      transactionConfirmationBlocks: 1,
    }
  );
  circuit = require(__dirname + "/../build/circuits/withdraw.json");
  proving_key = fs.readFileSync(
    __dirname + "/../build/circuits/withdraw_proving_key.bin"
  ).buffer;
  groth16 = await buildGroth16();
  netId = await web3.eth.net.getId();
  contract = new web3.eth.Contract(
    require("../artifacts/contracts/ERC721Tornado2.sol/ERC721Tornado2.json").abi,
    CONTRACT_ADDRESS
  );
  contract2 = new web3.eth.Contract(
    require("../artifacts/contracts/VotePresNFT.sol/VotePresNFT.json").abi,
    CONTRACT_ADDRESS2
  );

  const account = web3.eth.accounts.privateKeyToAccount("0x" + PRIVATE_KEY);
  web3.eth.accounts.wallet.add("0x" + PRIVATE_KEY);
  // eslint-disable-next-line require-atomic-updates
  web3.eth.defaultAccount = account.address;
  //
  //const total = await contract2.methods.balanceOf(account.address).call();

  const note = await deposit();
  console.log("note=>", note);
  await withdraw(note, WALLET2);
  console.log("Done!!!!");
  process.exit();
}

main();
