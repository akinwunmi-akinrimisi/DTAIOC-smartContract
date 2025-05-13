const { ethers } = require("hardhat");
require("dotenv").config();

async function generateSignature(signer, messageHash) {
  // Sign the raw messageHash without adding the Ethereum signed message prefix
  return await signer.signMessage(ethers.getBytes(messageHash));
}

async function logBalances(token, addresses, label) {
  console.log(`\n=== ${label} ===`);
  for (const [name, address] of Object.entries(addresses)) {
    try {
      const balance = await token.balanceOf(address);
      console.log(`${name}: ${ethers.formatEther(balance)} DTAIOC`);
    } catch (error) {
      console.error(`Failed to fetch balance for ${name}:`, error.message);
    }
  }
}

async function getGasPrices() {
  try {
    const feeData = await ethers.provider.getFeeData();
    // Multiply fetched prices by 1.5x to ensure competitiveness
    const maxFeePerGas = feeData.maxFeePerGas ? feeData.maxFeePerGas * 150n / 100n : ethers.parseUnits("100", "gwei");
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 150n / 100n : ethers.parseUnits("5", "gwei");
    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch (error) {
    console.error("Failed to fetch gas prices, using defaults:", error.message);
    return {
      maxFeePerGas: ethers.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("5", "gwei")
    };
  }
}

async function main() {
  console.log("Starting simulation on Base Sepolia network...");

  // Validate environment variables
  if (!process.env.PRIVATE_KEY || !process.env.PRIVATE_KEY1 || !process.env.PRIVATE_KEY2) {
    throw new Error("Missing private keys in .env file. Required: PRIVATE_KEY, PRIVATE_KEY1, PRIVATE_KEY2");
  }

  // Get signers using private keys
  let owner, player1, player2, backendSigner;
  try {
    console.log("Initializing signers...");
    owner = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
    player1 = new ethers.Wallet(process.env.PRIVATE_KEY1, ethers.provider);
    player2 = new ethers.Wallet(process.env.PRIVATE_KEY2, ethers.provider);
    backendSigner = new ethers.Wallet(
      process.env.BACKENDSIGNERPRIVATEKEY || "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
      ethers.provider
    );
  } catch (error) {
    console.error("Failed to initialize signers:", error.message);
    throw error;
  }

  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";

  console.log("Owner address:", owner.address);
  console.log("Player1 address:", player1.address);
  console.log("Player2 address:", player2.address);
  console.log("Backend signer:", backendSigner.address);
  console.log("Platform address:", platformAddress);

  // Check ETH balances
  console.log("\nChecking ETH balances...");
  for (const [name, signer] of Object.entries({ Owner: owner, Player1: player1, Player2: player2 })) {
    try {
      const balance = await ethers.provider.getBalance(signer.address);
      console.log(`${name} ETH balance: ${ethers.formatEther(balance)}`);
      if (balance < ethers.parseEther("0.01")) {
        console.warn(`${name} has low ETH (${ethers.formatEther(balance)}). Transactions may fail.`);
      }
    } catch (error) {
      console.error(`Failed to fetch ETH balance for ${name}:`, error.message);
      throw error;
    }
  }

  // Deploy contracts
  console.log("\nDeploying contracts...");
  const gasPrices = await getGasPrices();

  // Deploy DTAIOCToken
  let token;
  try {
    console.log("Deploying DTAIOCToken...");
    const DTAIOCToken = await ethers.getContractFactory("DTAIOCToken", owner);
    const nonce = await owner.getNonce();
    token = await DTAIOCToken.deploy({ ...gasPrices, nonce });
    await token.waitForDeployment();
    console.log("DTAIOCToken deployed to:", token.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCToken:", error.message);
    throw error;
  }

  // Deploy DTAIOCNFT
  let nft;
  try {
    console.log("Deploying DTAIOCNFT...");
    const DTAIOCNFT = await ethers.getContractFactory("DTAIOCNFT", owner);
    const nonce = await owner.getNonce();
    nft = await DTAIOCNFT.deploy({ ...gasPrices, nonce });
    await nft.waitForDeployment();
    console.log("DTAIOCNFT deployed to:", nft.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCNFT:", error.message);
    throw error;
  }

  // Deploy DTAIOCStaking
  let staking;
  try {
    console.log("Deploying DTAIOCStaking...");
    const DTAIOCStaking = await ethers.getContractFactory("DTAIOCStaking", owner);
    const nonce = await owner.getNonce();
    staking = await DTAIOCStaking.deploy(token.target, platformAddress, { ...gasPrices, nonce });
    await staking.waitForDeployment();
    console.log("DTAIOCStaking deployed to:", staking.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCStaking:", error.message);
    throw error;
  }

  // Deploy MockBasenameResolver
  let resolver;
  try {
    console.log("Deploying MockBasenameResolver...");
    const MockBasenameResolver = await ethers.getContractFactory("MockBasenameResolver", owner);
    const nonce = await owner.getNonce();
    resolver = await MockBasenameResolver.deploy({ ...gasPrices, nonce });
    await resolver.waitForDeployment();
    console.log("MockBasenameResolver deployed to:", resolver.target);
  } catch (error) {
    console.error("Failed to deploy MockBasenameResolver:", error.message);
    throw error;
  }

  // Deploy DTAIOCGame
  let game;
  try {
    console.log("Deploying DTAIOCGame...");
    const DTAIOCGame = await ethers.getContractFactory("DTAIOCGame", owner);
    const nonce = await owner.getNonce();
    game = await DTAIOCGame.deploy(
      token.target,
      nft.target,
      staking.target,
      resolver.target,
      backendSigner.address,
      platformAddress,
      { ...gasPrices, nonce }
    );
    await game.waitForDeployment();
    console.log("DTAIOCGame deployed to:", game.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCGame:", error.message);
    throw error;
  }

  // Configure contracts
  console.log("\nConfiguring contracts...");
  try {
    console.log("Setting game contract for NFT...");
    const nonce = await owner.getNonce();
    const nftTx = await nft.connect(owner).setGameContract(game.target, { gasLimit: 300000, ...gasPrices, nonce });
    await nftTx.wait();
    console.log("Set game contract for NFT:", game.target);
  } catch (error) {
    console.error("Failed to set game contract for NFT:", error.message);
    throw error;
  }

  try {
    console.log("Setting game contract for Staking...");
    const nonce = await owner.getNonce();
    const stakingTx = await staking.connect(owner).setGameContract(game.target, { gasLimit: 300000, ...gasPrices, nonce });
    await stakingTx.wait();
    console.log("Set game contract for Staking:", game.target);
  } catch (error) {
    console.error("Failed to set game contract for Staking:", error.message);
    throw error;
  }

  // Verify backend signer
  try {
    console.log("Verifying backend signer...");
    const contractSigner = await game.backendSigner();
    if (contractSigner.toLowerCase() !== backendSigner.address.toLowerCase()) {
      throw new Error(`Backend signer mismatch. Contract: ${contractSigner}, Script: ${backendSigner.address}`);
    }
    console.log("Backend signer verified:", contractSigner);
  } catch (error) {
    console.error("Failed to verify backend signer:", error.message);
    throw error;
  }

  // Log initial balances
  const addresses = {
    "Owner": owner.address,
    "Player1": player1.address,
    "Player2": player2.address,
    "Platform": platformAddress,
    "Staking": staking.target
  };
  await logBalances(token, addresses, "Initial Balances");

  // Setup Basenames
  console.log("\nSetting up Basenames...");
  const basenames = {
    "owner": "creator.base.eth",
    "player1": "player1.base.eth",
    "player2": "player2.base.eth"
  };
  for (const [role, basename] of Object.entries(basenames)) {
    const node = ethers.keccak256(ethers.toUtf8Bytes(basename));
    const address = role === "owner" ? owner.address : role === "player1" ? player1.address : role === "player2" ? player2.address : null;
    try {
      console.log(`Setting resolved address for ${basename} to ${address}...`);
      let nonce = await owner.getNonce();
      const txResolved = await resolver.connect(owner).setResolvedAddress(node, address, { gasLimit: 300000, ...gasPrices, nonce });
      await txResolved.wait();
      console.log(`Setting basename ${basename} for ${address}...`);
      nonce = await owner.getNonce();
      const txBasename = await resolver.connect(owner).setBasename(address, basename, { gasLimit: 300000, ...gasPrices, nonce });
      await txBasename.wait();
      const resolved = await resolver.resolve(node);
      console.log(`${basename} -> ${resolved}`);
      if (resolved.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Basename ${basename} resolves to ${resolved}, expected ${address}`);
      }
    } catch (error) {
      console.error(`Failed to set basename ${basename}:`, error.message);
      throw error;
    }
  }

  // Create game
  console.log("\nCreating game...");
  const creatorBasenameNode = ethers.keccak256(ethers.toUtf8Bytes("creator.base.eth"));
  const questionHashes = [
    ethers.keccak256(ethers.toUtf8Bytes("question1")),
    ethers.keccak256(ethers.toUtf8Bytes("question2")),
    ethers.keccak256(ethers.toUtf8Bytes("question3")),
  ];
  const gameDuration = 3600; // 1 hour
  let gameId;
  try {
    console.log("Executing createGame...");
    const nonce = await owner.getNonce();
    const txCreate = await game.connect(owner).createGame(creatorBasenameNode, questionHashes, gameDuration, { gasLimit: 500000, ...gasPrices, nonce });
    const createReceipt = await txCreate.wait();
    const gameCreatedEvent = createReceipt.logs
      .map((log) => {
        try {
          return game.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsedLog) => parsedLog?.name === "GameCreated");
    if (!gameCreatedEvent) {
      throw new Error("GameCreated event not found");
    }
    gameId = gameCreatedEvent.args.gameId;
    console.log("Game created: ID", gameId.toString());
  } catch (error) {
    console.error("Failed to create game:", error.message);
    throw error;
  }

  // Mint tokens and approve
  console.log("\nMinting and approving tokens...");
  const stakeAmount = ethers.parseEther("10");
  for (const [name, player] of [["Player1", player1], ["Player2", player2]]) {
    try {
      console.log(`Checking balance for ${name}...`);
      const balance = await token.balanceOf(player.address);
      if (balance < stakeAmount) {
        console.log(`Minting for ${name}...`);
        const nonce = await player.getNonce();
        const txMint = await token.connect(player).mint(stakeAmount, { gasLimit: 300000, ...gasPrices, nonce });
        await txMint.wait();
      }
      console.log(`Approving for ${name}...`);
      const nonce = await player.getNonce();
      const txApprove = await token.connect(player).approve(staking.target, stakeAmount, { gasLimit: 300000, ...gasPrices, nonce });
      await txApprove.wait();
    } catch (error) {
      console.error(`Failed to mint/approve for ${name}:`, error.message);
      throw error;
    }
  }

  await logBalances(token, addresses, "Balances After Mint/Approve");

  // Players join game
  console.log("\nPlayers joining game...");
  for (const [name, player, basename] of [
    ["Player1", player1, "player1.base.eth"],
    ["Player2", player2, "player2.base.eth"]
  ]) {
    try {
      console.log(`Generating join signature for ${name}...`);
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "string", "uint256"],
          [player.address, basename, gameId]
        )
      );
      const signature = await generateSignature(backendSigner, messageHash);
      console.log(`Signature for ${name}: ${signature}`);
      console.log(`Joining game for ${name}...`);
      const nonce = await player.getNonce();
      const txJoin = await game.connect(player).joinGame(gameId, basename, signature, { gasLimit: 1500000, ...gasPrices, nonce });
      await txJoin.wait();
      console.log(`${name} joined game`);
    } catch (error) {
      console.error(`Failed to join game for ${name}:`, error.message);
      throw error;
    }
  }

  await logBalances(token, addresses, "Balances After Joining");

  // Stage 1: Submit answers
  console.log("\nSubmitting answers for Stage 1...");
  const answerHashes = Array(5).fill(ethers.keccak256(ethers.toUtf8Bytes("answer")));
  for (const [name, player, score] of [
    ["Player1", player1, 5], // Perfect score, advances
    ["Player2", player2, 3]  // Non-perfect, eliminated
  ]) {
    try {
      console.log(`Generating answer signature for ${name} in Stage 1...`);
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "address", "uint256", "uint256", "bytes32[]"],
          [gameId, player.address, 1, score, answerHashes]
        )
      );
      const signature = await generateSignature(backendSigner, messageHash);
      console.log(`Submitting answers for ${name} in Stage 1...`);
      const nonce = await player.getNonce();
      const txSubmit = await game.connect(player).submitAnswers(gameId, 1, answerHashes, score, signature, { gasLimit: 1000000, ...gasPrices, nonce });
      await txSubmit.wait();
      console.log(`${name} submitted answers for Stage 1: Score ${score}`);
    } catch (error) {
      console.error(`Failed to submit answers for ${name} in Stage 1:`, error.message);
      throw error;
    }
  }

  await logBalances(token, addresses, "Balances After Stage 1");

  // Advance to stage 2
  console.log("\nAdvancing to stage 2...");
  try {
    console.log("Executing advanceStage...");
    const nonce = await owner.getNonce();
    const advanceTx = await game.connect(owner).advanceStage(gameId, { gasLimit: 500000, ...gasPrices, nonce });
    await advanceTx.wait();
    console.log("Advanced to stage 2");
  } catch (error) {
    console.error("Failed to advance to stage 2:", error.message);
    throw error;
  }

  // Stage 2: Submit answers (only Player1, as Player2 was eliminated)
  console.log("\nSubmitting answers for Stage 2...");
  try {
    console.log("Generating answer signature for Player1 in Stage 2...");
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player1.address, 2, 5, answerHashes]
      )
    );
    const signature = await generateSignature(backendSigner, messageHash);
    console.log("Submitting answers for Player1 in Stage 2...");
    const nonce = await player1.getNonce();
    const txSubmit = await game.connect(player1).submitAnswers(gameId, 2, answerHashes, 5, signature, { gasLimit: 1000000, ...gasPrices, nonce });
    await txSubmit.wait();
    console.log("Player1 submitted answers for Stage 2: Score 5");
  } catch (error) {
    console.error("Failed to submit answers for Player1 in Stage 2:", error.message);
    throw error;
  }

  await logBalances(token, addresses, "Balances After Stage 2");

  // Advance to stage 3
  console.log("\nAdvancing to stage 3...");
  try {
    console.log("Executing advanceStage...");
    const nonce = await owner.getNonce();
    const advanceTx = await game.connect(owner).advanceStage(gameId, { gasLimit: 500000, ...gasPrices, nonce });
    await advanceTx.wait();
    console.log("Advanced to stage 3");
  } catch (error) {
    console.error("Failed to advance to stage 3:", error.message);
    throw error;
  }

  // Stage 3: Submit answers (only Player1)
  console.log("\nSubmitting answers for Stage 3...");
  try {
    console.log("Generating answer signature for Player1 in Stage 3...");
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player1.address, 3, 5, answerHashes]
      )
    );
    const signature = await generateSignature(backendSigner, messageHash);
    console.log("Submitting answers for Player1 in Stage 3...");
    const nonce = await player1.getNonce();
    const txSubmit = await game.connect(player1).submitAnswers(gameId, 3, answerHashes, 5, signature, { gasLimit: 1000000, ...gasPrices, nonce });
    await txSubmit.wait();
    console.log("Player1 submitted answers for Stage 3: Score 5");
  } catch (error) {
    console.error("Failed to submit answers for Player1 in Stage 3:", error.message);
    throw error;
  }

  await logBalances(token, addresses, "Balances After Stage 3");

  // End game
  console.log("\nEnding game...");
  try {
    console.log("Increasing EVM time...");
    await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
    await ethers.provider.send("evm_mine", []);
    console.log("Executing endGame...");
    const nonce = await owner.getNonce();
    const endTx = await game.connect(owner).endGame(gameId, { gasLimit: 1500000, ...gasPrices, nonce });
    const endReceipt = await endTx.wait();
    console.log("Game ended");
  } catch (error) {
    console.error("Failed to end game:", error.message);
    throw error;
  }

  // Check final balances
  await logBalances(token, addresses, "Final Balances");

  // Check NFTs
  console.log("\nNFT ownership:");
  for (let tokenId = 1; tokenId <= 3; tokenId++) {
    try {
      const owner = await nft.ownerOf(tokenId);
      console.log(`Token ${tokenId}: ${owner}`);
    } catch (error) {
      console.log(`Token ${tokenId}: Not minted or error - ${error.message}`);
    }
  }

  console.log("\nSimulation completed successfully!");
}

main().catch((error) => {
  console.error("Simulation failed:", error);
  process.exitCode = 1;
});