// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
require("dotenv").config();
const hre = require("hardhat");

async function main() {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
