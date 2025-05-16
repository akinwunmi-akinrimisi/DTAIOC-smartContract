const hre = require("hardhat");

async function verifyContract(contractAddress, constructorArguments, contractName) {
  console.log(`Verifying ${contractName} at ${contractAddress}...`);
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments,
    });
    console.log(`${contractName} verified successfully!`);
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log(`${contractName} is already verified.`);
    } else {
      console.error(`Failed to verify ${contractName}:`, error.message);
      console.log(`Contract address: ${contractAddress}`);
    }
  }
}

async function main() {
  // Validate network
  const network = await hre.ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
  if (network.chainId != 84532) {
    throw new Error(`Expected Base Sepolia (chainId 84532), got chainId ${network.chainId}`);
  }

  // Get signers with error handling
  let deployer;
  try {
    const signers = await hre.ethers.getSigners();
    if (!signers || signers.length === 0) {
      throw new Error("No signers available. Check hardhat.config.js accounts.");
    }
    deployer = signers[0];
    console.log("Deploying contracts with:", deployer.address);
  } catch (error) {
    console.error("Failed to get signers:", error.message);
    console.error("Ensure PRIVATE_KEY is set in .env and BASE_SEPOLIA_RPC_URL is valid.");
    throw error;
  }

  // Base Sepolia EntryPoint address (Biconomy) and platform address
  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";

  // Get dynamic gas prices
  const feeData = await hre.ethers.provider.getFeeData();
  const gasOptions = {
    maxFeePerGas: feeData.maxFeePerGas || hre.ethers.parseUnits("50", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || hre.ethers.parseUnits("5", "gwei"),
  };
  console.log("Gas options:", gasOptions);

  // Deploy MockSmartWallet
  const MockSmartWalletFactory = await hre.ethers.getContractFactory("MockSmartWallet");
  let mockSmartWallet;
  try {
    const deploymentTx = await MockSmartWalletFactory.connect(deployer).deploy(deployer.address, { ...gasOptions });
    mockSmartWallet = await deploymentTx.waitForDeployment();
    console.log("MockSmartWallet deployed to:", mockSmartWallet.target);
    await verifyContract(mockSmartWallet.target, [deployer.address], "MockSmartWallet");
  } catch (error) {
    console.error("Failed to deploy MockSmartWallet:", error.message);
    throw error;
  }

  // Deploy DTAIOCToken
  const DTAIOCTokenFactory = await hre.ethers.getContractFactory("DTAIOCToken");
  let dtaiocToken;
  try {
    const deploymentTx = await DTAIOCTokenFactory.connect(deployer).deploy({ ...gasOptions });
    dtaiocToken = await deploymentTx.waitForDeployment();
    console.log("DTAIOCToken deployed to:", dtaiocToken.target);
    await verifyContract(dtaiocToken.target, [], "DTAIOCToken");
  } catch (error) {
    console.error("Failed to deploy DTAIOCToken:", error.message);
    throw error;
  }

  // Deploy DTAIOCNFT with platformAddress as placeholder gameContract
  const DTAIOCNFTFactory = await hre.ethers.getContractFactory("DTAIOCNFT");
  let dtaiocNFT;
  try {
    console.log("Deploying DTAIOCNFT with gameContract:", platformAddress);
    const deploymentTx = await DTAIOCNFTFactory.connect(deployer).deploy(platformAddress, { ...gasOptions });
    dtaiocNFT = await deploymentTx.waitForDeployment();
    console.log("DTAIOCNFT contract object:", dtaiocNFT);
    console.log("DTAIOCNFT deployed to:", dtaiocNFT.target);
    await verifyContract(dtaiocNFT.target, [platformAddress], "DTAIOCNFT");
  } catch (error) {
    console.error("Failed to deploy DTAIOCNFT:", error.message);
    console.error("Gas options used:", gasOptions);
    throw error;
  }

  // Deploy DTAIOCStaking
  const DTAIOCStakingFactory = await hre.ethers.getContractFactory("DTAIOCStaking");
  let dtaiocStaking;
  try {
    const deploymentTx = await DTAIOCStakingFactory.connect(deployer).deploy(
      dtaiocToken.target,
      platformAddress,
      { ...gasOptions }
    );
    dtaiocStaking = await deploymentTx.waitForDeployment();
    console.log("DTAIOCStaking deployed to:", dtaiocStaking.target);
    await verifyContract(dtaiocStaking.target, [dtaiocToken.target, platformAddress], "DTAIOCStaking");
  } catch (error) {
    console.error("Failed to deploy DTAIOCStaking:", error.message);
    throw error;
  }

  // Verify staking contract owner
  const stakingOwner = await dtaiocStaking.owner();
  console.log("DTAIOCStaking owner:", stakingOwner);
  if (stakingOwner !== deployer.address) {
    console.warn("Warning: Deployer is not the owner of DTAIOCStaking");
  }

  // Deploy MockBasenameResolver
  const MockResolverFactory = await hre.ethers.getContractFactory("MockBasenameResolver");
  let mockResolver;
  try {
    const deploymentTx = await MockResolverFactory.connect(deployer).deploy({ ...gasOptions });
    mockResolver = await deploymentTx.waitForDeployment();
    console.log("MockBasenameResolver deployed to:", mockResolver.target);
    await verifyContract(mockResolver.target, [], "MockBasenameResolver");
  } catch (error) {
    console.error("Failed to deploy MockBasenameResolver:", error.message);
    throw error;
  }

  // Deploy DTAIOCGame
  const backendWallet = new hre.ethers.Wallet(
    process.env.BACKENDSIGNERPRIVATEKEY || "0x0000000000000000000000000000000000000000000000000000000000000000",
    hre.ethers.provider
  );
  const backendSigner = backendWallet.address;
  const DTAIOCGameFactory = await hre.ethers.getContractFactory("DTAIOCGame");
  let dtaiocGame;
  try {
    const deploymentTx = await DTAIOCGameFactory.connect(deployer).deploy(
      dtaiocToken.target,
      dtaiocNFT.target,
      dtaiocStaking.target,
      mockResolver.target,
      backendSigner,
      platformAddress,
      { ...gasOptions }
    );
    dtaiocGame = await deploymentTx.waitForDeployment();
    console.log("DTAIOCGame deployed to:", dtaiocGame.target);
    await verifyContract(
      dtaiocGame.target,
      [
        dtaiocToken.target,
        dtaiocNFT.target,
        dtaiocStaking.target,
        mockResolver.target,
        backendSigner,
        platformAddress,
      ],
      "DTAIOCGame"
    );
  } catch (error) {
    console.error("Failed to deploy DTAIOCGame:", error.message);
    throw error;
  }

  // Update DTAIOCNFT gameContract
  console.log("Setting DTAIOCNFT game contract to:", dtaiocGame.target);
  try {
    const tx = await dtaiocNFT.setGameContract(dtaiocGame.target, { ...gasOptions });
    await tx.wait();
    console.log("DTAIOCNFT game contract updated successfully");
  } catch (error) {
    console.error("Failed to set DTAIOCNFT game contract:", error.message);
    throw error;
  }

  // Deploy DTAIOCPaymaster
  const DTAIOCPaymasterFactory = await hre.ethers.getContractFactory("DTAIOCPaymaster");
  let paymaster;
  try {
    const deploymentTx = await DTAIOCPaymasterFactory.connect(deployer).deploy(
      entryPointAddress,
      platformAddress,
      dtaiocGame.target,
      mockResolver.target,
      { ...gasOptions }
    );
    paymaster = await deploymentTx.waitForDeployment();
    console.log("DTAIOCPaymaster deployed to:", paymaster.target);
    await verifyContract(
      paymaster.target,
      [entryPointAddress, platformAddress, dtaiocGame.target, mockResolver.target],
      "DTAIOCPaymaster"
    );
  } catch (error) {
    console.error("Failed to deploy DTAIOCPaymaster:", error.message);
    throw error;
  }

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
    const tx1 = await paymaster.setTokenContract(dtaiocToken.target, { ...gasOptions });
    await tx1.wait();
    console.log("Token contract set to:", dtaiocToken.target);
    const tx2 = await paymaster.setStakingContract(dtaiocStaking.target, { ...gasOptions });
    await tx2.wait();
    console.log("Staking contract set to:", dtaiocStaking.target);
    const tx3 = await paymaster.setNFTContract(dtaiocNFT.target, { ...gasOptions });
    await tx3.wait();
    console.log("NFT contract set to:", dtaiocNFT.target);
  } catch (error) {
    console.error("Failed to configure Paymaster:", error.message);
    throw error;
  }

  // Configure DTAIOCStaking
  console.log("Configuring DTAIOCStaking...");
  try {
    const tx5 = await dtaiocStaking.setGameContract(dtaiocGame.target, { ...gasOptions });
    await tx5.wait();
    console.log("DTAIOCStaking game contract set to:", dtaiocGame.target);
  } catch (error) {
    console.error("Failed to configure DTAIOCStaking:", error.message);
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
    const depositTx = await paymaster.deposit({ value: fundAmount, ...gasOptions });
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
  console.log(`smartWalletAddress: "${mockSmartWallet.target}"`);
  console.log(`platformAddress: "${platformAddress}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });