const { ethers } = require("hardhat");
require("dotenv").config();

// Helper to calculate basenameNode exactly as the contract does
function calculateBasenameNode(basename) {
  return ethers.keccak256(ethers.toUtf8Bytes(basename));
}

async function generateSignature(signer, playerAddress, basename, gameId) {
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "string", "uint256"],
    [playerAddress, basename, gameId]
  );
  const messageHash = ethers.keccak256(encodedData);
  const signature = await signer.signMessage(ethers.getBytes(messageHash));
  return signature;
}

async function main() {
  console.log("Testing game lifecycle with focused debugging...");

  // Contract addresses from deploy.js
  const tokenAddress = "0xeb04Db566fa8e52B16d8E28C0ABF1Fdc9D9D341B";
  const stakingAddress = "0xB279D4aA86A7aA88F4013B970f7E7330b92b69F5";
  const resolverAddress = "0xb993c9F51D714167896cDe8F87118751a984cd98";
  const gameAddress = "0x6BA18de5a6589DBe78452b000E31Cd51191288F6";

  // Get contracts
  const token = await ethers.getContractAt("DTAIOCToken", tokenAddress);
  const staking = await ethers.getContractAt("DTAIOCStaking", stakingAddress);
  const resolver = await ethers.getContractAt("MockBasenameResolver", resolverAddress);
  const game = await ethers.getContractAt("DTAIOCGame", gameAddress);

  // Get signers
  const [owner] = await ethers.getSigners();
  const player1 = new ethers.Wallet(process.env.PLAYER1_PRIVATE_KEY, ethers.provider);
  console.log("Using owner account:", owner.address);
  console.log("Using player1 account:", player1.address);

  // Initialize backend signer
  const backendSigner = new ethers.Wallet(process.env.BACKENDSIGNERPRIVATEKEY || "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6", ethers.provider);
  console.log("Backend signer address:", backendSigner.address);

  // Verify backend signer matches contract
  const contractSigner = await game.backendSigner();
  console.log("Contract's backend signer:", contractSigner);
  if (contractSigner.toLowerCase() !== backendSigner.address.toLowerCase()) {
    console.error("CRITICAL ERROR: Backend signer mismatch!");
    throw new Error("Backend signer in contract doesn't match your script");
  }

  // Verify resolver address
  const contractResolver = await game.basenameResolver();
  console.log("Contract's resolver address:", contractResolver);
  if (contractResolver !== resolverAddress) {
    throw new Error(`Contract uses resolver ${contractResolver}, expected ${resolverAddress}`);
  }

  // Create a new game
  console.log("Creating new game...");
  const txCreate = await game.connect(owner).createGame(
    ethers.keccak256(ethers.toUtf8Bytes("creator.base.eth")),
    { gasLimit: 500000 }
  );
  await txCreate.wait();
  const gameId = Number(await game.gameCounter());
  console.log("New game ID:", gameId);

  // Check game exists
  const gameInfo = await game.games(gameId);
  console.log("Game info:", gameInfo);
  if (gameInfo[0] === ethers.ZeroAddress) {
    throw new Error("Game doesn't exist");
  }

  // Token setup
  console.log("\n=== TOKEN SETUP ===");
  const stakeAmount = ethers.parseEther("10");
  const balance = await token.balanceOf(player1.address);
  console.log("Player token balance:", ethers.formatEther(balance));

  if (balance < stakeAmount) {
    console.log("Minting tokens for player...");
    const txMint = await token.connect(player1).mint(stakeAmount, { gasLimit: 300000 });
    await txMint.wait();
  }

  console.log("Approving tokens for staking...");
  const txApprove = await token.connect(player1).approve(stakingAddress, stakeAmount, { gasLimit: 300000 });
  await txApprove.wait();

  const newBalance = await token.balanceOf(player1.address);
  const allowance = await token.allowance(player1.address, stakingAddress);
  console.log("Final token balance:", ethers.formatEther(newBalance));
  console.log("Staking allowance:", ethers.formatEther(allowance));

  // Basename setup
  console.log("\n=== BASENAME SETUP ===");
  const basename = "player1.base.eth";
  const basenameNode = calculateBasenameNode(basename);
  console.log("Basename:", basename);
  console.log("Script basenameNode:", basenameNode);
  console.log("Contract basenameNode:", await resolver.namehash(basenameNode));

  // Set and verify Basename resolution with retry
  console.log("Setting up basename resolution...");
  for (let i = 0; i < 3; i++) {
    await resolver.connect(owner).setResolvedAddress(basenameNode, player1.address, { gasLimit: 300000 });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for network
    const resolvedAddress = await resolver.resolve(basenameNode);
    if (resolvedAddress === player1.address) {
      console.log("Basename setup successful");
      break;
    }
    console.log(`Attempt ${i + 1} failed, retrying...`);
    if (i === 2) throw new Error(`Basename ${basename} does not resolve to ${player1.address} after 3 attempts`);
  }

  // Signature generation
  console.log("\n=== SIGNATURE VERIFICATION ===");
  const signature = await generateSignature(backendSigner, player1.address, basename, gameId);
  console.log("Generated signature:", signature);

  // Verify signature directly using contract's method
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "string", "uint256"],
    [player1.address, basename, gameId]
  );
  const messageHash = ethers.keccak256(encodedData);
  const isValid = await game.verify(backendSigner.address, messageHash, signature);
  console.log("Signature verification result:", isValid);
  if (!isValid) {
    throw new Error("Signature verification failed! Cannot proceed.");
  }

  // Player join game
  console.log("\n=== JOIN GAME ===");
  const alreadyJoined = await game.isPlayerInGame(gameId, player1.address);
  console.log("Player already joined:", alreadyJoined);

  if (alreadyJoined) {
    console.log("Player has already joined this game.");
    return;
  }

  try {
    // Explicitly check each requirement separately
    const gameExists = gameInfo[0] !== ethers.ZeroAddress;
    const gameEnded = gameInfo[4];
    const hasBalance = (await token.balanceOf(player1.address)) >= stakeAmount;
    const hasAllowance = (await token.allowance(player1.address, stakingAddress)) >= stakeAmount;

    console.log("Requirements check:");
    console.log("- Game exists:", gameExists);
    console.log("- Game NOT ended:", !gameEnded);
    console.log("- Has sufficient balance:", hasBalance);
    console.log("- Has sufficient allowance:", hasAllowance);
    console.log("- Valid signature:", isValid);
    console.log("- Basename resolves correctly:", (await resolver.resolve(basenameNode)) === player1.address);

    // Try joining game with extra gas
    console.log("Joining game...");
    const txJoin = await game.connect(player1).joinGame(
      gameId,
      basename,
      signature,
      {
        gasLimit: 1500000,
        gasPrice: (await ethers.provider.getFeeData()).gasPrice * 2n
      }
    );

    console.log("Transaction sent:", txJoin.hash);
    const receiptJoin = await txJoin.wait();
    console.log("Player joined game! Tx:", receiptJoin.hash);

    // Verify player joined
    const nowJoined = await game.isPlayerInGame(gameId, player1.address);
    console.log("Player is now in game:", nowJoined);

  } catch (error) {
    console.error("Error joining game:", error);

    // Detailed error analysis
    console.log("\n=== ERROR ANALYSIS ===");
    if (error.transaction) {
      console.log("Transaction details:");
      console.log("- From:", error.transaction.from);
      console.log("- To:", error.transaction.to);
      console.log("- Data:", error.transaction.data?.substring(0, 66) + "...");
      console.log("- Value:", error.transaction.value?.toString() || "0");
    }

    if (error.receipt) {
      console.log("Transaction was mined but failed:");
      console.log("- Gas used:", error.receipt.gasUsed?.toString());
      console.log("- Block number:", error.receipt.blockNumber?.toString());
    }

    // Try to get a detailed error by simulating the call
    try {
      console.log("Simulating transaction to get error details...");
      const joinData = game.interface.encodeFunctionData("joinGame", [
        gameId,
        basename,
        signature
      ]);
      await ethers.provider.call({
        to: gameAddress,
        from: player1.address,
        data: joinData
      });
    } catch (callError) {
      console.log("Simulation failed (expected)");
      if (callError.data) {
        try {
          const errorSelector = callError.data.substring(0, 10);
          const errorData = "0x" + callError.data.substring(10);
          console.log("Error selector:", errorSelector);
          try {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], errorData);
            console.log("Error message:", decoded[0]);
          } catch (decodeError) {
            console.log("Could not decode as string error");
          }
        } catch (e) {
          console.log("Could not parse error data");
        }
      } else if (callError.message) {
        const match = callError.message.match(/reverted with reason string '([^']+)'/);
        if (match) {
          console.log("Extracted error reason:", match[1]);
        } else {
          console.log("Error message:", callError.message);
        }
      }
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});