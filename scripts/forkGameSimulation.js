const hre = require("hardhat");
const { ethers } = hre;

class NonceManager {
  constructor(provider) {
    this.provider = provider;
    this.nonces = new Map();
  }

  async getNonce(signer) {
    const address = await signer.getAddress();
    const pendingNonce = await this.provider.getTransactionCount(address, "pending");
    this.nonces.set(address, pendingNonce);
    return pendingNonce;
  }

  async incrementNonce(signer) {
    const address = await signer.getAddress();
    const currentNonce = await this.getNonce(signer);
    this.nonces.set(address, currentNonce + 1);
  }

  async refreshNonce(signer) {
    const address = await signer.getAddress();
    const pendingNonce = await this.provider.getTransactionCount(address, "pending");
    this.nonces.set(address, pendingNonce);
    return pendingNonce;
  }
}

async function decodeRevertReason(error) {
  if (error.data && error.data.data) {
    try {
      const iface = new ethers.Interface([
        "function Error(string)",
        "function UnauthorizedCaller()",
        "function InvalidSignature()",
        "function InvalidIdentifier()",
        "function InvalidGameDuration()",
        "function InvalidQuestionHash()",
        "function DuplicateQuestionHash()",
        "function InsufficientBalance()",
        "function InsufficientAllowance()",
        "function AccessControlUnauthorizedAccount(address,bytes32)",
        "function InvalidAmount()",
        "function ExceedsMaxSupply()",
        "function ExceedsMaxMintPerWallet()",
        "function MintingPaused()",
        "function InvalidAddress()",
        "function InvalidStage()",
        "function StageMismatch()",
        "function TransferFailed()",
        "function NoStakeFound()",
        "function InvalidRefundPercentage()",
        "function NoForfeitedStakes()",
        "function OwnableUnauthorizedAccount(address)",
        "function InvalidBasename()",
        "function InvalidStringLength()",
        "function GameDoesNotExist()",
        "function GameAlreadyEnded()",
        "function GameDurationExceeded()",
        "function PlayerLimitReached()",
        "function AlreadyParticipated()",
        "function InvalidAnswerCount()",
        "function InvalidScore()",
        "function NotInGame()",
        "function InvalidRank()",
        "function InvalidTokenURI()"
      ]);
      const decoded = iface.parseError(error.data.data);
      return decoded?.args[0] || decoded?.name || "Unknown revert reason";
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
      const signerBalance = await provider.getBalance(await signer.getAddress());
      const estimatedGasCost = ethers.parseUnits("1500000", "gwei");
      if (signerBalance < (tx.value || 0n) + estimatedGasCost) {
        throw new Error(`Insufficient balance: have ${ethers.formatEther(signerBalance)} ETH, need ${ethers.formatEther((tx.value || 0n) + estimatedGasCost)} ETH`);
      }

      let gasEstimate;
      try {
        if (tx.data) {
          gasEstimate = await provider.estimateGas({
            to: tx.to,
            data: tx.data,
            value: tx.value || 0,
            nonce,
            from: await signer.getAddress(),
          });
        } else {
          gasEstimate = BigInt(21000);
        }
      } catch (gasError) {
        console.error(`Gas estimation failed: ${gasError.message}, Revert: ${await decodeRevertReason(gasError)}`);
        gasEstimate = BigInt(tx.gasLimit || 300000);
      }
      console.log(`Attempt ${attempt}: Sending transaction with nonce ${nonce}, maxFeePerGas ${ethers.formatUnits(feeData.maxFeePerGas || ethers.parseUnits("5", "gwei"), "gwei")} gwei, gasLimit ${gasEstimate}, to ${tx.to}, value ${ethers.formatEther(tx.value || 0)} ETH`);

      const txRequest = {
        to: tx.to,
        data: tx.data || "0x",
        value: tx.value || 0,
        nonce,
        gasLimit: gasEstimate * 120n / 100n,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("5", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      };

      console.log(`Signer balance: ${ethers.formatEther(signerBalance)} ETH`);
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
          error.message.includes("timed out") ||
          error.message.includes("ECONNRESET")) &&
        attempt < maxRetries
      ) {
        attempt++;
        await nonceManager.refreshNonce(signer);
        feeData = await provider.getFeeData();
        feeData.maxFeePerGas = feeData.maxFeePerGas ? feeData.maxFeePerGas * 120n / 100n : ethers.parseUnits("6", "gwei");
        feeData.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 120n / 100n : ethers.parseUnits("1.2", "gwei");
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      } else {
        throw new Error(`Transaction failed: ${error.message}, Revert: ${revertReason}`);
      }
    }
  }
}

async function deployContract(factoryName, args = [], signer) {
  console.log(`Deploying ${factoryName} with args: ${args}...`);
  const factory = await ethers.getContractFactory(factoryName, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  console.log(`${factoryName} deployed to: ${contract.target}`);
  return contract;
}

async function main() {
  console.log("Starting simulation on Hardhat (forked Base Sepolia)...");

  // Verify Hardhat environment
  console.log("Hardhat runtime environment:", !!hre);
  console.log("Hardhat ethers available:", !!hre.ethers);
  console.log("Hardhat toolbox registered:", hre.config.plugins?.includes("@nomicfoundation/hardhat-toolbox") || "Unknown");
  if (!hre.ethers) {
    throw new Error(
      "Hardhat ethers not initialized. Ensure '@nomicfoundation/hardhat-toolbox' is installed.\n" +
      "Run: rm -rf node_modules package-lock.json && npm install @nomicfoundation/hardhat-toolbox hardhat dotenv"
    );
  }

  // Initialize signers
  console.log("Initializing signers...");
  const signers = await ethers.getSigners();
  if (signers.length < 5) {
    throw new Error(`Expected at least 5 signers, got ${signers.length}. Check Hardhat config or .env.`);
  }
  const [owner, player1, player2, backendSigner, platform] = signers;
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
  if (ownerBalance < ethers.parseEther("0.1")) {
    throw new Error("Owner ETH balance too low. Need at least 0.1 ETH on Hardhat.");
  }

  // Log network state
  console.log("\nNetwork state...");
  const blockNumber = await provider.getBlockNumber();
  console.log("Current block number:", blockNumber);

  // Deploy contracts
  console.log("\nDeploying contracts...");
  await nonceManager.refreshNonce(owner);

  // Deploy MockBasenameResolver
  const resolver = await deployContract("MockBasenameResolver", [], owner);

  // Deploy DTAIOCToken
  const token = await deployContract("DTAIOCToken", [], owner);

  // Deploy DTAIOCStaking
  const staking = await deployContract("DTAIOCStaking", [token.target, platform.address], owner);

  // Deploy DTAIOCNFT
  const nft = await deployContract("DTAIOCNFT", [owner.address], owner);

  // Deploy DTAIOCGame
  const game = await deployContract("DTAIOCGame", [
    token.target,
    nft.target,
    staking.target,
    resolver.target,
    backendSigner.address,
    platform.address
  ], owner);

  // Update DTAIOCNFT gameContract
  console.log("Setting gameContract in DTAIOCNFT...");
  await sendTransactionWithRetry(provider, owner, {
    to: nft.target,
    data: nft.interface.encodeFunctionData("setGameContract", [game.target]),
    gasLimit: 100000,
  }, nonceManager);
  console.log("DTAIOCNFT gameContract set to:", await nft.gameContract());

  // Deploy DTAIOCPaymaster
  const paymaster = await deployContract("DTAIOCPaymaster", [
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // EntryPoint
    platform.address,
    game.target,
    resolver.target
  ], owner);

  // Deploy MockSmartWallet
  const wallet = await deployContract("MockSmartWallet", [owner.address], owner);

  // Use EntryPoint at standard Base Sepolia address
  const entryPoint = await ethers.getContractAt("IEntryPoint", "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", owner);

  // Set gameContract in DTAIOCStaking
  console.log("Setting gameContract in DTAIOCStaking...");
  await sendTransactionWithRetry(provider, owner, {
    to: staking.target,
    data: staking.interface.encodeFunctionData("setGameContract", [game.target]),
    gasLimit: 100000,
  }, nonceManager);
  console.log("DTAIOCStaking gameContract set to:", await staking.gameContract());

  // Set contracts in DTAIOCPaymaster
  console.log("Setting tokenContract in DTAIOCPaymaster...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("setTokenContract", [token.target]),
    gasLimit: 100000,
  }, nonceManager);
  console.log("Setting stakingContract in DTAIOCPaymaster...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("setStakingContract", [staking.target]),
    gasLimit: 100000,
  }, nonceManager);
  console.log("Setting nftContract in DTAIOCPaymaster...");
  await sendTransactionWithRetry(provider, owner, {
    to: paymaster.target,
    data: paymaster.interface.encodeFunctionData("setNFTContract", [nft.target]),
    gasLimit: 100000,
  }, nonceManager);

  console.log("Contracts deployed successfully");

  // Mint tokens individually
  console.log("\nMinting initial tokens...");
  const stakeAmount = ethers.parseEther("10");
  const accounts = [owner, player1, player2];
  console.log("Minting individually for owner, player1, player2...");
  for (const account of accounts) {
    console.log(`Minting ${ethers.formatEther(stakeAmount)} DTAIOC for ${account.address}...`);
    try {
      await nonceManager.refreshNonce(account);
      await sendTransactionWithRetry(provider, account, {
        to: token.target,
        data: token.interface.encodeFunctionData("mint", [stakeAmount]),
        gasLimit: 300000,
      }, nonceManager);
      console.log(`Mint successful for ${account.address}`);
    } catch (mintError) {
      const revertReason = await decodeRevertReason(mintError);
      console.error(`Mint failed for ${account.address}: ${mintError.message}, Revert: ${revertReason}`);
      throw mintError;
    }
  }

  // Approve staking contract
  console.log("\nApproving staking contract...");
  let approvalSuccess = true;
  for (const account of accounts) {
    console.log(`Approving for ${account.address}...`);
    try {
      await nonceManager.refreshNonce(account);
      await sendTransactionWithRetry(provider, account, {
        to: token.target,
        data: token.interface.encodeFunctionData("approve", [staking.target, stakeAmount]),
        gasLimit: 50000,
      }, nonceManager);
    } catch (approveError) {
      const revertReason = await decodeRevertReason(approveError);
      console.error(`Approval failed for ${account.address}: ${approveError.message}, Revert: ${revertReason}`);
      approvalSuccess = false;
      if (account.address === player1.address) {
        console.log("Skipping Player2 approval due to Player1 failure...");
        break;
      }
      throw approveError;
    }
  }

  if (!approvalSuccess) {
    throw new Error("Approval process incomplete. Check contract state and ABI.");
  }

  // Log initial balances with error handling
  console.log("\n=== Initial Balances ===");
  const addresses = [
    { name: "Owner", address: owner.address },
    { name: "Player1", address: player1.address },
    { name: "Player2", address: player2.address },
    { name: "Platform", address: platform.address },
    { name: "Staking", address: staking.target },
  ];
  for (const { name, address } of addresses) {
    try {
      const balance = await token.balanceOf(address);
      console.log(`${name}: ${ethers.formatEther(balance)} DTAIOC`);
    } catch (error) {
      console.error(`Failed to fetch balance for ${name} (${address}): ${error.message}`);
      console.log(`Raw balanceOf response: ${error.data?.data || "No data"}`);
    }
  }

  // Setup Twitter usernames (required for createGame and joinGame)
  console.log("\nSetting up Twitter usernames...");
  try {
    const twitterAccounts = [
      { address: owner.address, basename: "", twitter: "creator" },
      { address: player1.address, basename: "", twitter: "player1" },
      { address: player2.address, basename: "", twitter: "player2" },
    ];
    for (const account of twitterAccounts) {
      const { address, basename, twitter } = account;
      console.log(`Setting basename ${basename} and twitter ${twitter} for ${address}...`);
      try {
        // Set basename
        if (basename) {
          await nonceManager.refreshNonce(owner);
          await sendTransactionWithRetry(provider, owner, {
            to: resolver.target,
            data: resolver.interface.encodeFunctionData("setBasename", [address, basename]),
            gasLimit: 100000,
          }, nonceManager);
          console.log(`Basename set for ${address}`);
        }
        // Set Twitter username
        await nonceManager.refreshNonce(owner);
        await sendTransactionWithRetry(provider, owner, {
          to: resolver.target,
          data: resolver.interface.encodeFunctionData("setTwitterUsername", [address, twitter]),
          gasLimit: 100000,
        }, nonceManager);
        console.log(`Twitter username set for ${address}`);
      } catch (setupError) {
        const revertReason = await decodeRevertReason(setupError);
        console.error(`Failed to set Twitter for ${address}: ${setupError.message}, Revert: ${revertReason}`);
        throw setupError;
      }
    }
  } catch (error) {
    const revertReason = await decodeRevertReason(error);
    console.error(`Twitter setup failed: ${error.message}, Revert: ${revertReason}`);
    throw error;
  }

  // Debug createGame
  console.log("\nDebugging createGame...");
  const questionHashes = [
    ethers.keccak256(ethers.toUtf8Bytes("question1")),
    ethers.keccak256(ethers.toUtf8Bytes("question2")),
    ethers.keccak256(ethers.toUtf8Bytes("question3")),
  ];
  const gameDuration = 3600;
  const twitterUsername = "creator";
  const messageHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "string", "uint256"],
      [owner.address, twitterUsername, 1]
    )
  );
  const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
  const createGameData = game.interface.encodeFunctionData("createGame", [
    "",
    twitterUsername,
    questionHashes,
    gameDuration,
    signature
  ]);
  console.log("createGame call data:", createGameData);
  try {
    await game.callStatic.createGame("", twitterUsername, questionHashes, gameDuration, signature);
    console.log("createGame static call succeeded");
  } catch (error) {
    const revertReason = await decodeRevertReason(error);
    console.error(`createGame static call failed: ${error.message}, Revert: ${revertReason}`);
  }

  // Create game
  console.log("\nCreating game...");
  console.log("Executing createGame...");
  await nonceManager.refreshNonce(owner);
  const createGameReceipt = await sendTransactionWithRetry(provider, owner, {
    to: game.target,
    data: createGameData,
    gasLimit: 1000000,
  }, nonceManager);
  const gameId = createGameReceipt.logs
    .map((log) => game.interface.parseLog(log))
    .find((e) => e?.name === "GameCreated")?.args.gameId;
  console.log("Game created: ID", gameId.toString());
  console.log("Block timestamp after game creation:", (await provider.getBlock("latest")).timestamp);

  // Log balances after game creation
  console.log("\n=== Balances After Game Creation ===");
  for (const { name, address } of addresses) {
    try {
      const balance = await token.balanceOf(address);
      console.log(`${name}: ${ethers.formatEther(balance)} DTAIOC`);
    } catch (error) {
      console.error(`Failed to fetch balance for ${name} (${address}): ${error.message}`);
      console.log(`Raw balanceOf response: ${error.data?.data || "No data"}`);
    }
  }

  // Players join game directly
  console.log("\nPlayers joining game directly...");
  for (const [player, twitter] of [[player1, "player1"], [player2, "player2"]]) {
    console.log(`Generating join signature for ${player.address}...`);
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "string", "uint256"],
        [player.address, twitter, gameId]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    console.log(`Signature for ${player.address}:`, signature);

    console.log(`Joining game for ${player.address}...`);
    try {
      await nonceManager.refreshNonce(player);
      const directReceipt = await sendTransactionWithRetry(provider, player, {
        to: game.target,
        data: game.interface.encodeFunctionData("joinGame", [gameId, "", twitter, signature]),
        gasLimit: 300000,
      }, nonceManager);
      console.log(`${player.address} joined game directly, tx hash:`, directReceipt.hash);
    } catch (directError) {
      console.error(`Direct join failed for ${player.address}: ${directError.message}, Revert: ${await decodeRevertReason(directError)}`);
      throw directError;
    }
  }

  // Log balances after joining
  console.log("\n=== Balances After Joining ===");
  for (const { name, address } of addresses) {
    try {
      const balance = await token.balanceOf(address);
      console.log(`${name}: ${ethers.formatEther(balance)} DTAIOC`);
    } catch (error) {
      console.error(`Failed to fetch balance for ${name} (${address}): ${error.message}`);
      console.log(`Raw balanceOf response: ${error.data?.data || "No data"}`);
    }
  }

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
    await nonceManager.refreshNonce(player);
    const receipt = await sendTransactionWithRetry(provider, player, {
      to: game.target,
      data: game.interface.encodeFunctionData("submitAnswers", [gameId, 1, answerHashes, score, signature]),
      gasLimit: 1000000,
    }, nonceManager);
    console.log(`${player.address} submitted answers for Stage 1: Score ${score}, tx hash:`, receipt.hash);
  }

  // Advance to Stage 2
  console.log("\nAdvancing to Stage 2...");
  await nonceManager.refreshNonce(owner);
  await sendTransactionWithRetry(provider, owner, {
    to: game.target,
    data: game.interface.encodeFunctionData("advanceStage", [gameId]),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Game advanced to Stage 2");

  // Submit answers for Stage 2
  console.log("\nSubmitting answers for Stage 2...");
  for (const player of [player1, player2]) {
    console.log(`Generating answer signature for ${player.address} in Stage 2...`);
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player.address, 2, score, answerHashes]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    console.log(`Message hash for ${player.address}:`, messageHash);
    console.log(`Signature for ${player.address}:`, signature);

    console.log(`Submitting answers for ${player.address} in Stage 2...`);
    await nonceManager.refreshNonce(player);
    const receipt = await sendTransactionWithRetry(provider, player, {
      to: game.target,
      data: game.interface.encodeFunctionData("submitAnswers", [gameId, 2, answerHashes, score, signature]),
      gasLimit: 1000000,
    }, nonceManager);
    console.log(`${player.address} submitted answers for Stage 2: Score ${score}, tx hash:`, receipt.hash);
  }

  // Advance to Stage 3
  console.log("\nAdvancing to Stage 3...");
  await nonceManager.refreshNonce(owner);
  await sendTransactionWithRetry(provider, owner, {
    to: game.target,
    data: game.interface.encodeFunctionData("advanceStage", [gameId]),
    gasLimit: 300000,
  }, nonceManager);
  console.log("Game advanced to Stage 3");

  // Submit answers for Stage 3
  console.log("\nSubmitting answers for Stage 3...");
  let stage3Success = true;
  for (const player of [player1, player2]) {
    console.log(`Generating answer signature for ${player.address} in Stage 3...`);
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player.address, 3, score, answerHashes]
      )
    );
    const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));
    console.log(`Message hash for ${player.address}:`, messageHash);
    console.log(`Signature for ${player.address}:`, signature);

    console.log(`Submitting answers for ${player.address} in Stage 3...`);
    try {
      await nonceManager.refreshNonce(player);
      const receipt = await sendTransactionWithRetry(provider, player, {
        to: game.target,
        data: game.interface.encodeFunctionData("submitAnswers", [gameId, 3, answerHashes, score, signature]),
        gasLimit: 1500000,
      }, nonceManager);
      console.log(`${player.address} submitted answers for Stage 3: Score ${score}, tx hash:`, receipt.hash);
    } catch (error) {
      const revertReason = await decodeRevertReason(error);
      console.error(`Stage 3 submission failed for ${player.address}: ${error.message}, Revert: ${revertReason}`);
      stage3Success = false;
      if (player.address === player1.address) {
        console.log("Skipping Player2 Stage 3 submission due to Player1 failure...");
        break;
      }
      throw error;
    }
  }

  if (!stage3Success) {
    throw new Error("Stage 3 submission incomplete. Check contract state and signature.");
  }

  // Advance time for endGame
  console.log("\nAdvancing time for endGame...");
  const currentBlock = await provider.getBlock("latest");
  console.log("Block timestamp before endGame:", currentBlock.timestamp);
  await provider.send("evm_increaseTime", [3500]); // Advance to ~58 minutes, within 3600s
  await provider.send("evm_mine", []); // Mine a new block
  const newBlock = await provider.getBlock("latest");
  console.log("Block timestamp after time advance:", newBlock.timestamp);

  // Debug endGame
  console.log("\nDebugging endGame...");
  try {
    await game.callStatic.endGame(gameId);
    console.log("endGame static call succeeded");
  } catch (error) {
    const revertReason = await decodeRevertReason(error);
    console.error(`endGame static call failed: ${error.message}, Revert: ${revertReason}`);
  }

  // End game and mint NFTs
  console.log("\nEnding game and minting NFTs...");
  await nonceManager.refreshNonce(owner);
  const endGameReceipt = await sendTransactionWithRetry(provider, owner, {
    to: game.target,
    data: game.interface.encodeFunctionData("endGame", [gameId]),
    gasLimit: 2000000,
  }, nonceManager);
  console.log("Game ended, tx hash:", endGameReceipt.hash);

  // Log final balances and NFTs
  console.log("\n=== Final Balances ===");
  for (const { name, address } of addresses) {
    try {
      const balance = await token.balanceOf(address);
      console.log(`${name}: ${ethers.formatEther(balance)} DTAIOC`);
    } catch (error) {
      console.error(`Failed to fetch balance for ${name} (${address}): ${error.message}`);
      console.log(`Raw balanceOf response: ${error.data?.data || "No data"}`);
    }
  }
  console.log("Player1 NFTs:", (await nft.balanceOf(player1.address)).toString());
  console.log("Player2 NFTs:", (await nft.balanceOf(player2.address)).toString());

  console.log("\nSimulation completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Simulation failed:", error);
    process.exit(1);
  });