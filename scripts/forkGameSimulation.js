const { ethers } = require("hardhat");
require("dotenv").config();

async function generateSignature(signer, messageHash) {
  // Sign the raw messageHash without adding the Ethereum signed message prefix
  return await signer.signMessage(ethers.getBytes(messageHash));
}

async function logBalances(token, addresses, label) {
  console.log(`\n=== ${label} ===`);
  for (const [name, address] of Object.entries(addresses)) {
    const balance = await token.balanceOf(address);
    console.log(`${name}: ${ethers.formatEther(balance)} DTAIOC`);
  }
}

async function main() {
  console.log("Forking Base Sepolia network...");

  // Get signers using private keys
  const owner = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
  const player1 = new ethers.Wallet(process.env.PRIVATE_KEY1, ethers.provider);
  const player2 = new ethers.Wallet(process.env.PRIVATE_KEY2, ethers.provider);
  const backendSigner = new ethers.Wallet(
    process.env.BACKENDSIGNERPRIVATEKEY || "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
    ethers.provider
  );
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";

  console.log("Owner address:", owner.address);
  console.log("Player1 address:", player1.address);
  console.log("Player2 address:", player2.address);
  console.log("Backend signer:", backendSigner.address);
  console.log("Platform address:", platformAddress);

  // Deploy contracts
  console.log("\nDeploying contracts...");

  // Deploy DTAIOCToken
  let token;
  try {
    const DTAIOCToken = await ethers.getContractFactory("DTAIOCToken", owner);
    token = await DTAIOCToken.deploy();
    await token.waitForDeployment();
    console.log("DTAIOCToken deployed to:", token.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCToken:", error.message);
    throw error;
  }

  // Deploy DTAIOCNFT
  let nft;
  try {
    const DTAIOCNFT = await ethers.getContractFactory("DTAIOCNFT", owner);
    nft = await DTAIOCNFT.deploy();
    await nft.waitForDeployment();
    console.log("DTAIOCNFT deployed to:", nft.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCNFT:", error.message);
    throw error;
  }

  // Deploy DTAIOCStaking
  let staking;
  try {
    const DTAIOCStaking = await ethers.getContractFactory("DTAIOCStaking", owner);
    staking = await DTAIOCStaking.deploy(token.target, platformAddress);
    await staking.waitForDeployment();
    console.log("DTAIOCStaking deployed to:", staking.target);
  } catch (error) {
    console.error("Failed to deploy DTAIOCStaking:", error.message);
    throw error;
  }

  // Deploy MockBasenameResolver
  let resolver;
  try {
    const MockBasenameResolver = await ethers.getContractFactory("MockBasenameResolver", owner);
    resolver = await MockBasenameResolver.deploy();
    await resolver.waitForDeployment();
    console.log("MockBasenameResolver deployed to:", resolver.target);
  } catch (error) {
    console.error("Failed to deploy MockBasenameResolver:", error.message);
    throw error;
  }

  // Deploy DTAIOCGame
  let game;
  try {
    const DTAIOCGame = await ethers.getContractFactory("DTAIOCGame", owner);
    game = await DTAIOCGame.deploy(
      token.target,
      nft.target,
      staking.target,
      resolver.target,
      backendSigner.address,
      platformAddress
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
    await nft.connect(owner).setGameContract(game.target, { gasLimit: 300000 });
    console.log("Set game contract for NFT:", game.target);
  } catch (error) {
    console.error("Failed to set game contract for NFT:", error.message);
    throw error;
  }

  try {
    await staking.connect(owner).setGameContract(game.target, { gasLimit: 300000 });
    console.log("Set game contract for Staking:", game.target);
  } catch (error) {
    console.error("Failed to set game contract for Staking:", error.message);
    throw error;
  }

  // Verify backend signer
  const contractSigner = await game.backendSigner();
  if (contractSigner.toLowerCase() !== backendSigner.address.toLowerCase()) {
    throw new Error(`Backend signer mismatch. Contract: ${contractSigner}, Script: ${backendSigner.address}`);
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
    const address = role === "owner" ? owner.address : role === "player1" ? player1.address : player2.address;
    try {
      await resolver.connect(owner).setResolvedAddress(node, address, { gasLimit: 300000 });
      await resolver.connect(owner).setBasename(address, basename, { gasLimit: 300000 });
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
    const txCreate = await game.connect(owner).createGame(creatorBasenameNode, questionHashes, gameDuration, { gasLimit: 500000 });
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
      const balance = await token.balanceOf(player.address);
      if (balance < stakeAmount) {
        console.log(`Minting for ${name}...`);
        const txMint = await token.connect(player).mint(stakeAmount, { gasLimit: 300000 });
        await txMint.wait();
      }
      console.log(`Approving for ${name}...`);
      const txApprove = await token.connect(player).approve(staking.target, stakeAmount, { gasLimit: 300000 });
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
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "string", "uint256"],
          [player.address, basename, gameId]
        )
      );
      const signature = await generateSignature(backendSigner, messageHash);
      console.log(`Generating signature for ${name}: ${signature}`);
      const txJoin = await game.connect(player).joinGame(gameId, basename, signature, { gasLimit: 1500000 });
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
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "address", "uint256", "uint256", "bytes32[]"],
          [gameId, player.address, 1, score, answerHashes]
        )
      );
      const signature = await generateSignature(backendSigner, messageHash);
      const txSubmit = await game.connect(player).submitAnswers(gameId, 1, answerHashes, score, signature, { gasLimit: 1000000 });
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
    const advanceTx = await game.connect(owner).advanceStage(gameId, { gasLimit: 500000 });
    await advanceTx.wait();
    console.log("Advanced to stage 2");
  } catch (error) {
    console.error("Failed to advance to stage 2:", error.message);
    throw error;
  }

  // Stage 2: Submit answers (only Player1, as Player2 was eliminated)
  console.log("\nSubmitting answers for Stage 2...");
  try {
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player1.address, 2, 5, answerHashes]
      )
    );
    const signature = await generateSignature(backendSigner, messageHash);
    const txSubmit = await game.connect(player1).submitAnswers(gameId, 2, answerHashes, 5, signature, { gasLimit: 1000000 });
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
    const advanceTx = await game.connect(owner).advanceStage(gameId, { gasLimit: 500000 });
    await advanceTx.wait();
    console.log("Advanced to stage 3");
  } catch (error) {
    console.error("Failed to advance to stage 3:", error.message);
    throw error;
  }

  // Stage 3: Submit answers (only Player1)
  console.log("\nSubmitting answers for Stage 3...");
  try {
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, player1.address, 3, 5, answerHashes]
      )
    );
    const signature = await generateSignature(backendSigner, messageHash);
    const txSubmit = await game.connect(player1).submitAnswers(gameId, 3, answerHashes, 5, signature, { gasLimit: 1000000 });
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
    await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
    await ethers.provider.send("evm_mine", []);
    const endTx = await game.connect(owner).endGame(gameId, { gasLimit: 1500000 });
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