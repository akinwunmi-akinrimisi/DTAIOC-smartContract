const { ethers } = require("hardhat");
require("dotenv").config();

async function generateSignature(signer, playerAddress, basename, gameId) {
  const messageHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "string", "uint256"], [playerAddress, basename, gameId])
  );
  return await signer.signMessage(ethers.getBytes(messageHash));
}

async function logBalances(token, addresses, label) {
  console.log(`\n=== ${label} ===`);
  for (const [name, address] of Object.entries(addresses)) {
    const balance = await token.balanceOf(address);
    console.log(`${name}: ${ethers.formatEther(balance)}`);
  }
}

async function main() {
  console.log("Forking Base Sepolia network...");

  // Get signers using private keys
  const owner = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
  const player1 = new ethers.Wallet(process.env.PRIVATE_KEY1, ethers.provider);
  const player2 = new ethers.Wallet(process.env.PRIVATE_KEY2, ethers.provider);
  const backendSigner = new ethers.Wallet(process.env.BACKENDSIGNERPRIVATEKEY || "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6", ethers.provider);

  console.log("Owner address:", owner.address);
  console.log("Player1 address:", player1.address);
  console.log("Player2 address:", player2.address);
  console.log("Backend signer:", backendSigner.address);

  // Contract addresses
  const tokenAddress = "0xeb04Db566fa8e52B16d8E28C0ABF1Fdc9D9D341B";
  const nftAddress = "0xA548FB4bd73235B6AFcE064e1dD26fbf8435923b";
  const stakingAddress = "0xB279D4aA86A7aA88F4013B970f7E7330b92b69F5";
  const resolverAddress = "0xb993c9F51D714167896cDe8F87118751a984cd98";
  const platformAddress = "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB";
  const expectedGameAddress = "0x6BA18de5a6589DBe78452b000E31Cd51191288F6";

  // Connect to contracts
  console.log("Connecting to contracts...");
  const token = await ethers.getContractAt("DTAIOCToken", tokenAddress);
  const nft = await ethers.getContractAt("DTAIOCNFT", nftAddress);
  const staking = await ethers.getContractAt("DTAIOCStaking", stakingAddress);
  const resolver = await ethers.getContractAt("MockBasenameResolver", resolverAddress);

  // Fetch game address
  const gameAddress = await staking.gameContract();
  console.log("Game contract address:", gameAddress);
  if (gameAddress !== expectedGameAddress) {
    throw new Error(`Game address mismatch. Got ${gameAddress}, expected ${expectedGameAddress}`);
  }
  const game = await ethers.getContractAt("DTAIOCGame", gameAddress);

  // Verify backend signer
  const contractSigner = await game.backendSigner();
  if (contractSigner.toLowerCase() !== backendSigner.address.toLowerCase()) {
    throw new Error(`Backend signer mismatch. Contract: ${contractSigner}, Script: ${backendSigner.address}`);
  }

  // Log initial balances
  const addresses = {
    "Creator": owner.address,
    "Player1": player1.address,
    "Player2": player2.address,
    "Platform": platformAddress,
    "Staking": stakingAddress
  };
  await logBalances(token, addresses, "Initial Balances");

  // Setup Basenames
  console.log("\nSetting up Basenames...");
  const basenames = {
    "creator": "creator.base.eth",
    "player1": "player1.base.eth",
    "player2": "player2.base.eth"
  };
  for (const [role, basename] of Object.entries(basenames)) {
    const node = ethers.keccak256(ethers.toUtf8Bytes(basename));
    const address = role === "creator" ? owner.address : role === "player1" ? player1.address : player2.address;
    await resolver.connect(owner).setResolvedAddress(node, address, { gasLimit: 300000 });
    const resolved = await resolver.resolve(node);
    console.log(`${basename} -> ${resolved}`);
    if (resolved !== address) {
      throw new Error(`Basename ${basename} resolves to ${resolved}, expected ${address}`);
    }
  }

  // Create game
  console.log("\nCreating game...");
  const creatorBasenameNode = ethers.keccak256(ethers.toUtf8Bytes("creator.base.eth"));
  const gameCounter = await game.gameCounter();
  const gameId = Number(gameCounter) + 1;
  const txCreate = await game.connect(owner).createGame(creatorBasenameNode, { gasLimit: 500000 });
  await txCreate.wait();
  console.log("Game created: ID", gameId);

  // Mint tokens and approve
  console.log("\nMinting and approving tokens...");
  const stakeAmount = ethers.parseEther("10");
  for (const [name, player] of [["Player1", player1], ["Player2", player2]]) {
    const balance = await token.balanceOf(player.address);
    if (balance < stakeAmount) {
      console.log(`Minting for ${name}...`);
      const txMint = await token.connect(player).mint(stakeAmount, { gasLimit: 300000 });
      await txMint.wait();
    }
    console.log(`Approving for ${name}...`);
    const txApprove = await token.connect(player).approve(stakingAddress, stakeAmount, { gasLimit: 300000 });
    await txApprove.wait();
  }

  await logBalances(token, addresses, "Balances After Mint/Approve");

  // Players join game
  console.log("\nPlayers joining game...");
  for (const [name, player, basename] of [
    ["Player1", player1, "player1.base.eth"],
    ["Player2", player2, "player2.base.eth"]
  ]) {
    const signature = await generateSignature(backendSigner, player.address, basename, gameId);
    console.log(`Generating signature for ${name}: ${signature}`);
    const txJoin = await game.connect(player).joinGame(gameId, basename, signature, { gasLimit: 1500000 });
    await txJoin.wait();
    console.log(`${name} joined game`);
  }

  await logBalances(token, addresses, "Balances After Joining");

  // Advance stages
  console.log("\nAdvancing to stage 2...");
  const advanceTx = await game.connect(owner).advanceStage(gameId, { gasLimit: 500000 });
  await advanceTx.wait();
  console.log("Advanced to stage 2");

  // Refund player2
  console.log("\nRefunding Player2...");
  const refundTx = await game.connect(owner).refundPlayer(gameId, player2.address, { gasLimit: 500000 });
  await refundTx.wait();
  console.log("Player2 refunded");

  await logBalances(token, addresses, "Balances After Refund");

  // End game
  console.log("\nEnding game...");
  const winners = [player1.address, player2.address, player1.address];
  const endTx = await game.connect(owner).endGame(gameId, winners, { gasLimit: 1500000 });
  await endTx.wait();
  console.log("Game ended");

  // Check final balances
  await logBalances(token, addresses, "Final Balances");

  // Check NFTs
  console.log("\nNFT ownership:");
  for (let tokenId = 1; tokenId <= 3; tokenId++) {
    try {
      const owner = await nft.ownerOf(tokenId);
      console.log(`Token ${tokenId}: ${owner}`);
    } catch (error) {
      console.log(`Token ${tokenId}: Error - ${error.message}`);
    }
  }

  console.log("\nSimulation completed successfully!");
}

main().catch((error) => {
  console.error("Simulation failed:", error);
  process.exitCode = 1;
});