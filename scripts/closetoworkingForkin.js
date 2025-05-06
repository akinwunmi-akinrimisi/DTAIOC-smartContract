const { ethers, network } = require("hardhat");

async function main() {
  console.log("Forking Base Sepolia network...");

  // Reset Hardhat network to ensure clean state
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: "https://sepolia.base.org",
        },
      },
    ],
  });

  // Contract addresses
  const tokenAddress = "0x6ED212b0931940ed1941F84d7bB52b7D58959E0A";
  const nftAddress = "0xc4D41b5bD8a4c95622a9C5a37Ca6a786e913D88C";
  const stakingAddress = "0xDfD4D8bdd785BF87A983E49126fE0aC00C887Bda";
  const resolverAddress = "0xD4ed09bA220Eb3325edAD041909e6B1c1ee75Af5";
  const gameAddress = "0x666F33EbFb6eAf802228D27CbEaE23EC2E943D18";

  // Get contracts
  const token = await ethers.getContractAt("DTAIOCToken", tokenAddress);
  const nft = await ethers.getContractAt("DTAIOCNFT", nftAddress);
  const staking = await ethers.getContractAt("DTAIOCStaking", stakingAddress);
  const resolver = await ethers.getContractAt("MockBasenameResolver", resolverAddress);
  const game = await ethers.getContractAt("DTAIOCGame", gameAddress);

  // Impersonate accounts
  const owner = await ethers.getImpersonatedSigner("0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845");
  const player1 = await ethers.getImpersonatedSigner("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  const player2 = await ethers.getImpersonatedSigner("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");

  // Fund impersonated accounts with ETH for gas
  const funder = (await ethers.getSigners())[0];
  await funder.sendTransaction({
    to: owner.address,
    value: ethers.parseEther("1"),
  });
  await funder.sendTransaction({
    to: player1.address,
    value: ethers.parseEther("1"),
  });
  await funder.sendTransaction({
    to: player2.address,
    value: ethers.parseEther("1"),
  });

  // Check initial token balances
  console.log("Checking initial token balances...");
  const player1InitialBalance = await token.balanceOf(player1.address);
  const player2InitialBalance = await token.balanceOf(player2.address);
  console.log("Player1 initial balance:", ethers.formatEther(player1InitialBalance));
  console.log("Player2 initial balance:", ethers.formatEther(player2InitialBalance));

  // Setup Basename
  console.log("Setting up Basename...");
  await resolver.connect(owner).setResolvedAddress(ethers.namehash("creator.base.eth"), owner.address, { gasLimit: 300000 });
  console.log("Basename set: creator.base.eth ->", owner.address);
  console.log("Verifying Basename:", await resolver.resolve(ethers.namehash("creator.base.eth")));

  // Get current game counter
  const gameCounter = await game.gameCounter();
  const gameId = Number(gameCounter) + 1;
  console.log("Next game ID:", gameId);

  // Create game
  console.log("Creating game...");
  const txCreate = await game.connect(owner).createGame(ethers.namehash("creator.base.eth"), { gasLimit: 500000 });
  await txCreate.wait();
  console.log(`Game created: ID ${gameId}`);

  // Mint tokens and approve staking for players
  const stakeAmount = ethers.parseEther("10");
  console.log("Minting tokens for players...");
  await token.connect(player1).mint(stakeAmount, { gasLimit: 300000 });
  await token.connect(player2).mint(stakeAmount, { gasLimit: 300000 });
  await token.connect(player1).approve(stakingAddress, stakeAmount, { gasLimit: 300000 });
  await token.connect(player2).approve(stakingAddress, stakeAmount, { gasLimit: 300000 });
  console.log("Tokens minted and approved");

  // Check balances after minting
  console.log("Balances after minting:");
  console.log("Player1:", ethers.formatEther(await token.balanceOf(player1.address)));
  console.log("Player2:", ethers.formatEther(await token.balanceOf(player2.address)));
  console.log("Staking contract:", ethers.formatEther(await token.balanceOf(stakingAddress)));

  // Players join game
  console.log("Players joining game...");
  await game.connect(player1).joinGame(gameId, { gasLimit: 500000 });
  await game.connect(player2).joinGame(gameId, { gasLimit: 500000 });
  console.log("Players joined: ", player1.address, player2.address);

  // Check balances after joining
  console.log("Balances after joining:");
  console.log("Player1:", ethers.formatEther(await token.balanceOf(player1.address)));
  console.log("Player2:", ethers.formatEther(await token.balanceOf(player2.address)));
  console.log("Staking contract:", ethers.formatEther(await token.balanceOf(stakingAddress)));

  // Advance to Stage 2
  console.log("Advancing to Stage 2...");
  await game.connect(owner).advanceStage(gameId, { gasLimit: 300000 });
  console.log("Stage advanced to 2");

  // Refund player2
  console.log("Refunding player2...");
  await game.connect(owner).refundPlayer(gameId, player2.address, { gasLimit: 300000 });
  console.log("Player2 refunded: 3 tokens (7 forfeited)");

  // Check balances after refund
  console.log("Balances after refund:");
  console.log("Creator:", ethers.formatEther(await token.balanceOf(owner.address)));
  console.log("Platform:", ethers.formatEther(await token.balanceOf("0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB")));
  console.log("Player1:", ethers.formatEther(await token.balanceOf(player1.address)));
  console.log("Player2:", ethers.formatEther(await token.balanceOf(player2.address)));
  console.log("Staking contract:", ethers.formatEther(await token.balanceOf(stakingAddress)));

  // End game and mint NFTs
  console.log("Ending game...");
  const winners = [player1.address, player1.address, player1.address];
  const txEnd = await game.connect(owner).endGame(gameId, winners, { gasLimit: 1000000 });
  const receiptEnd = await txEnd.wait();
  console.log("Game ended, NFTs minted");

  // Parse token Transfer events to debug rewards
  console.log("Fetching token transfers during endGame...");
  const tokenTransferEvents = receiptEnd.logs
    .filter(log => log.address === tokenAddress)
    .map(log => token.interface.parseLog(log))
    .filter(event => event.name === "Transfer");
  tokenTransferEvents.forEach(event => {
    console.log(`Token Transfer: ${ethers.formatEther(event.args.value)} tokens from ${event.args.from} to ${event.args.to}`);
  });

  // Parse NFT Transfer events to get minted NFT tokenIds
  console.log("Fetching minted NFT tokenIds...");
  const nftTransferEvents = receiptEnd.logs
    .filter(log => log.address === nftAddress)
    .map(log => nft.interface.parseLog(log))
    .filter(event => event.name === "Transfer");
  const tokenIds = nftTransferEvents.map(event => event.args.tokenId.toString());
  console.log("Minted NFT tokenIds:", tokenIds);

  // Verify NFTs
  console.log("Verifying NFTs...");
  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    console.log(`NFT ${tokenId} owner:`, await nft.ownerOf(tokenId), "(Expected:", player1.address, ")");
    if (i === 0) console.log(`NFT ${tokenId} URI:`, await nft.tokenURI(tokenId));
  }

  // Verify rewards, adjusting for initial balances
  console.log("Verifying rewards...");
  const player1FinalBalance = await token.balanceOf(player1.address);
  const player2FinalBalance = await token.balanceOf(player2.address);
  const expectedPlayer1Balance = player1InitialBalance.add(ethers.parseEther("12.8"));
  const expectedPlayer2Balance = player2InitialBalance.add(ethers.parseEther("3"));
  console.log("Creator balance:", ethers.formatEther(await token.balanceOf(owner.address)), "tokens (Expected: 1.4)");
  console.log("Platform balance:", ethers.formatEther(await token.balanceOf("0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB")), "tokens (Expected: 1.4)");
  console.log("Player1 balance:", ethers.formatEther(player1FinalBalance), "tokens (Expected:", ethers.formatEther(expectedPlayer1Balance), ")");
  console.log("Player2 balance:", ethers.formatEther(player2FinalBalance), "tokens (Expected:", ethers.formatEther(expectedPlayer2Balance), ")");
  console.log("Staking contract:", ethers.formatEther(await token.balanceOf(stakingAddress)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});