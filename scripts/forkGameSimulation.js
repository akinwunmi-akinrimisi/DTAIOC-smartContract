const hre = require("hardhat");
const { ethers } = hre;

class NonceManager {
  constructor(provider) {
    this.provider = provider;
    this.nonces = new Map();
  }

  async getNonce(signer) {
    const address = await signer.getAddress();
    if (!this.nonces.has(address)) {
      const latestNonce = await this.provider.getTransactionCount(address, "latest");
      const pendingNonce = await this.provider.getTransactionCount(address, "pending");
      this.nonces.set(address, Math.max(latestNonce, pendingNonce));
    }
    return this.nonces.get(address);
  }

  async incrementNonce(signer) {
    const address = await signer.getAddress();
    const currentNonce = await this.getNonce(signer);
    this.nonces.set(address, currentNonce + 1);
  }

  async refreshNonce(signer) {
    const address = await signer.getAddress();
    const latestNonce = await this.provider.getTransactionCount(address, "latest");
    const pendingNonce = await this.provider.getTransactionCount(address, "pending");
    this.nonces.set(address, Math.max(latestNonce, pendingNonce));
  }
}

async function decodeRevertReason(error) {
  if (error.data && error.data.data) {
    try {
      const iface = new ethers.Interface(["function Error(string)"]);
      const decoded = iface.parseError(error.data.data);
      return decoded?.args[0] || "Unknown revert reason";
    } catch {
      return "Failed to decode revert reason";
    }
  }
  return error.reason || error.message || "No revert reason provided";
}

async function sendTransactionWithRetry(provider, signer, tx, nonceManager, maxRetries = 5, timeoutMs = 120000) {
  let attempt = 1;
  let feeData = await provider.getFeeData();

  while (attempt <= maxRetries) {
    try {
      const nonce = await nonceManager.getNonce(signer);
      const gasEstimate = tx.data ? await provider.estimateGas({
        ...tx,
        from: await signer.getAddress(),
        nonce,
      }) : ethers.BigNumber.from(21000);
      console.log(`Attempt ${attempt}: Sending transaction with nonce ${nonce}, maxFeePerGas ${ethers.formatUnits(feeData.maxFeePerGas || ethers.parseUnits("10", "gwei"), "gwei")} gwei, gasLimit ${gasEstimate}, to ${tx.to}`);

      const txRequest = {
        ...tx,
        nonce,
        gasLimit: gasEstimate.mul(120).div(100), // Add 20% buffer
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      };

      const txResponse = await Promise.race([
        signer.sendTransaction(txRequest),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Transaction timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      const receipt = await txResponse.wait();
      console.log(`Transaction mined: ${txResponse.hash}, gasUsed: ${receipt.gasUsed}`);
      await nonceManager.incrementNonce(signer);
      return receipt;
    } catch (error) {
      const revertReason = await decodeRevertReason(error);
      console.error(`Attempt ${attempt} failed: ${error.message}, Revert: ${revertReason}`);
      if (
        (error.message.includes("nonce too low") ||
          error.message.includes("replacement transaction underpriced") ||
          error.message.includes("timed out")) &&
        attempt < maxRetries
      ) {
        attempt++;
        await nonceManager.refreshNonce(signer);
        feeData = await provider.getFeeData();
        feeData.maxFeePerGas = (feeData.maxFeePerGas || ethers.parseUnits("10", "gwei")).mul(120).div(100);
        feeData.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei")).mul(120).div(100);
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt)); // Exponential backoff
      } else {
        throw new Error(`Transaction failed: ${error.message}, Revert: ${revertReason}`);
      }
    }
  }
}

async function main() {
  console.log("Starting simulation on Base Sepolia network...");

  // Verify Hardhat environment
  console.log("Hardhat runtime environment:", !!hre);
  console.log("Hardhat ethers available:", !!hre.ethers);
  console.log("Hardhat toolbox registered:", hre.config.plugins?.includes("@nomicfoundation/hardhat-toolbox") || "Unknown");
  if (!hre.ethers) {
    throw new Error(
      "Hardhat ethers not initialized. Ensure '@nomicfoundation/hardhat-toolbox' is installed and Hardhat is run correctly.\n" +
      "Run: rm -rf node_modules package-lock.json && npm install @nomicfoundation/hardhat-toolbox hardhat dotenv"
    );
  }

  // Initialize signers
  console.log("Initializing signers...");
  let signers;
  try {
    signers = await ethers.getSigners();
  } catch (error) {
    throw new Error(`Failed to initialize signers: ${error.message}`);
  }
  if (signers.length < 4) {
    throw new Error(`Expected at least 4 signers, got ${signers.length}`);
  }
  const [owner, player1, player2, backendSigner] = signers;
  const platform = backendSigner;
  console.log("Owner address:", owner.address);
  console.log("Player1 address:", player1.address);
  console.log("Player2 address:", player2.address);
  console.log("Backend signer:", backendSigner.address);
  console.log("Platform address:", platform.address);

  // Initialize Nonce Manager
  const provider = ethers.provider;
  const nonceManager = new NonceManager(provider);

  // Check ETH balances
  console.log("\nChecking ETH balances...");
  const ownerBalance = await provider.getBalance(owner.address);
  const player1Balance = await provider.getBalance(player1.address);
  const player2Balance = await provider.getBalance(player2.address);
  console.log("Owner ETH balance:", ethers.formatEther(ownerBalance));
  console.log("Player1 ETH balance:", ethers.formatEther(player1Balance));
  console.log("Player2 ETH balance:", ethers.formatEther(player2Balance));
  if (ownerBalance.lt(ethers.parseEther("0.05"))) {
    throw new Error("Owner ETH balance too low. Need at least 0.05 ETH.");
  }

  // Check owner nonce
  console.log("\nChecking owner nonce...");
  const ownerPendingNonce = await provider.getTransactionCount(owner.address, "pending");
  console.log("Owner pending nonce:", ownerPendingNonce);

  // Contract name mapping
  const contractNames = {
    MockBasenameResolver: "MockBasenameResolver",
    MockEntryPoint: "MockEntryPoint",
    DTAIOCToken: "DTAIOCToken",
    DTAIOCNFT: "DTAIOCNFT",
    DTAIOCStaking: "DTAIOCStaking",
    DTAIOCGame: "DTAIOCGame",
    DTAIOCPaymaster: "DTAIOCPaymaster",
    MockSmartWallet: "MockSmartWallet",
  };

  // Deploy contracts
  console.log("\nDeploying contracts...");
  const deployWithDelay = async (factory, args = [], signer = owner, contractName) => {
    const gasEstimate = await factory.connect(signer).estimateGas.deploy(...args);
    console.log(`Estimated gas for ${contractName} deployment: ${gasEstimate}`);
    const contract = await factory.connect(signer).deploy(...args);
    await contract.waitForDeployment();
    const code = await provider.getCode(contract.target);
    if (code === "0x") {
      throw new Error(`Deployment failed for ${contractName}: No code at address ${contract.target}`);
    }
    console.log(`${contractName} deployed to:`, contract.target);
    await nonceManager.incrementNonce(signer);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return contract;
  };

  // Deploy MockBasenameResolver
  const Resolver = await ethers.getContractFactory("MockBasenameResolver");
  const resolver = await deployWithDelay(Resolver, [], owner, contractNames.MockBasenameResolver);

  // Deploy MockEntryPoint
  const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
  const entryPoint = await deployWithDelay(EntryPoint, [], owner, contractNames.MockEntryPoint);

  // Deploy DTAIOCToken
  const Token = await ethers.getContractFactory("DTAIOCToken");
  const token = await deployWithDelay(Token, [], owner, contractNames.DTAIOCToken);

  // Deploy DTAIOCNFT
  const NFT = await ethers.getContractFactory("DTAIOCNFT");
  const nft = await deployWithDelay(NFT, [], owner, contractNames.DTAIOCNFT);

  // Deploy DTAIOCStaking
  const Staking = await ethers.getContractFactory("DTAIOCStaking");
  const staking = await deployWithDelay(Staking, [token.target, platform.address], owner, contractNames.DTAIOCStaking);

  // Deploy DTAIOCGame
  const Game = await ethers.getContractFactory("DTAIOCGame");
  const game = await deployWithDelay(Game, [
    token.target,
    nft.target,
    staking.target,
    resolver.target,
    backendSigner.address,
    platform.address,
  ], owner, contractNames.DTAIOCGame);

  // Deploy DTAIOCPaymaster
  const Paymaster = await ethers.getContractFactory("DTAIOCPaymaster");
  const paymaster = await deployWithDelay(Paymaster, [
    entryPoint.target,
    platform.address,
    game.target,
    resolver.target,
  ], owner, contractNames.DTAIOCPaymaster);

  // Deploy MockSmartWallet for player1
  const Wallet = await ethers.getContractFactory("MockSmartWallet");
  const wallet = await deployWithDelay(Wallet, [player1.address], owner, contractNames.MockSmartWallet);

  // Configure contracts
  console.log("\nConfiguring contracts...");
  console.log("Setting NFT game contract...");
  try {
    const gasEstimate = await nft.estimateGas.setGameContract(game.target);
    console.log("Estimated gas for setGameContract:", gasEstimate.toString());
    const receipt = await sendTransactionWithRetry(provider, owner, {
      to: nft.target,
      data: nft.interface.encodeFunctionData("setGameContract", [game.target]),
      gasLimit: gasEstimate.mul(150).div(100), // 50% buffer
    }, nonceManager);
    console.log("NFT game contract set, tx hash:", receipt.transactionHash);
    // Verify configuration
    const gameContractAddr = await nft.gameContract();
    if (gameContractAddr !== game.target) {
      throw new Error(`NFT game contract not set correctly. Expected ${game.target}, got ${gameContractAddr}`);
    }
  } catch (error) {
    const revertReason = await decodeRevertReason(error);
    console.error("Failed to set NFT game contract:", error.message, "Revert:", revertReason);
    throw error;
  }

  console.log("Setting Staking game contract...");
  const stakingReceipt = await sendTransactionWithRetry(provider, owner, {
    to: staking.target,
    data: staking.interface.encodeFunctionData("setGameContract", [game.target]),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Staking game contract set, tx hash:", stakingReceipt.transactionHash);
  const stakingGameContract = await staking.gameContract();
  if (stakingGameContract !== game.target) {
    throw new Error(`Staking game contract not set correctly. Expected ${game.target}, got ${stakingGameContract}`);
  }

  console.log("Setting Paymaster token contract...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("setTokenContract", [token.target]),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Paymaster token contract set");

  console.log("Setting Paymaster staking contract...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("setStakingContract", [staking.target]),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Paymaster staking contract set");

  console.log("Setting Paymaster NFT contract...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("setNFTContract", [nft.target]),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Paymaster NFT contract set");

  // Fund Paymaster
  console.log("Funding Paymaster with 0.1 ETH...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    value: ethers.parseEther("0.1"),
    gasLimit: 21000,
  }, nonceManager);
  console.log("Depositing 0.1 ETH to Paymaster...");
  const depositReceipt = await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("deposit"),
    value: ethers.parseEther("0.1"),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Paymaster funded with 0.2 ETH, tx hash:", depositReceipt.transactionHash);
  const paymasterBalance = await provider.getBalance(paymaster.target);
  console.log("Paymaster balance:", ethers.formatEther(paymasterBalance));

  // Verify backend signer
  console.log("\nVerifying backend signer...");
  const currentBackendSigner = await game.backendSigner();
  console.log("Backend signer verified:", currentBackendSigner);
  if (currentBackendSigner !== backendSigner.address) {
    console.log("Updating backend signer...");
    const receipt = await sendTransactionWithRetry(provider, owner, {
      to: game.target,
      data: game.interface.encodeFunctionData("setBackendSigner", [backendSigner.address]),
      gasLimit: 300000,
    }, nonceManager);
    console.log("Backend signer updated to:", backendSigner.address, "tx hash:", receipt.transactionHash);
  }

  // Log initial balances
  console.log("\n=== Initial Balances ===");
  console.log("Owner:", ethers.formatEther(await token.balanceOf(owner.address)), "DTAIOC");
  console.log("Player1:", ethers.formatEther(await token.balanceOf(player1.address)), "DTAIOC");
  console.log("Player2:", ethers.formatEther(await token.balanceOf(player2.address)), "DTAIOC");
  console.log("Platform:", ethers.formatEther(await token.balanceOf(platform.address)), "DTAIOC");
  console.log("Staking:", ethers.formatEther(await token.balanceOf(staking.target)), "DTAIOC");

  // Set up Basenames
  console.log("\nSetting up Basenames...");
  const basenames = {
    [owner.address]: "creator.base.eth",
    [player1.address]: "player1.base.eth",
    [player2.address]: "player2.base.eth",
    [wallet.target]: "wallet.base.eth",
  };
  for (const [addr, basename] of Object.entries(basenames)) {
    const currentBasename = await resolver["resolve(address)"](addr);
    if (currentBasename !== basename) {
      console.log(`Setting basename ${basename} for ${addr}...`);
      const receipt = await sendTransactionWithRetry(provider, owner, {
        to: resolver.target,
        data: resolver.interface.encodeFunctionData("setBasename", [addr, basename]),
        gasLimit: 300000,
      }, nonceManager);
      console.log(`Basename ${basename} set for ${addr}, tx hash:`, receipt.transactionHash);
    } else {
      console.log(`Basename ${basename} already set for ${addr}`);
    }
  }

  // Verify resolver mapping
  console.log("\nVerifying resolver mapping...");
  const resolvedAddress = await resolver.resolve(ethers.keccak256(ethers.toUtf8Bytes("creator.base.eth")));
  console.log("creator.base.eth resolves to:", resolvedAddress);
  if (resolvedAddress !== owner.address) {
    throw new Error(`Resolver mapping failed. Expected ${owner.address}, got ${resolvedAddress}`);
  }

  // Create game
  console.log("\nCreating game...");
  const questionHashes = [
    ethers.keccak256(ethers.toUtf8Bytes("question1")),
    ethers.keccak256(ethers.toUtf8Bytes("question2")),
    ethers.keccak256(ethers.toUtf8Bytes("question3")),
  ];
  const gameDuration = 3600;
  const createGameData = game.interface.encodeFunctionData("createGame", [
    "creator.base.eth",
    "",
    questionHashes,
    gameDuration,
    "0x",
  ]);
  console.log("createGame call data:", createGameData);
  console.log("Executing createGame...");
  const createGameReceipt = await sendTransactionWithRetry(provider, owner, {
    to: game.target,
    data: createGameData,
    gasLimit: 500000,
  }, nonceManager);
  const gameId = createGameReceipt.logs
    .map((log) => game.interface.parseLog(log))
    .find((e) => e?.name === "GameCreated")?.args.gameId;
  console.log("Game created: ID", gameId.toString());

  // Mint and approve tokens
  console.log("\nMinting and approving tokens...");
  const stakeAmount = ethers.parseEther("10");
  for (const player of [player1, player2]) {
    console.log(`Minting for ${player.address}...`);
    await sendTransactionWithRetry(provider, owner, {
      to: token.target,
      data: token.interface.encodeFunctionData("mint", [player.address, stakeAmount]),
      gasLimit: 300000,
    }, nonceManager);
    console.log(`Approving for ${player.address}...`);
    await sendTransactionWithRetry(provider, player, {
      to: token.target,
      data: token.interface.encodeFunctionData("approve", [staking.target, stakeAmount]),
      gasLimit: 300000,
    }, nonceManager);
  }

  // Log balances after mint/approve
  console.log("\n=== Balances After Mint/Approve ===");
  console.log("Owner:", ethers.formatEther(await token.balanceOf(owner.address)), "DTAIOC");
  console.log("Player1:", ethers.formatEther(await token.balanceOf(player1.address)), "DTAIOC");
  console.log("Player2:", ethers.formatEther(await token.balanceOf(player2.address)), "DTAIOC");
  console.log("Platform:", ethers.formatEther(await token.balanceOf(platform.address)), "DTAIOC");
  console.log("Staking:", ethers.formatEther(await token.balanceOf(staking.target)), "DTAIOC");

  // Players join game via Paymaster
  console.log("\nPlayers joining game via Paymaster...");
  for (const [player, basename] of [[player1, "player1.base.eth"], [player2, "player2.base.eth"]]) {
    console.log(`Generating join signature for ${player.address}...`);
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "string", "uint256"],
        [player.address, basename, gameId]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    console.log(`Signature for ${player.address}:`, signature);

    console.log(`Joining game for ${player.address}...`);
    const joinGameData = game.interface.encodeFunctionData("joinGame", [gameId, basename, "", signature]);
    const userOp = {
      sender: wallet.target,
      nonce: await wallet.getNonce(),
      initCode: "0x",
      callData: wallet.interface.encodeFunctionData("execute", [game.target, joinGameData]),
      callGasLimit: 200000,
      verificationGasLimit: 100000,
      preVerificationGas: 21000,
      maxFeePerGas: (await provider.getFeeData()).maxFeePerGas || ethers.parseUnits("10", "gwei"),
      maxPriorityFeePerGas: (await provider.getFeeData()).maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      paymasterAndData: ethers.concat([paymaster.target, "0x"]),
      signature: await player.signMessage(ethers.getBytes(ethers.keccak256(joinGameData))),
    };
    console.log(`UserOp for ${player.address}:`, userOp);

    try {
      const [context, validationData] = await entryPoint.validatePaymasterUserOp(paymaster.target, userOp, ethers.keccak256("0x1234"), 0);
      const sigFailed = (validationData & 1) === 1;
      if (sigFailed) throw new Error("Paymaster validation failed");
      const postOpReceipt = await sendTransactionWithRetry(provider, owner, {
        to: entryPoint.target,
        data: entryPoint.interface.encodeFunctionData("postOp", [0, context, 100000]),
        gasLimit: 300000,
      }, nonceManager);
      console.log(`${player.address} joined game via Paymaster, tx hash:`, postOpReceipt.transactionHash);
    } catch (e) {
      console.error(`Failed to join game for ${player.address} via Paymaster:`, e.message);
      console.log(`${player.address} joining game directly...`);
      const directReceipt = await sendTransactionWithRetry(provider, player, {
        to: game.target,
        data: game.interface.encodeFunctionData("joinGame", [gameId, basename, "", signature]),
        gasLimit: 300000,
      }, nonceManager);
      console.log(`${player.address} joined game directly, tx hash:`, directReceipt.transactionHash);
    }
  }

  // Log balances after joining
  console.log("\n=== Balances After Joining ===");
  console.log("Owner:", ethers.formatEther(await token.balanceOf(owner.address)), "DTAIOC");
  console.log("Player1:", ethers.formatEther(await token.balanceOf(player1.address)), "DTAIOC");
  console.log("Player2:", ethers.formatEther(await token.balanceOf(player2.address)), "DTAIOC");
  console.log("Platform:", ethers.formatEther(await token.balanceOf(platform.address)), "DTAIOC");
  console.log("Staking:", ethers.formatEther(await token.balanceOf(staking.target)), "DTAIOC");

  // Submit answers for Stage 1
  console.log("\nSubmitting answers for Stage 1...");
  const answerHashes = Array(5).fill(ethers.keccak256(ethers.toUtf8Bytes("answer")));
  const score = 5;
  for (const player of [player1, player2]) {
    console.log(`Generating answer signature for ${player.address} in Stage 1...`);
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player.address, 1, score, answerHashes]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    console.log(`Message hash for ${player.address}:`, messageHash);
    console.log(`Signature for ${player.address}:`, signature);

    console.log(`Submitting answers for ${player.address} in Stage 1...`);
    const receipt = await sendTransactionWithRetry(provider, player, {
      to: game.target,
      data: game.interface.encodeFunctionData("submitAnswers", [gameId, 1, answerHashes, score, signature]),
      gasLimit: 1000000,
    }, nonceManager);
    const event = receipt.logs
      .map((log) => game.interface.parseLog(log))
      .find((e) => e?.name === "StageCompleted");
    console.log(`${player.address} submitted answers for Stage 1: Score ${score}, tx hash:`, receipt.transactionHash);
  }

  console.log("\nSimulation completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Simulation failed:", error);
    process.exit(1);
  });