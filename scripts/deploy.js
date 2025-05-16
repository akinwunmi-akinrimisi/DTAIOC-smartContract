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
      console.log(`Contract address: ${contractAddress}`); // Log address for manual verification
    }
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Base Sepolia EntryPoint address (Biconomy)
  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";

  // Get dynamic gas prices
  const feeData = await hre.ethers.provider.getFeeData();
  const gasOptions = {
    maxFeePerGas: feeData.maxFeePerGas || hre.ethers.parseUnits("50", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || hre.ethers.parseUnits("5", "gwei"),
  };

  // Deploy DTAIOCToken
  const DTAIOCTokenFactory = await hre.ethers.getContractFactory("DTAIOCToken");
  const dtaiocToken = await DTAIOCTokenFactory.deploy(gasOptions);
  await dtaiocToken.waitForDeployment();
  console.log("DTAIOCToken deployed to:", dtaiocToken.target);
  await verifyContract(dtaiocToken.target, [], "DTAIOCToken");

  // Deploy DTAIOCNFT
  const DTAIOCNFTFactory = await hre.ethers.getContractFactory("DTAIOCNFT");
  const dtaiocNFT = await DTAIOCNFTFactory.deploy(gasOptions);
  await dtaiocNFT.waitForDeployment();
  console.log("DTAIOCNFT deployed to:", dtaiocNFT.target);
  await verifyContract(dtaiocNFT.target, [], "DTAIOCNFT");

  // Deploy DTAIOCStaking
  const DTAIOCStakingFactory = await hre.ethers.getContractFactory("DTAIOCStaking");
  const dtaiocStaking = await DTAIOCStakingFactory.deploy(dtaiocToken.target, platformAddress, gasOptions);
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
  const mockResolver = await MockResolverFactory.deploy(gasOptions);
  await mockResolver.waitForDeployment();
  console.log("MockBasenameResolver deployed to:", mockResolver.target);
  await verifyContract(mockResolver.target, [], "MockBasenameResolver");

  // Deploy DTAIOCGame
  const backendWallet = new hre.ethers.Wallet(process.env.BACKENDSIGNERPRIVATEKEY, hre.ethers.provider);
  const backendSigner = backendWallet.address;
  const DTAIOCGameFactory = await hre.ethers.getContractFactory("DTAIOCGame");
  const dtaiocGame = await DTAIOCGameFactory.deploy(
    dtaiocToken.target,
    dtaiocNFT.target,
    dtaiocStaking.target,
    mockResolver.target,
    backendSigner,
    platformAddress,
    gasOptions
  );
  await dtaiocGame.waitForDeployment();
  console.log("DTAIOCGame deployed to:", dtaiocGame.target);
  await verifyContract(
    dtaiocGame.target,
    [dtaiocToken.target, dtaiocNFT.target, dtaiocStaking.target, mockResolver.target, backendSigner, platformAddress],
    "DTAIOCGame"
  );

  // Deploy DTAIOCPaymaster
  const DTAIOCPaymasterFactory = await hre.ethers.getContractFactory("DTAIOCPaymaster");
  const paymaster = await DTAIOCPaymasterFactory.deploy(
    entryPointAddress,
    platformAddress,
    dtaiocGame.target,
    mockResolver.target,
    gasOptions
  );
  await paymaster.waitForDeployment();
  console.log("DTAIOCPaymaster deployed to:", paymaster.target);
  await verifyContract(
    paymaster.target,
    [entryPointAddress, platformAddress, dtaiocGame.target, mockResolver.target],
    "DTAIOCPaymaster"
  );

  // Verify Paymaster owner
  const paymasterOwner = await paymaster.owner();
  console.log("DTAIOCPaymaster owner:", paymasterOwner);
  if (paymasterOwner !== deployer.address) {
    console.error("Error: Deployer is not the owner of DTAIOCPaymaster");
    throw new Error("Paymaster ownership mismatch");
  }

  // Configure Paymaster
  console.log("Setting token, staking, and NFT contracts in Paymaster...");
  try {
    await paymaster.setTokenContract(dtaiocToken.target, gasOptions).then(tx => tx.wait());
    console.log("Token contract set to:", dtaiocToken.target);
    await paymaster.setStakingContract(dtaiocStaking.target, gasOptions).then(tx => tx.wait());
    console.log("Staking contract set to:", dtaiocStaking.target);
    await paymaster.setNFTContract(dtaiocNFT.target, gasOptions).then(tx => tx.wait());
    console.log("NFT contract set to:", dtaiocNFT.target);
  } catch (error) {
    console.error("Failed to configure Paymaster:", error.message);
    throw error;
  }

  // Configure DTAIOCNFT and DTAIOCStaking
  console.log("Configuring DTAIOCNFT and DTAIOCStaking...");
  try {
    await dtaiocNFT.setGameContract(dtaiocGame.target, gasOptions).then(tx => tx.wait());
    console.log("DTAIOCNFT game contract set to:", dtaiocGame.target);
    await dtaiocStaking.setGameContract(dtaiocGame.target, gasOptions).then(tx => tx.wait());
    console.log("DTAIOCStaking game contract set to:", dtaiocGame.target);
  } catch (error) {
    console.error("Failed to configure contracts:", error.message);
    throw error;
  }

  // Fund Paymaster
  const fundAmount = hre.ethers.parseEther("0.01");
  console.log(`Funding Paymaster with ${hre.ethers.formatEther(fundAmount)} ETH...`);
  try {
    const tx = await deployer.sendTransaction({
      to: paymaster.target,
      value: fundAmount,
      ...gasOptions,
    });
    await tx.wait();
    console.log("ETH sent to Paymaster");

    console.log("Depositing to EntryPoint...");
    const depositTx = await paymaster.deposit({
      value: fundAmount,
      ...gasOptions,
    });
    await depositTx.wait();
    console.log("Paymaster deposited to EntryPoint");
  } catch (error) {
    console.error("Funding failed:", error.message);
    throw error;
  }

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