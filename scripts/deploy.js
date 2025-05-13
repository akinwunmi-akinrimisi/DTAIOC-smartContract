const hre = require("hardhat");

async function verifyContract(contractAddress, constructorArguments, contractName) {
  console.log(`Verifying ${contractName} at ${contractAddress}...`);
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArguments,
    });
    console.log(`${contractName} verified successfully!`);
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log(`${contractName} is already verified.`);
    } else {
      console.error(`Failed to verify ${contractName}:`, error.message);
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Base Sepolia EntryPoint address (verify with Base docs)
  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";

  // Deploy DTAIOCToken
  const DTAIOCTokenFactory = await hre.ethers.getContractFactory("DTAIOCToken");
  const dtaiocToken = await DTAIOCTokenFactory.deploy();
  await dtaiocToken.waitForDeployment();
  console.log("DTAIOCToken deployed to:", dtaiocToken.target);
  await verifyContract(dtaiocToken.target, [], "DTAIOCToken");

  // Deploy DTAIOCNFT
  const DTAIOCNFTFactory = await hre.ethers.getContractFactory("DTAIOCNFT");
  const dtaiocNFT = await DTAIOCNFTFactory.deploy();
  await dtaiocNFT.waitForDeployment();
  console.log("DTAIOCNFT deployed to:", dtaiocNFT.target);
  await verifyContract(dtaiocNFT.target, [], "DTAIOCNFT");

  // Deploy DTAIOCStaking
  const DTAIOCStakingFactory = await hre.ethers.getContractFactory("DTAIOCStaking");
  const dtaiocStaking = await DTAIOCStakingFactory.deploy(dtaiocToken.target, platformAddress);
  await dtaiocStaking.waitForDeployment();
  console.log("DTAIOCStaking deployed to:", dtaiocStaking.target);
  await verifyContract(dtaiocStaking.target, [dtaiocToken.target, platformAddress], "DTAIOCStaking");

  // Verify staking contract owner
  const stakingOwner = await dtaiocStaking.owner();
  console.log("DTAIOCStaking owner:", stakingOwner);
  if (stakingOwner !== deployer.address) {
    console.warn("Warning: Deployer is not the owner of DTAIOCStaking");
  }

  // Deploy MockBasenameResolver
  const MockResolverFactory = await hre.ethers.getContractFactory("MockBasenameResolver");
  const mockResolver = await MockResolverFactory.deploy();
  await mockResolver.waitForDeployment();
  console.log("MockBasenameResolver deployed to:", mockResolver.target);
  await verifyContract(mockResolver.target, [], "MockBasenameResolver");

  // Deploy DTAIOCGame
  const backendWallet = new hre.ethers.Wallet(process.env.BACKENDSIGNERPRIVATEKEY);
  const backendSigner = backendWallet.address;
  const DTAIOCGameFactory = await hre.ethers.getContractFactory("DTAIOCGame");
  const dtaiocGame = await DTAIOCGameFactory.deploy(
    dtaiocToken.target,
    dtaiocNFT.target,
    dtaiocStaking.target,
    mockResolver.target,
    backendSigner
  );
  await dtaiocGame.waitForDeployment();
  console.log("DTAIOCGame deployed to:", dtaiocGame.target);
  await verifyContract(
    dtaiocGame.target,
    [dtaiocToken.target, dtaiocNFT.target, dtaiocStaking.target, mockResolver.target, backendSigner],
    "DTAIOCGame"
  );

  // Deploy MockEntryPoint
  const MockEntryPointFactory = await hre.ethers.getContractFactory("MockEntryPoint");
  const mockEntryPoint = await MockEntryPointFactory.deploy();
  await mockEntryPoint.waitForDeployment();
  console.log("MockEntryPoint deployed to:", mockEntryPoint.target);
  await verifyContract(mockEntryPoint.target, [], "MockEntryPoint");

  // Deploy DTAIOCPaymaster
  const DTAIOCPaymasterFactory = await hre.ethers.getContractFactory("DTAIOCPaymaster");
  const paymaster = await DTAIOCPaymasterFactory.deploy(
    entryPointAddress,
    dtaiocToken.target,
    dtaiocGame.target,
    mockResolver.target
  );
  await paymaster.waitForDeployment();
  console.log("DTAIOCPaymaster deployed to:", paymaster.target);
  await verifyContract(
    paymaster.target,
    [entryPointAddress, dtaiocToken.target, dtaiocGame.target, mockResolver.target],
    "DTAIOCPaymaster"
  );

  // Configure permissions
  console.log("Setting game contract for NFT...");
  const nftTx = await dtaiocNFT.setGameContract(dtaiocGame.target);
  await nftTx.wait();
  console.log("NFT game contract set to:", dtaiocGame.target);

  console.log("Setting game contract for Staking...");
  try {
    const stakingTx = await dtaiocStaking.setGameContract(dtaiocGame.target);
    await stakingTx.wait();
    console.log("Staking game contract set to:", dtaiocGame.target);
  } catch (error) {
    console.error("Failed to set game contract for Staking:", error);
    throw error;
  }

  // Verify gameContract
  const gameContractAddress = await dtaiocStaking.gameContract();
  console.log("Verified gameContract in Staking:", gameContractAddress);
  if (gameContractAddress === hre.ethers.ZeroAddress) {
    throw new Error("Failed to set gameContract in Staking");
  }

  // Fund Paymaster
  const fundAmount = hre.ethers.parseEther("0.1");
  await deployer.sendTransaction({ to: paymaster.target, value: fundAmount });
  console.log(`Funded Paymaster with ${hre.ethers.formatEther(fundAmount)} ETH`);

  // Output addresses for forkGameSimulation.js
  console.log("Update forkGameSimulation.js with:");
  console.log(`tokenAddress: "${dtaiocToken.target}"`);
  console.log(`nftAddress: "${dtaiocNFT.target}"`);
  console.log(`stakingAddress: "${dtaiocStaking.target}"`);
  console.log(`resolverAddress: "${mockResolver.target}"`);
  console.log(`gameAddress: "${dtaiocGame.target}"`);
  console.log(`entryPointAddress: "${entryPointAddress}"`);
  console.log(`paymasterAddress: "${paymaster.target}"`);
  console.log(`platformAddress: "${platformAddress}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });