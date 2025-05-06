const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Deploy DTAIOCToken
  const Token = await ethers.getContractFactory("DTAIOCToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  console.log("DTAIOCToken deployed to:", token.target);

  // Deploy DTAIOCNFT
  const NFT = await ethers.getContractFactory("DTAIOCNFT");
  const nft = await NFT.deploy();
  await nft.waitForDeployment();
  console.log("DTAIOCNFT deployed to:", nft.target);

  // Deploy DTAIOCStaking
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";
  const Staking = await ethers.getContractFactory("DTAIOCStaking");
  const staking = await Staking.deploy(token.target, platformAddress);
  await staking.waitForDeployment();
  console.log("DTAIOCStaking deployed to:", staking.target);

  // Verify staking contract owner
  const stakingOwner = await staking.owner();
  console.log("DTAIOCStaking owner:", stakingOwner);
  if (stakingOwner !== deployer.address) {
    console.warn("Warning: Deployer is not the owner of DTAIOCStaking");
  }

  // Deploy MockBasenameResolver
  const Resolver = await ethers.getContractFactory("MockBasenameResolver");
  const resolver = await Resolver.deploy();
  await resolver.waitForDeployment();
  console.log("MockBasenameResolver deployed to:", resolver.target);

  // Deploy DTAIOCGame
  const DTAIOCGame = await hre.ethers.getContractFactory("DTAIOCGame");
  const backendWallet = new hre.ethers.Wallet(process.env.BACKENDSIGNERPRIVATEKEY);
  const backendSigner = backendWallet.address;
  const Game = await ethers.getContractFactory("DTAIOCGame");
  const game = await Game.deploy(token.target, nft.target, staking.target, resolver.target, backendSigner);
  await game.waitForDeployment();
  console.log("DTAIOCGame deployed to:", game.target);

  // Configure permissions
  console.log("Setting game contract for NFT...");
  const nftTx = await nft.setGameContract(game.target);
  await nftTx.wait();
  console.log("NFT game contract set to:", game.target);

  console.log("Setting game contract for Staking...");
  try {
    const stakingTx = await staking.setGameContract(game.target);
    await stakingTx.wait();
    console.log("Staking game contract set to:", game.target);
  } catch (error) {
    console.error("Failed to set game contract for Staking:", error);
    throw error;
  }

  // Verify gameContract
  const gameContractAddress = await staking.gameContract();
  console.log("Verified gameContract in Staking:", gameContractAddress);
  if (gameContractAddress === ethers.ZeroAddress) {
    throw new Error("Failed to set gameContract in Staking");
  }

  // Output addresses for forkGameSimulation.js
  console.log("Update forkGameSimulation.js with:");
  console.log(`tokenAddress: "${token.target}"`);
  console.log(`nftAddress: "${nft.target}"`);
  console.log(`stakingAddress: "${staking.target}"`);
  console.log(`resolverAddress: "${resolver.target}"`);
  console.log(`platformAddress: "${platformAddress}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });