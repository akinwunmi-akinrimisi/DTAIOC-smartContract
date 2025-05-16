const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy DTAIOCToken
  const DTAIOCToken = await hre.ethers.getContractFactory("DTAIOCToken");
  const token = await DTAIOCToken.deploy();
  await token.deployed();
  console.log("DTAIOCToken deployed to:", token.address);

  // Deploy DTAIOCNFT
  const DTAIOCNFT = await hre.ethers.getContractFactory("DTAIOCNFT");
  const nft = await DTAIOCNFT.deploy();
  await nft.deployed();
  console.log("DTAIOCNFT deployed to:", nft.address);

  // Deploy DTAIOCStaking
  const platformAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Example
  const DTAIOCStaking = await hre.ethers.getContractFactory("DTAIOCStaking");
  const staking = await DTAIOCStaking.deploy(token.address, platformAddress);
  await staking.deployed();
  console.log("DTAIOCStaking deployed to:", staking.address);

  // Deploy MockBasenameResolver
  const BasenameResolver = await hre.ethers.getContractFactory("MockBasenameResolver");
  const basenameResolver = await BasenameResolver.deploy();
  await basenameResolver.deployed();
  console.log("MockBasenameResolver deployed to:", basenameResolver.address);

  // Deploy DTAIOCGame
  const backendSigner = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // Example
  const DTAIOCGame = await hre.ethers.getContractFactory("DTAIOCGame");
  const game = await DTAIOCGame.deploy(
    token.address,
    nft.address,
    staking.address,
    basenameResolver.address,
    backendSigner,
    platformAddress
  );
  await game.deployed();
  console.log("DTAIOCGame deployed to:", game.address);

  // Configure NFT and Staking contracts
  await nft.setGameContract(game.address);
  await staking.setGameContract(game.address);

  // Deploy DTAIOCPaymaster
  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // Biconomy EntryPoint
  const Paymaster = await hre.ethers.getContractFactory("DTAIOCPaymaster");
  const paymaster = await Paymaster.deploy(entryPointAddress, platformAddress, basenameResolver.address);
  await paymaster.deployed();
  console.log("DTAIOCPaymaster deployed to:", paymaster.address);

  // Configure Paymaster
  await paymaster.setGameContract(game.address);
  await paymaster.setTokenContract(token.address);
  await paymaster.setStakingContract(staking.address);
  await paymaster.setNFTContract(nft.address);

  // Fund Paymaster
  await deployer.sendTransaction({ to: paymaster.address, value: ethers.utils.parseEther("1") });
  await paymaster.deposit({ value: ethers.utils.parseEther("1") });
  console.log("Paymaster funded with 1 ETH");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});