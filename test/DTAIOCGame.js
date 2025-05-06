const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCGame", function () {
  let DTAIOCToken, DTAIOCNFT, DTAIOCStaking, DTAIOCGame, token, nft, staking, game, owner, creator, player1, player2, player3, platform, backendSigner;
  let basenameResolver;
  const stakeAmount = ethers.parseEther("10");
  const tokenURI = "ipfs://bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i";
  
  // In Ethers v6, use ethers.hashMessage for namehash equivalent functions
  const creatorBasenameNode = ethers.keccak256(ethers.toUtf8Bytes("creator.base.eth"));
  const player1Basename = "player1.base.eth";
  const player2Basename = "player2.base.eth";
  const player3Basename = "player3.base.eth";

  // This is a key example of how the signature should be generated
  // Use this format for the signature verification
  async function generateSignature(signer, playerAddress, basename, gameId) {
    // Use the same encoding method as in the contract
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "string", "uint256"],
        [playerAddress, basename, gameId]
      )
    );
    
    // Sign the message - this automatically prefixes with EIP-191 
    return await signer.signMessage(ethers.getBytes(messageHash));
  }

  beforeEach(async function () {
    [owner, creator, player1, player2, player3, platform, backendSigner] = await ethers.getSigners();

    // Deploy MockBasenameResolver
    const MockBasenameResolver = await ethers.getContractFactory("MockBasenameResolver");
    basenameResolver = await MockBasenameResolver.deploy();
    await basenameResolver.waitForDeployment();
    
    // Set resolved addresses
    await basenameResolver.setResolvedAddress(creatorBasenameNode, creator.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player1Basename)), player1.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player2Basename)), player2.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player3Basename)), player3.address);

    // Deploy DTAIOCToken
    DTAIOCToken = await ethers.getContractFactory("DTAIOCToken");
    token = await DTAIOCToken.deploy();
    await token.waitForDeployment();

    // Deploy DTAIOCNFT
    DTAIOCNFT = await ethers.getContractFactory("DTAIOCNFT");
    nft = await DTAIOCNFT.deploy();
    await nft.waitForDeployment();

    // Deploy DTAIOCStaking
    DTAIOCStaking = await ethers.getContractFactory("DTAIOCStaking");
    staking = await DTAIOCStaking.deploy(await token.getAddress(), platform.address);
    await staking.waitForDeployment();

    // Deploy DTAIOCGame
    DTAIOCGame = await ethers.getContractFactory("DTAIOCGame");
    game = await DTAIOCGame.deploy(
      await token.getAddress(), 
      await nft.getAddress(), 
      await staking.getAddress(), 
      await basenameResolver.getAddress(), 
      backendSigner.address
    );
    await game.waitForDeployment();

    // Configure permissions
    await nft.setGameContract(await game.getAddress());
    await staking.setGameContract(await game.getAddress());

    // Mint tokens and approve staking
    for (const player of [player1, player2, player3]) {
      await token.connect(player).mint(stakeAmount);
      await token.connect(player).approve(await staking.getAddress(), stakeAmount);
    }
  });

  it("Should have correct initial setup", async function () {
    expect(await game.token()).to.equal(await token.getAddress());
    expect(await game.nft()).to.equal(await nft.getAddress());
    expect(await game.staking()).to.equal(await staking.getAddress());
    expect(await game.basenameResolver()).to.equal(await basenameResolver.getAddress());
    expect(await game.backendSigner()).to.equal(backendSigner.address);
    expect(await game.gameCounter()).to.equal(0);
    expect(await game.STAKE_AMOUNT()).to.equal(stakeAmount);
    expect(await game.NFT_TOKEN_URI()).to.equal(tokenURI);
    expect(await game.owner()).to.equal(owner.address);
  });

  it("Should allow creator with Basename to create game", async function () {
    const tx = await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await expect(tx).to.emit(game, "GameCreated").withArgs(gameId, creator.address, creatorBasenameNode);
  
    // Updated to properly access game data through the public getter function
    const gameData = await game.games(gameId);
    expect(gameData[0]).to.equal(creator.address); // creator
    expect(gameData[1]).to.equal(creatorBasenameNode); // basenameNode
    expect(gameData[2]).to.equal(1n); // stage
    expect(gameData[3]).to.equal(0n); // playerCount
    expect(gameData[4]).to.equal(false); // ended
  });

  it("Should revert game creation without valid Basename", async function () {
    await expect(
      game.connect(player1).createGame(creatorBasenameNode)
    ).to.be.revertedWith("Caller does not own Basename");
  });

  it("Should allow players to join game with valid Basename and signature", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;

    const signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    const tx = await game.connect(player1).joinGame(gameId, player1Basename, signature);
    
    // Check that the player joined successfully
    const gameData = await game.games(gameId);
    expect(gameData.playerCount).to.equal(1n);
    
    // Check player stake
    expect(await staking.playerStakes(gameId, player1.address)).to.equal(stakeAmount);
    
    // Check player token balance (should be 0 after staking)
    expect(await token.balanceOf(player1.address)).to.equal(0);
    
    // In Ethers v6, we might need to check player data differently if it's a nested struct
    // This depends on how your smart contract exposes player data
  });

  it("Should revert joining with invalid Basename", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;

    const signature = await generateSignature(backendSigner, player1.address, player2Basename, gameId);
    await expect(
      game.connect(player1).joinGame(gameId, player2Basename, signature)
    ).to.be.revertedWith("Basename does not resolve to caller");
  });

  it("Should revert joining with invalid signature", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;

    const wrongSigner = owner;
    const signature = await generateSignature(wrongSigner, player1.address, player1Basename, gameId);
    await expect(
      game.connect(player1).joinGame(gameId, player1Basename, signature)
    ).to.be.revertedWith("Invalid signature");
  });

  it("Should revert joining non-existent game", async function () {
    const signature = await generateSignature(backendSigner, player1.address, player1Basename, 1);
    await expect(
      game.connect(player1).joinGame(1, player1Basename, signature)
    ).to.be.revertedWith("Game does not exist");
  });

  it("Should revert joining ended game", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    let signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await game.connect(player1).joinGame(gameId, player1Basename, signature);
    signature = await generateSignature(backendSigner, player2.address, player2Basename, gameId);
    await game.connect(player2).joinGame(gameId, player2Basename, signature);
    await game.advanceStage(gameId); // Stage 2
    await game.refundPlayer(gameId, player2.address); // Create forfeited stakes
    await game.endGame(gameId, [player1.address, player1.address, player1.address]);

    signature = await generateSignature(backendSigner, player3.address, player3Basename, gameId);
    await expect(
      game.connect(player3).joinGame(gameId, player3Basename, signature)
    ).to.be.revertedWith("Game has ended");
  });

  it("Should revert joining with insufficient balance", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await token.connect(player1).transfer(player2.address, stakeAmount); // Clear player1 balance

    const signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await expect(
      game.connect(player1).joinGame(gameId, player1Basename, signature)
    ).to.be.revertedWith("Insufficient balance");
  });

  it("Should revert joining with insufficient allowance", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await token.connect(player1).approve(await staking.getAddress(), 0); // Revoke allowance

    const signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await expect(
      game.connect(player1).joinGame(gameId, player1Basename, signature)
    ).to.be.revertedWith("Insufficient allowance");
  });

  it("Should revert joining twice", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    let signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await game.connect(player1).joinGame(gameId, player1Basename, signature);

    signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await expect(
      game.connect(player1).joinGame(gameId, player1Basename, signature)
    ).to.be.revertedWith("Player already joined");
  });

  it("Should allow owner to advance stage", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    const tx = await game.advanceStage(gameId);
    await expect(tx).to.emit(game, "StageAdvanced").withArgs(gameId, 2);
  
    // Updated to properly access game data through the public getter function
    const gameData = await game.games(gameId);
    expect(gameData[2]).to.equal(2n); // stage
  });

  it("Should revert advanceStage by non-owner", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await expect(
      game.connect(player1).advanceStage(gameId)
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
  });

  it("Should revert advanceStage for non-existent game", async function () {
    await expect(
      game.advanceStage(1)
    ).to.be.revertedWith("Game does not exist");
  });

  it("Should revert advanceStage for ended game", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    let signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await game.connect(player1).joinGame(gameId, player1Basename, signature);
    signature = await generateSignature(backendSigner, player2.address, player2Basename, gameId);
    await game.connect(player2).joinGame(gameId, player2Basename, signature);
    await game.advanceStage(gameId); // Stage 2
    await game.refundPlayer(gameId, player2.address); // Create forfeited stakes
    await game.endGame(gameId, [player1.address, player1.address, player1.address]);

    await expect(
      game.advanceStage(gameId)
    ).to.be.revertedWith("Game has ended");
  });

  it("Should revert advanceStage at final stage", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await game.advanceStage(gameId); // Stage 2
    await game.advanceStage(gameId); // Stage 3
    await game.advanceStage(gameId); // Stage 4

    await expect(
      game.advanceStage(gameId)
    ).to.be.revertedWith("Game at final stage");
  });

  it("Should allow owner to refund player", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    const signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await game.connect(player1).joinGame(gameId, player1Basename, signature);
    await game.advanceStage(gameId); // Stage 2: 30% refund
  
    const tx = await game.refundPlayer(gameId, player1.address);
    await expect(tx).to.emit(game, "PlayerRefunded").withArgs(gameId, player1.address, 2);
  
    // Updated to properly access game data through the public getter function
    const gameData = await game.games(gameId);
    expect(gameData[3]).to.equal(0n); // playerCount
    
    // Check refund amount (30% of stake)
    expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("3"));
  });

  it("Should revert refund for non-existent game", async function () {
    await expect(
      game.refundPlayer(1, player1.address)
    ).to.be.revertedWith("Game does not exist");
  });

  it("Should revert refund for non-player", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await expect(
      game.refundPlayer(gameId, player1.address)
    ).to.be.revertedWith("Player not in game");
  });

  it("Should allow owner to end game and distribute rewards/NFTs", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    
    // Optimize by using Promise.all to run transactions in parallel
    const [sig1, sig2, sig3] = await Promise.all([
      generateSignature(backendSigner, player1.address, player1Basename, gameId),
      generateSignature(backendSigner, player2.address, player2Basename, gameId),
      generateSignature(backendSigner, player3.address, player3Basename, gameId)
    ]);
    
    // Need to keep these sequential as they modify the same state
    await game.connect(player1).joinGame(gameId, player1Basename, sig1);
    await game.connect(player2).joinGame(gameId, player2Basename, sig2);
    await game.connect(player3).joinGame(gameId, player3Basename, sig3);
    await game.advanceStage(gameId); // Stage 2
    await game.refundPlayer(gameId, player3.address); // Forfeits 7 tokens
  
    const winners = [player1.address, player2.address, player1.address];
    const tx = await game.endGame(gameId, winners);
    await expect(tx).to.emit(game, "GameEnded").withArgs(gameId, winners);
  
    // Check results (NFTs and token balances)
    const [nft1Owner, nft2Owner, nft3Owner, nft1URI, 
           creatorBalance, platformBalance, player1Balance, player2Balance] = await Promise.all([
      nft.ownerOf(1),
      nft.ownerOf(2),
      nft.ownerOf(3),
      nft.tokenURI(1),
      token.balanceOf(creator.address),
      token.balanceOf(platform.address),
      token.balanceOf(player1.address),
      token.balanceOf(player2.address)
    ]);
  
    // Assert results
    expect(nft1Owner).to.equal(player1.address);
    expect(nft2Owner).to.equal(player2.address);
    expect(nft3Owner).to.equal(player1.address);
    expect(nft1URI).to.equal(tokenURI);
    expect(creatorBalance).to.equal(ethers.parseEther("1.4"));
    expect(platformBalance).to.equal(ethers.parseEther("1.4"));
    expect(player1Balance).to.equal(ethers.parseEther("12.8"));
    expect(player2Balance).to.equal(ethers.parseEther("11.4"));
  });

  it("Should allow owner to end game with no forfeited stakes", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    let signature = await generateSignature(backendSigner, player1.address, player1Basename, gameId);
    await game.connect(player1).joinGame(gameId, player1Basename, signature);
    signature = await generateSignature(backendSigner, player2.address, player2Basename, gameId);
    await game.connect(player2).joinGame(gameId, player2Basename, signature);

    const winners = [player1.address, player2.address, player1.address];
    const tx = await game.endGame(gameId, winners);
    await expect(tx).to.emit(game, "GameEnded").withArgs(gameId, winners);

    // Check NFTs
    expect(await nft.ownerOf(1)).to.equal(player1.address);
    expect(await nft.ownerOf(2)).to.equal(player2.address);
    expect(await nft.ownerOf(3)).to.equal(player1.address);
    expect(await nft.tokenURI(1)).to.equal(tokenURI);

    // No rewards distributed
    expect(await token.balanceOf(creator.address)).to.equal(0);
    expect(await token.balanceOf(platform.address)).to.equal(0);
    expect(await token.balanceOf(player1.address)).to.equal(0);
    expect(await token.balanceOf(player2.address)).to.equal(0);
  });

  it("Should revert endGame by non-owner", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await expect(
      game.connect(player1).endGame(gameId, [player1.address, player1.address, player1.address])
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
  });

  it("Should revert endGame for non-existent game", async function () {
    await expect(
      game.endGame(1, [player1.address, player1.address, player1.address])
    ).to.be.revertedWith("Game does not exist");
  });

  it("Should revert endGame for already ended game", async function () {
    // Increase timeout to 60 seconds for this test
    this.timeout(60000);
  
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    
    // Optimize by using Promise.all to run signature generations in parallel
    const [sig1, sig2] = await Promise.all([
      generateSignature(backendSigner, player1.address, player1Basename, gameId),
      generateSignature(backendSigner, player2.address, player2Basename, gameId)
    ]);
    
    // These operations modify state and need to be sequential
    await game.connect(player1).joinGame(gameId, player1Basename, sig1);
    await game.connect(player2).joinGame(gameId, player2Basename, sig2);
    await game.advanceStage(gameId); // Stage 2
    await game.refundPlayer(gameId, player2.address); // Create forfeited stakes
    
    // First end the game
    const winners = [player1.address, player1.address, player1.address];
    await game.endGame(gameId, winners);
    
    // Then try to end it again and expect it to revert
    await expect(
      game.endGame(gameId, winners)
    ).to.be.revertedWith("Game already ended");
  }).timeout(60000); // Alternative way to set the timeout

  it("Should revert endGame with invalid winners length", async function () {
    await game.connect(creator).createGame(creatorBasenameNode);
    const gameId = 1;
    await expect(
      game.endGame(gameId, [player1.address])
    ).to.be.revertedWith("Must provide 3 winners");
  });

  it("Should allow owner to update backend signer", async function () {
    const newSigner = player3.address;
    await game.setBackendSigner(newSigner);
    expect(await game.backendSigner()).to.equal(newSigner);
  });

  it("Should revert setBackendSigner by non-owner", async function () {
    await expect(
      game.connect(player1).setBackendSigner(player3.address)
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
  });

  it("Should revert setBackendSigner with zero address", async function () {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    await expect(
      game.setBackendSigner(ZERO_ADDRESS)
    ).to.be.revertedWith("Invalid backend signer address");
  });
});