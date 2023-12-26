// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
require("dotenv").config();
const hre = require("hardhat");

async function main() {
  //const _verifier = "0x44053158940898135d48f927a358d6db91337f4d";
  //const _hasher = "0x01b4e4e6e468bb7f55101cfffb8cf7ab4b09c6a9";
  //const _merkleTreeHeight = 20;
  //const _token = "0xc923f9fc218c372fb06a69977aa5ad51e019e52a";
  const _verifier = process.env.VERIFIER;
  const _hasher = process.env.HASHER;
  const _merkleTreeHeight = process.env.MERKLE_TREE_HEIGHT;
  const _token = process.env.TOKEN;
  const eRC721Tornado = await hre.ethers.deployContract("ERC721Tornado2", [
    _verifier,
    _hasher,
    _merkleTreeHeight,
    _token,
  ]);

  await eRC721Tornado.waitForDeployment();

  console.log(`ERC721Tornado2 deployed to ${eRC721Tornado.target}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
